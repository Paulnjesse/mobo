require('./src/tracing');
require('dotenv').config();
const Sentry = require('@sentry/node');
/* istanbul ignore next */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  enabled: !!process.env.SENTRY_DSN,
  /* istanbul ignore next */
  beforeSend(event) {
    // Strip sensitive headers from error reports
    /* istanbul ignore next */
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },
});

/* istanbul ignore next */
if (process.env.NODE_ENV === 'production') {
  /* istanbul ignore next */
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

const locationRoutes = require('./src/routes/location');
const { initLocationSocket } = require('./src/socket/locationSocket');
const requestId = require('./src/middleware/requestId');
const { startLocationPurgeJob } = require('./src/jobs/locationPurgeJob');

const app = express();

// Gzip/Brotli compression — reduces JSON payloads ~70% on slow 3G connections
app.use(compression({ threshold: 512 })); // only compress responses > 512 bytes
app.use(requestId);
app.use(Sentry.Handlers.requestHandler());
const PORT = process.env.PORT || 3004;
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'mobo-location-service';

// Allowed origins for CORS and Socket.IO
const CORS_ORIGINS = process.env.SOCKET_CORS_ORIGIN
  ? /* istanbul ignore next */ process.env.SOCKET_CORS_ORIGIN.split(',').map((o) => o.trim())
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
  windowMs: 60 * 1000,  // 1 minute window for location updates
  max: 300,             // high limit for frequent location pings
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { success: false, message: 'Too many requests' }
});
app.use(limiter);

// Routes
app.use('/', locationRoutes);

// Prometheus metrics — restricted to internal scraper IPs only
const promClient = require('prom-client');
const promRegister = new promClient.Registry();
promClient.collectDefaultMetrics({ register: promRegister });

// HTTP request latency histogram (p50 / p95 / p99 SLO tracking)
const { createLatencyHistogram, httpLatencyMiddleware } = require('../shared/latencyMiddleware');
const httpLatencyHistogram = createLatencyHistogram(promRegister, 'mobo-location-service');
app.use(httpLatencyMiddleware(httpLatencyHistogram));
const METRICS_ALLOWED_IPS = (process.env.METRICS_ALLOWED_IPS || '127.0.0.1,::1,::ffff:127.0.0.1').split(',').map(s => s.trim());
app.get('/metrics', /* istanbul ignore next */ async (req, res) => {
  const clientIp = req.ip || /* istanbul ignore next */ (req.connection && req.connection.remoteAddress) || '';
  if (!METRICS_ALLOWED_IPS.includes(clientIp)) {
    return res.status(403).end('Forbidden');
  }
  try {
    res.set('Content-Type', promRegister.contentType);
    res.end(await promRegister.metrics());
  } catch (e) {
    /* istanbul ignore next */
    res.status(500).end(e.message);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'mobo-location-service',
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
// Reason: Render does not support sticky sessions, so long-polling clients
// hitting a different instance than the one that holds their socket session
// will get dropped and reconnect in a loop. WebSocket is a persistent
// connection so session-affinity is irrelevant after the initial upgrade.
// On degraded African mobile networks clients should reconnect (re-upgrade)
// rather than fall back to polling against a random instance.
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: process.env.NODE_ENV === 'production' ? ['websocket'] : ['websocket', 'polling'],
  // Tuned for mobile networks in Africa:
  //   pingTimeout  120 s — allows for 3G latency spikes without false disconnects
  //   pingInterval  25 s — keeps NAT state alive on carrier-grade NAT
  //   upgradeTimeout 15 s — give slow connections time to complete the WS upgrade
  pingTimeout:     120000,
  pingInterval:     25000,
  upgradeTimeout:   15000,
  // Limit per-message size to guard against memory exhaustion
  maxHttpBufferSize: 1e6, // 1 MB
});

// ── Socket.IO Redis adapter ──────────────────────────────────────────────────
// CRITICAL for multi-instance deployments (Render scales location-service 2–5×).
// Without this adapter every instance holds its own in-memory socket state.
// A rider on instance-A would never receive broadcasts emitted by a driver on
// instance-B.  The adapter routes all io.to(room).emit() calls through Redis
// pub/sub so every instance fans out the event to its locally connected sockets.
//
// Gracefully degrades to single-instance in-memory mode when Redis is absent.
/* istanbul ignore next */
if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  /* istanbul ignore next */
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { Redis }         = require('ioredis');
    const redisTls = process.env.REDIS_URL.startsWith('rediss://')
      ? { tls: { rejectUnauthorized: true } }
      : {};
    const pubClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      ...redisTls,
    });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) =>
      logger.warn('[LocationService] Redis pubClient error — adapter degraded', { err: err.message }));
    subClient.on('error', (err) =>
      logger.warn('[LocationService] Redis subClient error — adapter degraded', { err: err.message }));
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('[LocationService] Socket.IO Redis adapter active — multi-instance broadcasts enabled');
  } catch (err) {
    logger.warn('[LocationService] Socket.IO Redis adapter unavailable — single-instance mode only', {
      err: err.message,
    });
  }
} else {
  logger.warn('[LocationService] REDIS_URL not set — Socket.IO running in single-instance mode (ok for dev, NOT for production scale)');
}

