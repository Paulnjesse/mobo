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
const requestId = require('./src/middleware/requestId');

const app = express();
app.use(requestId);
app.use(Sentry.Handlers.requestHandler());
const PORT = process.env.PORT || 3001;
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'mobo-user-service';

// Restrict CORS to known origins
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'exp://localhost:8081'];

// Security middleware
app.use(helmet());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const logger = require('./src/utils/logger');
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many authentication attempts.' }
});

// Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/users', profileRoutes);
app.use('/fleet', fleetRoutes);
app.use('/social', socialRoutes);

// Prometheus metrics
const promClient = require('prom-client');
const promRegister = new promClient.Registry();
promClient.collectDefaultMetrics({ register: promRegister });
app.get('/metrics', async (req, res) => {
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
const { errorHandler } = require('./src/utils/response');
app.use(errorHandler);

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
