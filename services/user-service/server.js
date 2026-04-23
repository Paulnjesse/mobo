require('./src/tracing');
require('dotenv').config();
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  enabled: !!process.env.SENTRY_DSN,
  beforeSend(event) {
    // Strip sensitive headers from error reports
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },
});

// Guard: prevent production startup with default or missing JWT secret
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'mobo_jwt_secret_change_in_production') {
    console.error('[FATAL] JWT_SECRET must be set to a strong secret in production. Refusing to start.');
    process.exit(1);
  }
}

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const db = require('./src/config/database');
const { startExpiryAlertJob } = require('./src/jobs/expiryAlertJob');

const authRoutes = require('./src/routes/auth');
const profileRoutes = require('./src/routes/profile');
const fleetRoutes = require('./src/routes/fleet');
const socialRoutes = require('./src/routes/social');
const adminMgmtRoutes  = require('./src/routes/adminManagement');
const adminDataRoutes  = require('./src/routes/adminData');
const adminRoutes      = require('./src/routes/admin');
const requestId = require('./src/middleware/requestId');

const app = express();

// Gzip/Brotli compression — reduces JSON payloads ~70% on slow 3G connections
app.use(compression({ threshold: 512 })); // only compress responses > 512 bytes
app.use(requestId);
app.use(Sentry.Handlers.requestHandler());
const PORT = process.env.PORT || 3001;
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'mobo-user-service';

// Restrict CORS to known origins
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'exp://localhost:8081'];

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], formAction: ["'none'"] },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: false,
}));
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
// 2mb limit: profile photos are base64-encoded (adds ~33% overhead over raw JPEG)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
const logger = require('./src/utils/logger');
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// Rate limiting
const isTest = process.env.NODE_ENV === 'test';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: () => isTest,
  message: { success: false, message: 'Too many authentication attempts.' }
});

// ── Twilio SMS status webhook (public — called by Twilio, not by clients) ────
// Twilio sends delivery status callbacks (delivered / failed / undelivered) as
// application/x-www-form-urlencoded POST requests, signed with your auth token.
// Signature is verified using twilio.validateRequest() to prevent spoofing.
app.post('/webhooks/twilio/status', express.urlencoded({ extended: false }), (req, res) => {
  const twilioAuthToken  = process.env.TWILIO_AUTH_TOKEN;
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;

  // Only validate signature when Twilio is configured with real credentials
  if (twilioAuthToken && twilioAccountSid && twilioAccountSid.startsWith('AC')) {
    try {
      const twilio    = require('twilio');
      const signature = req.headers['x-twilio-signature'] || '';
      // Construct the full URL Twilio used to call this endpoint
      const protocol  = req.headers['x-forwarded-proto'] || req.protocol;
      const webhookUrl = `${protocol}://${req.headers.host}${req.originalUrl}`;
      const valid = twilio.validateRequest(twilioAuthToken, signature, webhookUrl, req.body);
      if (!valid) {
        const log = require('./src/utils/logger');
        log.warn({ ip: req.ip }, '[Twilio webhook] Invalid signature — request rejected');
        return res.status(403).send('Forbidden');
      }
    } catch (err) {
      const log = require('./src/utils/logger');
      log.error({ err }, '[Twilio webhook] Signature validation error');
      return res.status(500).send('Internal error');
    }
  }

  // Log delivery status for observability; non-critical so we never block OTPs on this
  const log = require('./src/utils/logger');
  log.info({
    messageSid: req.body.MessageSid,
    status:     req.body.MessageStatus,
    to:         req.body.To ? req.body.To.replace(/\d(?=\d{4})/g, '*') : undefined,
    errorCode:  req.body.ErrorCode,
  }, '[Twilio webhook] SMS delivery status');

  // Twilio expects a 200 TwiML or empty response
  res.status(200).set('Content-Type', 'text/xml').send('<Response/>');
});

// Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/users', profileRoutes);
app.use('/fleet', fleetRoutes);
app.use('/social', socialRoutes);
app.use('/admin',            adminRoutes);
app.use('/admin/admin-mgmt', adminMgmtRoutes);
app.use('/admin/admin-data', adminDataRoutes);

// Prometheus metrics — restricted to internal scraper IPs only
const promClient = require('prom-client');
const promRegister = new promClient.Registry();
promClient.collectDefaultMetrics({ register: promRegister });
const METRICS_ALLOWED_IPS = (process.env.METRICS_ALLOWED_IPS || '127.0.0.1,::1,::ffff:127.0.0.1').split(',').map(s => s.trim());
app.get('/metrics', async (req, res) => {
  const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || '';
  if (!METRICS_ALLOWED_IPS.includes(clientIp)) {
    return res.status(403).end('Forbidden');
  }
  try {
    res.set('Content-Type', promRegister.contentType);
    res.end(await promRegister.metrics());
  } catch (e) {
    res.status(500).end(e.message);
  }
});

// Health check
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const db = require('./src/config/database');
    await db.query('SELECT 1');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error: ' + e.message.substring(0, 80);
  }
  res.json({
    success: true,
    service: 'mobo-user-service',
    version: '1.0.0',
    status: 'healthy',
    db: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use(Sentry.Handlers.errorHandler());
const globalErrorHandler = require('./src/middleware/errorHandler');
app.use(globalErrorHandler);

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    logger.info(`[MOBO User Service] Running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
    startExpiryAlertJob(db);
  });
  const _shutdown = (signal) => {
    logger.info(`${process.env.SERVICE_NAME} ${signal} — graceful shutdown started`);
    server.close(() => {
      logger.info(`${process.env.SERVICE_NAME} HTTP server closed`);
      process.exit(0);
    });
    setTimeout(() => { logger.error(`${process.env.SERVICE_NAME} forced shutdown`); process.exit(1); }, 30000).unref();
  };
  process.on('SIGTERM', () => _shutdown('SIGTERM'));
  process.on('SIGINT',  () => _shutdown('SIGINT'));
}

module.exports = app;
