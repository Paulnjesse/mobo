require('./src/tracing');
require('dotenv').config();
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  enabled: !!process.env.SENTRY_DSN,
  /* istanbul ignore next */
  beforeSend(event) {
    // Strip sensitive headers from error reports
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },
});

/* istanbul ignore next */
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

const paymentRoutes = require('./src/routes/payments');
const requestId = require('./src/middleware/requestId');
const { webhookStripe } = require('./src/controllers/paymentController');

const app = express();

// Gzip/Brotli compression — reduces JSON payloads ~70% on slow 3G connections
app.use(compression({ threshold: 512 })); // only compress responses > 512 bytes
app.use(requestId);
app.use(Sentry.Handlers.requestHandler());
const PORT = process.env.PORT || 3003;
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'mobo-payment-service';

// Restrict CORS to known origins — never use wildcard on the payment service
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'exp://localhost:8081'];

// ── Stripe webhook MUST be registered before express.json() ──────────────────
// Stripe signature verification requires the raw request body (Buffer), not the
// parsed JSON object. express.raw() captures it without parsing.
app.post(
  '/payments/webhook/stripe',
  express.raw({ type: 'application/json' }),
  webhookStripe
);

app.use(helmet({
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], formAction: ["'none'"] },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: false,
}));
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
const logger = require('./src/utils/logger');
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Routes
app.use('/payments', paymentRoutes);

// Prometheus metrics — restricted to internal scraper IPs only
const promClient = require('prom-client');
const promRegister = new promClient.Registry();
promClient.collectDefaultMetrics({ register: promRegister });

// Business SLO metrics
const paymentOutcomesTotal = new promClient.Counter({
  name: 'payment_outcomes_total',
  help: 'Payment charge outcomes by provider and result',
  labelNames: ['provider', 'result'],
  registers: [promRegister],
});
const earningsSettlementTotal = new promClient.Counter({
  name: 'earnings_settlement_total',
  help: 'Driver earnings settlement outcomes',
  labelNames: ['result'],
  registers: [promRegister],
});

// Export for use in paymentController
app.locals.metrics = { paymentOutcomesTotal, earningsSettlementTotal };

const METRICS_ALLOWED_IPS = (process.env.METRICS_ALLOWED_IPS || '127.0.0.1,::1,::ffff:127.0.0.1').split(',').map(s => s.trim());
app.get('/metrics', /* istanbul ignore next */ async (req, res) => {
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
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'mobo-payment-service',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
const { errorHandler } = require('./src/utils/response');
app.use(errorHandler);

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  const { startReconciliationJob }     = require('./src/jobs/reconcilePayments');
  const { startFlagStalePaymentsJob }  = require('./src/jobs/flagStalePayments');
  startReconciliationJob();
  startFlagStalePaymentsJob();  // 1-hour cron: flag mobile-money pending > 1h as 'review'

  const server = app.listen(PORT, () => {
    logger.info(`[MOBO Payment Service] Running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
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
