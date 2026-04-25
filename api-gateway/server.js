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
const { globalLimiter } = require('./src/middleware/rateLimit');
const routes = require('./src/routes/index');
const { cacheHeaders } = require('./src/middleware/cacheHeaders');
const requestId = require('./src/middleware/requestId');
const { getAllServiceHealth } = require('./src/middleware/serviceCircuitBreaker');
const { initFeatureFlags, destroyFeatureFlags } = require('../services/shared/featureFlags');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/swagger');

const app = express();

// Enable ETag for conditional GET (304 Not Modified) — saves bandwidth on 3G
// when the client already has a fresh copy of the response.
app.set('etag', 'strong');

// Gzip/Brotli compression — reduces JSON payloads ~70% on slow 3G connections
app.use(compression({ threshold: 512 })); // only compress responses > 512 bytes
app.use(requestId);
app.use(Sentry.Handlers.requestHandler());
const PORT = process.env.PORT || 3000;
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'mobo-api-gateway';

// ============================================================
// CORS Configuration
// ============================================================
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:19000',  // Expo
      'http://localhost:19006',  // Expo web
      process.env.FRONTEND_URL
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Strip internal identity headers from ALL incoming requests before auth middleware runs.
// Prevents external clients from forging x-user-id / x-user-role to impersonate other users.
// The auth.js verifyToken middleware re-sets these headers after verifying the JWT.
app.use((req, _res, next) => {
  delete req.headers['x-user-id'];
  delete req.headers['x-user-role'];
  delete req.headers['x-user-phone'];
  delete req.headers['x-user-name'];
  next();
});

// ============================================================
// Security & Logging
// ============================================================
// Production-grade security headers (Uber/FreeNow standard)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'none'"],
      frameAncestors:  ["'none'"],
      formAction:      ["'none'"],
    },
  },
  hsts: {
    maxAge:            31536000, // 1 year
    includeSubDomains: true,
    preload:           true,
  },
  referrerPolicy:            { policy: 'no-referrer' },
  permittedCrossDomainPolicies: false,
  crossOriginEmbedderPolicy: false, // Not needed for REST API
}));
const logger = require('./src/utils/logger');
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// ============================================================
// Rate Limiting (global)
// ============================================================
app.use(globalLimiter);

// Prometheus metrics — restricted to internal scraper IPs only
const promClient = require('prom-client');
const promRegister = new promClient.Registry();
promClient.collectDefaultMetrics({ register: promRegister });

// SLO metrics: HTTP request counter + latency histogram (used by alerting-rules.yml)
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests by method, route, and status',
  labelNames: ['method', 'route', 'status'],
  registers: [promRegister],
});
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [promRegister],
});

// Business metrics: ride completions, payment outcomes
const rideCompletionsTotal = new promClient.Counter({
  name: 'ride_completions_total',
  help: 'Total completed rides by payment method',
  labelNames: ['payment_method'],
  registers: [promRegister],
});
const paymentOutcomesTotal = new promClient.Counter({
  name: 'payment_outcomes_total',
  help: 'Payment charge outcomes by provider and result',
  labelNames: ['provider', 'result'],
  registers: [promRegister],
});

// Record HTTP metrics on every response
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path.replace(/\/[0-9a-f-]{8,}$/i, '/:id');
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

// Export metrics helpers for downstream services to increment business counters
app.locals.metrics = { rideCompletionsTotal, paymentOutcomesTotal };

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

// ============================================================
// Deep Health Check (before proxy routes)
// GET /health        — shallow (Render uses this for liveness)
// GET /health/deep   — full dependency probe (monitoring uses this)
// ============================================================
const http = require('http');

async function probeService(name, baseUrl) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url   = `${baseUrl}/health`;
    const req   = http.get(url, { timeout: 3000 }, (res) => {
      const latencyMs = Date.now() - start;
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      resolve({ name, status: ok ? 'healthy' : 'degraded', latencyMs, httpStatus: res.statusCode });
    });
    req.on('error', () => resolve({ name, status: 'unhealthy', latencyMs: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ name, status: 'timeout', latencyMs: 3000 }); });
  });
}

// Shallow liveness — always fast, used by Render health check
app.get('/health', (req, res) => {
  res.json({
    success:   true,
    service:   'mobo-api-gateway',
    version:   '1.0.0',
    status:    'healthy',
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
  });
});

// Deep readiness — probes all downstream services (used by monitoring)
app.get('/health/deep', async (req, res) => {
  const SERVICES = {
    user:     process.env.USER_SERVICE_URL     || 'http://user-service:3001',
    ride:     process.env.RIDE_SERVICE_URL     || 'http://ride-service:3002',
    payment:  process.env.PAYMENT_SERVICE_URL  || 'http://payment-service:3003',
    location: process.env.LOCATION_SERVICE_URL || 'http://location-service:3004',
  };

  const probes = await Promise.all(
    Object.entries(SERVICES).map(([name, url]) => probeService(name, url))
  );

  const results   = Object.fromEntries(probes.map(p => [p.name, p]));
  const anyDown   = probes.some(p => p.status === 'unhealthy');
  const anyDegraded = probes.some(p => p.status === 'degraded' || p.status === 'timeout');
  const overallStatus = anyDown ? 'unhealthy' : anyDegraded ? 'degraded' : 'healthy';

  res.status(anyDown ? 503 : 200).json({
    success:   !anyDown,
    service:   'mobo-api-gateway',
    status:    overallStatus,
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
    dependencies: results,
    circuit_breakers: getAllServiceHealth(),
  });
});

// ============================================================
// API Welcome
// ============================================================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to MOBO API — Your City. Your Ride. Your Community.',
    version: '1.0.0',
    docs: '/api-docs',
    health: '/health',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      rides: '/api/rides',
      fare: '/api/fare',
      payments: '/api/payments',
      location: '/api/location',
      drivers: '/api/drivers'
    }
  });
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'MOBO API Docs',
  customCss: '.swagger-ui .topbar { background-color: #FF00BF; }',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ============================================================
// Cache-Control headers (Africa bandwidth optimisation)
// ============================================================
// Applied before proxy routes so headers are set on every outgoing response.
app.use(cacheHeaders);

// ============================================================
// Proxy Routes
// ============================================================
routes(app);

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    hint: 'All API routes start with /api'
  });
});

// ============================================================
// Global Error Handler
// ============================================================
app.use(Sentry.Handlers.errorHandler());
const { errorHandler } = require('./src/utils/response');
app.use(errorHandler);

// ============================================================
// Start Server
// ============================================================
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, async () => {
    logger.info(`[MOBO API Gateway] Running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
    await initFeatureFlags();
  });
  const _shutdown = (signal) => {
    logger.info(`${process.env.SERVICE_NAME} ${signal} — graceful shutdown started`);
    destroyFeatureFlags();
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
