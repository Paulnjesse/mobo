require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const rideRoutes = require('./src/routes/rides');
const { initRideSocket } = require('./src/socket/rideSocket');
const { startEscalationJob } = require('./src/jobs/escalationJob');

const app = express();
const PORT = process.env.PORT || 3002;

// Allowed origins for CORS and Socket.IO
const CORS_ORIGINS = process.env.SOCKET_CORS_ORIGIN
  ? process.env.SOCKET_CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'exp://localhost:8081'];

app.use(helmet());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Routes
app.use('/rides', rideRoutes);
app.use('/ride', rideRoutes);
app.use('/fare', rideRoutes);

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
app.use((err, req, res, next) => {
  console.error('[RideService Error]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

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

httpServer.listen(PORT, () => {
  console.log(`[MOBO Ride Service] HTTP + Socket.IO running on port ${PORT}`);
  console.log(`[MOBO Ride Service] Socket.IO namespace: /rides`);
  startEscalationJob();
});

module.exports = app;