// ── Socket.IO reconnection rate limiter ──────────────────────────────────────
// Problem: when Render performs a rolling deploy, all sockets disconnect
// simultaneously. Every client reconnects within the same 10-second window
// causing a "thundering-herd" that can exhaust the event loop and delay the
// new instance from becoming ready.
//
// Mitigation: allow each client IP at most MAX_CONN_PER_WINDOW new connections
// within RATE_WINDOW_MS. Excess connections are rejected immediately so the
// Socket.IO client backs off (it reads the disconnect reason and applies
// randomizationFactor to its next attempt).
const RATE_WINDOW_MS        = 30_000;  // 30-second sliding window
const MAX_CONN_PER_WINDOW   = 10;      // 10 connections per IP per window (generous for normal use)
// ip → [timestamp, ...] — capped at MAX_CONN_PER_WINDOW entries
const _connAttempts = new Map();

function isConnectionRateLimited(ip) {
  const now    = Date.now();
  const window = now - RATE_WINDOW_MS;
  const times  = (_connAttempts.get(ip) || []).filter((t) => t > window);
  if (times.length >= MAX_CONN_PER_WINDOW) return true;
  times.push(now);
  _connAttempts.set(ip, times);
  return false;
}

io.use(/* istanbul ignore next */ (socket, next) => {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || socket.handshake.address;
  if (isConnectionRateLimited(ip)) {
    logger.warn('[LocationSocket] Connection rate-limited', { ip });
    return next(new Error('rate_limit_exceeded'));
  }
  next();
});

// Initialise the /location namespace with all location event handlers
const locationNamespace = initLocationSocket(io);

// Expose io on app so route handlers can use it
app.set('io', io);

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout   = 70_000;
  /* istanbul ignore next */
  httpServer.listen(PORT, () => {
    logger.info(`[MOBO Location Service] HTTP + Socket.IO running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
    // GDPR: purge location data older than 90 days, runs daily at 02:00 UTC
    startLocationPurgeJob();
  });
  /* istanbul ignore next */
  const _shutdown = (signal) => {
    logger.info(`${process.env.SERVICE_NAME} ${signal} — graceful shutdown started`);
    httpServer.close(() => {
      logger.info(`${process.env.SERVICE_NAME} HTTP server closed`);
      process.exit(0);
    });
    setTimeout(() => { logger.error(`${process.env.SERVICE_NAME} forced shutdown`); process.exit(1); }, 30000).unref();
  };
  /* istanbul ignore next */
  process.on('SIGTERM', () => _shutdown('SIGTERM'));
  /* istanbul ignore next */
  process.on('SIGINT',  () => _shutdown('SIGINT'));
}

module.exports = app;
