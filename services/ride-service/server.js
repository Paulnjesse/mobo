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
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const rideRoutes      = require('./src/routes/rides');
const adsRoutes       = require('./src/routes/ads');
const foodRoutes      = require('./src/routes/food');
const adminRideRoutes = require('./src/routes/adminRides');
const { initRideSocket }              = require('./src/socket/rideSocket');
const { initDeliverySocket }          = require('./src/socket/deliverySocket');
const { startEscalationJob }          = require('./src/jobs/escalationJob');
const { startScheduledRideJob }       = require('./src/jobs/scheduledRideJob');
const { startDeliverySchedulerJob }   = require('./src/jobs/deliverySchedulerJob');
const { startMessagePurgeJob }        = require('./src/jobs/messagePurgeJob');
const { startFraudWorker }            = require('./src/queues/fraudWorker');
const requestId = require('./src/middleware/requestId');

const app = express();

// Gzip/Brotli compression — reduces JSON payloads ~70% on slow 3G connections
app.use(compression({ threshold: 512 })); // only compress responses > 512 bytes
app.use(requestId);
app.use(Sentry.Handlers.requestHandler());
const PORT = process.env.PORT || 3002;
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'mobo-ride-service';

// Allowed origins for CORS and Socket.IO
const CORS_ORIGINS = process.env.SOCKET_CORS_ORIGIN
  ? process.env.SOCKET_CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'exp://localhost:8081'];

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
app.use('/ride',  rideRoutes);
app.use('/fare',  rideRoutes);
app.use('/admin', adminRideRoutes);

// Prometheus metrics — restricted to internal scraper IPs only
const promClient = require('prom-client');
const promRegister = new promClient.Registry();
promClient.collectDefaultMetrics({ register: promRegister });

// HTTP request latency histogram (p50 / p95 / p99 SLO tracking)
const { createLatencyHistogram, httpLatencyMiddleware } = require('../shared/latencyMiddleware');
const httpLatencyHistogram = createLatencyHistogram(promRegister, 'mobo-ride-service');
app.use(httpLatencyMiddleware(httpLatencyHistogram));

// Business SLO metrics
const rideCompletionsTotal = new promClient.Counter({
  name: 'ride_completions_total',
  help: 'Total completed rides by payment method',
  labelNames: ['payment_method'],
  registers: [promRegister],
});
const rideRequestsTotal = new promClient.Counter({
  name: 'ride_requests_total',
  help: 'Total ride requests by status outcome',
  labelNames: ['outcome'],
  registers: [promRegister],
});

// Export for use in rideController
app.locals.metrics = { rideCompletionsTotal, rideRequestsTotal };

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
// In production, force WebSocket-only transport.
// See location-service/server.js for full reasoning (sticky sessions + Africa latency).
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: process.env.NODE_ENV === 'production' ? ['websocket'] : ['websocket', 'polling'],
  // Mobile-network tuning (Africa 3G/4G):
  pingTimeout:     120000,
  pingInterval:     25000,
  upgradeTimeout:   15000,
  maxHttpBufferSize: 1e6,
});

/* ── Socket.IO Redis adapter — required for multi-instance broadcasts (Render scales 2–6×) ── */
if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { Redis } = require('ioredis');
    const redisTls = process.env.REDIS_URL.startsWith('rediss://')
      ? { tls: { rejectUnauthorized: true } } : {};
    const pubClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, ...redisTls });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) => logger.warn('[RideService] Redis pubClient error', { err: err.message }));
    subClient.on('error', (err) => logger.warn('[RideService] Redis subClient error', { err: err.message }));
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('[RideService] Socket.IO Redis adapter active — multi-instance broadcasts enabled');
  } catch (err) {
    logger.warn('[RideService] Socket.IO Redis adapter unavailable — single-instance mode only', { err: err.message });
  }
}

// ── Socket.IO reconnection rate limiter (mirrors location-service) ───────────
// Prevents reconnect storms on rolling deploys from overloading a fresh instance.
const RIDE_RATE_WINDOW_MS      = 30_000;
const RIDE_MAX_CONN_PER_WINDOW = 10;
const _rideConnAttempts = new Map();

function isRideConnectionRateLimited(ip) {
  const now    = Date.now();
  const window = now - RIDE_RATE_WINDOW_MS;
  const times  = (_rideConnAttempts.get(ip) || []).filter((t) => t > window);
  if (times.length >= RIDE_MAX_CONN_PER_WINDOW) return true;
  times.push(now);
  _rideConnAttempts.set(ip, times);
  return false;
}

io.use((socket, next) => {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || socket.handshake.address;
  if (isRideConnectionRateLimited(ip)) {
    logger.warn('[RideSocket] Connection rate-limited', { ip });
    return next(new Error('rate_limit_exceeded'));
  }
  next();
});

// Initialise Socket.IO namespaces
const ridesNamespace    = initRideSocket(io);
const deliveriesNamespace = initDeliverySocket(io);

// Expose io on app so route handlers can emit socket events
app.set('io', io);

if (process.env.NODE_ENV !== 'test') {
  // Tune HTTP keep-alive to avoid connection-churn under load.
  // keepAliveTimeout > upstream proxy/load-balancer idle timeout prevents
  // "ECONNRESET on idle connection" errors seen at Uber/Lyft scale.
  httpServer.keepAliveTimeout = 65_000;   // 65 s (> Nginx/Render LB 60 s default)
  httpServer.headersTimeout   = 70_000;   // must be > keepAliveTimeout

  httpServer.listen(PORT, () => {
    logger.info(`[MOBO Ride Service] HTTP + Socket.IO running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
    startEscalationJob();
    startScheduledRideJob(io);
    startDeliverySchedulerJob(io);  // Process scheduled deliveries when their time arrives
    startMessagePurgeJob();          // Nightly GDPR-compliant message TTL purge
    startFraudWorker();              // BullMQ worker: processes collusion + fare fraud jobs from Redis queue
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
