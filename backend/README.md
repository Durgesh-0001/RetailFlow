# RetailFlow Backend v2 (Event-Driven Architecture)

A modular, event-driven Node.js & Express REST API for RetailFlow with **Apache Kafka** event streaming, **Redis** high-performance caching & idempotency guards, transactional **Email Notifications**, and a dedicated **Shop Analytics Engine**.

---

## 🚀 Key Features in v2

1. **AI Route Removal**:
   - Completely stripped `@google/genai`, prompt orchestrators, and AI endpoints.
   - Clean, lightweight, deterministic execution.

2. **Auto-Booting Kafka Consumers & Email Worker**:
   - Starting the server (`npm start` or `npm run dev`) automatically connects both the **Kafka Producer** and all **3 Kafka Consumers** (`OrderConsumer`, `EmailNotificationConsumer`, `AnalyticsConsumer`) in the background.
   - When an order is placed, `EmailNotificationConsumer` immediately receives the event and sends transactional receipt emails to both customer and owner.
   - `AnalyticsConsumer` immediately increments real-time Redis revenue & order counters and flushes stale caches.

3. **Dedicated Shop Analytics Engine (`/api/v1/analytics`)**:
   - `/overview` — Financials (Revenue, Profit, COGS, Margin %), Order counts & AOV, Inventory valuation.
   - `/dashboard` — Live metrics (Today vs Yesterday growth), recent orders, and stock alerts.
   - `/revenue-trends` — Multi-interval trend aggregation (`daily`, `weekly`, `monthly`, `yearly`).
   - `/products` — Sales velocity, top performers, category breakdown.
   - `/orders` — Status breakdown and hourly peak ordering times.
   - `/customers` — Customer lifetime spend and loyalty tracking.

4. **Event-Driven Kafka Architecture**:
   - Unified Kafka publisher (`services/kafkaService.js`).
   - Consumer Groups:
     - `retailflow-order-workers` — Asynchronous order fulfillment & atomic transactions.
     - `retailflow-notification-group` — Automated email notifications.
     - `retailflow-analytics-group` — Real-time metrics counters and cache invalidation.

5. **Robust Redis Layer**:
   - Idempotency guard (`SET key val EX 86400 NX`) preventing duplicate message processing across all consumers (At-Least-Once delivery safety).
   - Redis response caching middleware (`middleware/cache.js`) with client `no-cache` bypass.
   - Real-time analytics counters (`analytics:today:revenue:${shopId}`).

---

## 📁 Directory Structure

```
backend_v2/
├── .env.example
├── .env
├── package.json
├── server.js               # Express app (auto-starts server & Kafka consumers)
├── config/
│   ├── db.js               # MongoDB connection
│   ├── kafka.js            # Kafka client & producer configuration
│   └── redis.js            # Redis connection pool
├── controllers/
│   ├── authController.js
│   ├── productController.js
│   ├── orderController.js
│   ├── salesController.js
│   ├── analyticsController.js
│   ├── employeeController.js
│   └── notificationController.js
├── middleware/
│   ├── auth.js             # JWT authentication
│   ├── cache.js            # Redis response caching
│   └── errorHandler.js     # Global error handling
├── models/
│   ├── User.js
│   ├── Product.js
│   ├── Order.js
│   ├── Sale.js
│   ├── Employee.js
│   ├── Attendance.js
│   └── Notification.js     # Email notification logs
├── routes/
│   ├── authRoutes.js
│   ├── productRoutes.js
│   ├── orderRoutes.js
│   ├── salesRoutes.js
│   ├── analyticsRoutes.js
│   ├── employeeRoutes.js
│   └── notificationRoutes.js
├── services/
│   ├── kafkaService.js     # Kafka event publishing
│   ├── redisService.js     # Redis caching & idempotency
│   ├── emailService.js     # Email notifications & templates
│   └── analyticsService.js # Analytics aggregations
├── utils/
│   └── errorResponse.js
├── workers/
│   ├── orderConsumer.js             # Order processing consumer
│   ├── emailNotificationConsumer.js # Email dispatch consumer
│   ├── analyticsConsumer.js         # Real-time analytics consumer
│   └── index.js                     # Unified workers daemon
└── test.js                 # Complete API test suite
```

---

## 🛠️ Setup & Running

### 1. Install Dependencies
```bash
cd backend_v2
npm install
```

### 2. Configure Environment Variables
```env
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
KAFKA_BROKERS=localhost:9094
REDIS_HOST=localhost
REDIS_PORT=6380

# Email (Optional: omit credentials for local simulated logger)
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 3. Start the API Server & Consumers
```bash
npm run dev
# Or for production:
npm start
```
*Note: The server will automatically connect to MongoDB, Redis, Kafka Producer, and boot all 3 Kafka consumers (`OrderConsumer`, `EmailNotificationConsumer`, `AnalyticsConsumer`) in the same process.*

### 4. Run the Test Suite
```bash
npm test
```
