const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// ─── Load Environment Variables ───────────────────────────────────────────────
dotenv.config();

const connectDB = require('./config/db');
const { connectProducer, disconnectProducer, isProducerConnected } = require('./config/kafka');
const { disconnectRedis, isRedisHealthy } = require('./config/redis');
const { startAllWorkers, stopAllWorkers } = require('./workers/index');
const errorHandler = require('./middleware/errorHandler');

// Connect to MongoDB, Kafka Producer & Redis
connectDB();
connectProducer();

// Auto-start Kafka Consumer Workers in-process (Email, Analytics, Order workers)
if (process.env.ENABLE_WORKERS !== 'false') {
  startAllWorkers().catch((err) => {
    console.warn('⚠️ [server] Consumer workers auto-boot notification:', err.message);
  });
}

// ─── Initialize Express ────────────────────────────────────────────────────────
const app = express();

// ─── Core Security & Utility Middleware ────────────────────────────────────────
app.use(helmet());

app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.CLIENT_URL
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(express.json());

// ─── System Health Check (Exempt from Rate Limiting & ETag Caching) ────────────
app.get('/api/v1/health', async (req, res) => {
  const redisHealthy = await isRedisHealthy();
  const kafkaProducerConnected = isProducerConnected();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.status(200).json({
    success: true,
    message: '🟢 RetailFlow Backend v2 is healthy and running.',
    version: '2.0.0',
    environment: process.env.NODE_ENV,
    services: {
      mongodb: 'connected',
      redis: redisHealthy ? 'healthy' : 'disconnected/simulated',
      kafkaProducer: kafkaProducerConnected ? 'connected' : 'disconnected/offline',
      emailNotifications: process.env.EMAIL_ENABLED !== 'false' ? 'active' : 'disabled',
      workers: process.env.ENABLE_WORKERS !== 'false' ? 'active (in-app)' : 'standalone',
    },
    timestamp: new Date().toISOString(),
  });
});

// API Rate Limiter (Excludes health checks)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 5000,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.includes('/health'),
});
app.use('/api', limiter);

// ─── API Routes (Versioned under /api/v1/) ────────────────────────────────────
app.use('/api/v1/auth',          require('./routes/authRoutes'));
app.use('/api/v1/products',      require('./routes/productRoutes'));
app.use('/api/v1/orders',        require('./routes/orderRoutes'));
app.use('/api/v1/sales',         require('./routes/salesRoutes'));
app.use('/api/v1/analytics',     require('./routes/analyticsRoutes'));
app.use('/api/v1/employees',     require('./routes/employeeRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start HTTP Server ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 RetailFlow Backend v2 running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`💥 Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

// Graceful Shutdown hooks
const handleShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('HTTP Server closed.');
    await stopAllWorkers();
    await disconnectProducer();
    await disconnectRedis();
    console.log('Shutdown process complete. Exiting.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

module.exports = app;
