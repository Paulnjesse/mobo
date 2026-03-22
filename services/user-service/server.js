require('dotenv').config();

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

const app = express();
const PORT = process.env.PORT || 3001;

// Restrict CORS to known origins
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'exp://localhost:8081'];

// Security middleware
app.use(helmet());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

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
app.use((err, req, res, next) => {
  console.error('[UserService Error]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`[MOBO User Service] Running on port ${PORT}`);
  startExpiryAlertJob(db);
});

module.exports = app;
