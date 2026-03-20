require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { globalLimiter } = require('./src/middleware/rateLimit');
const routes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

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
      callback(null, true); // In development, allow all; restrict in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================================
// Security & Logging
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false // Disabled for API
}));
app.use(morgan('combined'));

// ============================================================
// Rate Limiting (global)
// ============================================================
app.use(globalLimiter);

// ============================================================
// Health Check (before proxy routes)
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'mobo-api-gateway',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      user: process.env.USER_SERVICE_URL || 'http://user-service:3001',
      ride: process.env.RIDE_SERVICE_URL || 'http://ride-service:3002',
      payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3003',
      location: process.env.LOCATION_SERVICE_URL || 'http://location-service:3004'
    }
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
app.use((err, req, res, next) => {
  console.error('[API Gateway Error]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Gateway error'
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log('');
  console.log('  ███╗   ███╗ ██████╗ ██████╗  ██████╗ ');
  console.log('  ████╗ ████║██╔═══██╗██╔══██╗██╔═══██╗');
  console.log('  ██╔████╔██║██║   ██║██████╔╝██║   ██║');
  console.log('  ██║╚██╔╝██║██║   ██║██╔══██╗██║   ██║');
  console.log('  ██║ ╚═╝ ██║╚██████╔╝██████╔╝╚██████╔╝');
  console.log('  ╚═╝     ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ');
  console.log('');
  console.log('  Your City. Your Ride. Your Community.');
  console.log('');
  console.log(`  API Gateway running on port ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});

module.exports = app;
