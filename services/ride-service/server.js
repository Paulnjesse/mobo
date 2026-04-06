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

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'mobo_jwt_secret_change_in_production') {
    console.error('[FATAL] JWT_SECRET must be set to a strong secret in production. Refusing to start.');
    process.exit(1);
  }
}

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const rideRoutes = require('./src/routes/rides');
const adsRoutes  = require('./src/routes/ads');
const foodRoutes = require('./src/routes/food');
const { initRideSocket } = require('./src/socket/rideSocket');
const { startEscalationJob } = require('./src/jobs/escalationJob');
const { startScheduledRideJob } = require('./src/jobs/scheduledRideJob');
const requestId = require('./src/middleware/requestId');

const app = express();
app.use(requestId);
app.use(Sentry.Handlers.requestHandler());
const PORT = process.env.PORT || 3002;
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'mobo-ride-service';

// Allowed origins for CORS and Socket.IO
const CORS_ORIGINS = process.env.SOCKET_CORS_ORIGIN
  ? process.env.SOCKET_CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'exp://localhost:8081'];

app.use(helmet());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const logger = require('./src/utils/logger');
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Routes
app.use('/ads',   adsRoutes);
app.use('/food',  foodRoutes);
app.use('/rides', rideRoutes);
app.use('/ride', rideRoutes);
app.use('/fare', rideRoutes);

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
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'mobo-ride-service',
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

// Create underlying HTTP server so Socket.IO shares the same port
const httpServer = http.createServer(app);

// Attach Socket.IO to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Allow both WebSocket and long-polling transports for compatibility
  transports: ['websocket', 'polling'],
  // Reconnection ping settings
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialise the /rides namespace with all ride event handlers
const ridesNamespace = initRideSocket(io);

// Expose io on app so route handlers can emit socket events
app.set('io', io);

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    logger.info(`[MOBO Ride Service] HTTP + Socket.IO running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
    startEscalationJob();
    startScheduledRideJob(io);  // Feature 29: scheduled ride reminders + auto-dispatch
  });
  const _shutdown = (signal) => {
    logger.info(`${process.env.SERVICE_NAME} ${signal} — graceful shutdown started`);
    httpServer.close(() => {
      logger.info(`${process.env.SERVICE_NAME} HTTP server closed`);
      process.exit(0);
    });
    setTimeout(() => { logger.error(`${process.env.SERVICE_NAME} forced shutdown`); process.exit(1); }, 30000).unref();
  };
  process.on('SIGTERM', () => _shutdown('SIGTERM'));
  process.on('SIGINT',  () => _shutdown('SIGINT'));
}

module.exports = app;
