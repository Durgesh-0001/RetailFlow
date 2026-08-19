# RetailFlow — Unified Shop Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-Latest-blue.svg)](https://react.dev/)
[![Kafka](https://img.shields.io/badge/Kafka-Message_Streaming-red.svg)](https://kafka.apache.org/)
[![Redis](https://img.shields.io/badge/Redis-Caching-brightgreen.svg)](https://redis.io/)

RetailFlow is a **full-stack shop management system** that digitizes retail operations by replacing manual ledgers with a unified, intelligent dashboard. Built with **Node.js + Express + MongoDB** (backend), **React + Vite** (frontend), with **Kafka** for event streaming and **Redis** for high-performance caching.

---

## 🎯 Key Features

### 📊 Dashboard
- Real-time revenue & profit visualization with area charts
- Low-stock alerts for quick action
- Recent orders overview
- KPI metrics at a glance

### 📦 Inventory Management
- Product catalog with SKU tracking
- Real-time stock status (Sufficient / Short Stock / Out of Stock)
- Low-stock threshold alerts
- Stock history and movement tracking

### 🛒 Order Processing
- Intuitive order creation interface
- Automatic inventory deduction with atomic transactions
- Order status tracking
- Order history and analytics
- Event-driven order updates via Kafka

### 💰 Financial Analytics
- Daily sales tracking
- Monthly profit reports
- Revenue trends with visual charts
- Financial insights & reporting
- Cached analytics for faster queries

### 👥 Employee Management
- Staff directory and profiles
- Daily attendance tracking
- Employee performance insights
- Shift management

### 🔐 Authentication & Security
- JWT-based authentication
- Secure owner signup/login
- Role-based access control
- Password hashing with bcrypt
- Redis-based session management

---

## 🏗️ Architecture & Tech Stack

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: MongoDB
- **Message Queue**: Apache Kafka (event streaming & asynchronous processing)
- **Caching**: Redis (high-performance caching, sessions, real-time updates)
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: bcrypt password hashing
- **API**: RESTful API (versioned /api/v1/)

### Web Frontend
- **Framework**: React 18+
- **Build Tool**: Vite (lightning-fast bundling)
- **HTTP Client**: Axios with JWT interceptors
- **State Management**: React Context API
- **Styling**: CSS

---

## 📁 Project Structure

```
RetailFlow/
├── backend/
│   ├── config/              # Database, Kafka, Redis configuration
│   ├── controllers/         # Business logic layer
│   │   ├── auth.js         # Authentication logic
│   │   ├── products.js     # Inventory operations
│   │   ├── orders.js       # Order processing
│   │   ├── sales.js        # Financial analytics
│   │   └── employees.js    # Staff management
│   ├── middleware/          # Custom middleware
│   │   ├── auth.js         # JWT verification
│   │   └── errorHandler.js # Global error handling
│   ├── models/              # Mongoose schemas
│   │   ├── User.js
│   │   ├── Product.js
│   │   ├── Order.js
│   │   ├── Sale.js
│   │   ├── Employee.js
│   │   └── Attendance.js
│   ├── routes/              # API route definitions
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── orders.js
│   │   ├── sales.js
│   │   └── employees.js
│   ├── services/            # Business logic & external integrations
│   │   ├── kafkaService.js # Kafka event handling
│   │   └── redisService.js # Redis caching operations
│   ├── utils/               # Helper utilities
│   │   └── ErrorResponse.js
│   ├── server.js            # Express app entry point
│   └── .env.example         # Environment variables template
│
└── frontend/
    ├── src/
    │   ├── api/             # Axios instance & API calls
    │   ├── components/      # Reusable React components
    │   │   ├── Sidebar.jsx
    │   │   └── Layout.jsx
    │   ├── context/         # React Context providers
    │   │   └── AuthContext.jsx
    │   ├── pages/           # Page components
    │   │   ├── Dashboard.jsx
    │   │   ├── Inventory.jsx
    │   │   ├── Orders.jsx
    │   │   ├── Finance.jsx
    │   │   └── Employees.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── vite.config.js
    ├── package.json
    └── .env.example
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or higher
- **MongoDB** (running locally or on MongoDB Atlas)
- **Apache Kafka** (for event streaming)
- **Redis** (for caching & sessions)
- **npm** or **yarn** package manager

### 1️⃣ Start Dependencies

#### MongoDB
```bash
# macOS/Linux
mongod

# Windows (if installed as service)
net start MongoDB
```

#### Kafka (Ensure Zookeeper & Kafka are running)
```bash
# macOS/Linux using Homebrew
brew services start zookeeper
brew services start kafka

# Or manually start:
$KAFKA_HOME/bin/zookeeper-server-start.sh $KAFKA_HOME/config/zookeeper.properties
$KAFKA_HOME/bin/kafka-server-start.sh $KAFKA_HOME/config/server.properties
```

#### Redis
```bash
# macOS/Linux
redis-server

# Windows
redis-server.exe

# Or Docker
docker run -d -p 6379:6379 redis:latest
```

### 2️⃣ Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create .env file from template
cp .env.example .env

# Update .env with your configuration
# Example:
# MONGODB_URI=mongodb://localhost:27017/retailflow
# JWT_SECRET=your-super-secret-jwt-key
# JWT_EXPIRE=7d
# PORT=5000
# NODE_ENV=development
# CORS_ORIGIN=http://localhost:5173
# KAFKA_BROKERS=localhost:9092
# KAFKA_GROUP_ID=retailflow-group
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=

# Start the development server
npm run dev
```

Backend runs at: `http://localhost:5000`

### 3️⃣ Frontend (Web) Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Update .env with backend API URL
# Example:
# VITE_API_URL=http://localhost:5000

# Start the development server
npm run dev
```

Frontend runs at: `http://localhost:5173`

---

## 📡 API Endpoints (v1)

| Resource   | Base Path               | Methods              |
|-----------|------------------------|----------------------|
| Auth      | `/api/v1/auth`          | POST (signup, login) |
| Products  | `/api/v1/products`      | GET, POST, PUT, DELETE |
| Orders    | `/api/v1/orders`        | GET, POST, PUT, DELETE |
| Sales     | `/api/v1/sales`         | GET (analytics)     |
| Employees | `/api/v1/employees`     | GET, POST, PUT, DELETE |
| Attendance| `/api/v1/attendance`    | GET, POST           |
| Health    | `/api/v1/health`        | GET (status check)  |

**Authentication**: All protected routes require `Authorization: Bearer <JWT_TOKEN>` header.

### Example Request

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@shop.com","password":"password123"}'
```

---

## 🔧 Environment Variables

### Backend (.env)
```
# Database
MONGODB_URI=mongodb://localhost:27017/retailflow

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d

# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Kafka (Event Streaming)
KAFKA_BROKERS=localhost:9092
KAFKA_GROUP_ID=retailflow-group
KAFKA_CLIENT_ID=retailflow-client

# Redis (Caching & Sessions)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TTL=3600

# Business Logic
STOCK_THRESHOLD=10
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000
```

---

## 📦 Dependencies Summary

**Backend**:
- Express.js (server framework)
- MongoDB & Mongoose (database & ODM)
- bcryptjs (password hashing)
- jsonwebtoken (JWT authentication)
- kafkajs (Kafka client for event streaming)
- redis (Redis client for caching)
- cors (cross-origin requests)
- dotenv (environment variables)

**Frontend**:
- React 18+ (UI framework)
- Vite (build tool)
- Axios (HTTP client)
- React Router (navigation)
- Chart.js or Recharts (data visualization)

---

## 🔄 Event Streaming with Kafka

RetailFlow uses Apache Kafka for asynchronous event processing:

### Events Published
- **order.created** - When a new order is placed
- **order.completed** - When an order is fulfilled
- **inventory.updated** - When stock levels change
- **sales.recorded** - When a sale is finalized

### Example Kafka Usage
```javascript
// Publish event
await kafkaService.publishEvent('order.created', {
  orderId: '123',
  items: [...],
  timestamp: new Date()
});

// Subscribe to events
kafkaService.subscribeToTopic('order.completed', (message) => {
  console.log('Order completed:', message);
});
```

---

## ⚡ Caching with Redis

Redis is used for:
- **Session Management**: User authentication tokens
- **Real-time Updates**: Cached dashboard metrics
- **Performance**: Frequently accessed inventory data
- **Rate Limiting**: API request throttling

### Example Redis Usage
```javascript
// Set cache
await redisService.set('product:123', productData, 3600);

// Get from cache
const cached = await redisService.get('product:123');

// Clear cache
await redisService.delete('product:123');
```

---

## 🔄 Development Workflow

1. **Create a feature branch**: `git checkout -b feature/your-feature`
2. **Make changes** in backend, frontend, or both
3. **Test locally** (use Postman for API testing, browser dev tools for frontend)
4. **Commit changes**: `git commit -m "feat: add your feature"`
5. **Push and create a PR**: `git push origin feature/your-feature`

---

## 🧪 Testing (Optional)

### Manual Testing
- Use **Postman** or **Thunder Client** to test API endpoints
- Use **React DevTools** for frontend debugging
- Use **MongoDB Compass** for database inspection
- Use **Kafka UI** or **Kafdrop** for Kafka topic monitoring
- Use **Redis Desktop Manager** or **redis-cli** for Redis inspection

### Automated Testing (To be implemented)
```bash
# Backend tests
npm test --prefix backend

# Frontend tests
npm test --prefix frontend
```

---

## 🐛 Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod` (macOS/Linux) or `net start MongoDB` (Windows)
- Check connection string in `.env`
- Verify MongoDB is accessible on the correct port (default: 27017)

### Kafka Connection Issues
- Ensure Kafka broker is running on the configured host/port
- Check `KAFKA_BROKERS` in `.env`
- Verify Zookeeper is running (Kafka dependency)
- Use `kafka-topics.sh` to verify topics exist

### Redis Connection Issues
- Ensure Redis server is running: `redis-server`
- Check `REDIS_HOST` and `REDIS_PORT` in `.env`
- Verify Redis is accessible: `redis-cli ping` (should return PONG)
- Check authentication if `REDIS_PASSWORD` is set

### CORS Errors
- Ensure `CORS_ORIGIN` in backend `.env` matches your frontend URL
- Check that frontend `.env` has correct `VITE_API_URL`

### Port Already in Use
```bash
# Kill process using port 5000 (macOS/Linux)
lsof -ti:5000 | xargs kill -9

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

---

## 📚 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Redis Documentation](https://redis.io/documentation)
- [Vite Documentation](https://vitejs.dev/)

---

## 🤝 Contributing

Contributions are welcome! Please follow the development workflow and ensure your code is well-tested before submitting a pull request.

---

## 📧 Support

For issues, questions, or feature requests, please open a [GitHub Issue](https://github.com/NamanKhanduja/RetailFlow/issues).

---

**Built with ❤️ by [Durgesh Yadav](https://github.com/Durgesh-0001)**
