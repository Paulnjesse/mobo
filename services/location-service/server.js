require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const locationRoutes = require('./src/routes/location');
const { initLocationSocket } = require('./src/socket/locationSocket');

const app = express();
const PORT = process.env.PORT || 3004;

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
  windowMs: 60 * 1000,  // 1 minute window for location updates
  max: 300,             // high limit for frequent location pings
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' }
});
app.use(limiter);

// Routes
app.use('/', locationRoutes);

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
app.use((err, req, res, next) => {
  console.error('[LocationService Error]', err.stack);
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
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialise the /location namespace with all location event handlers
const locationNamespace = initLocationSocket(io);

// Expose io on app so route handlers can use it
app.set('io', io);

httpServer.listen(PORT, () => {
  console.log(`[MOBO Location Service] HTTP + Socket.IO running on port ${PORT}`);
  console.log(`[MOBO Location Service] Socket.IO namespace: /location`);
});

module.exports = app;
