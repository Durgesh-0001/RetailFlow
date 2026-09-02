# RetailFlow Frontend v2 (Event-Driven Architecture)

A modern, high-performance React application built specifically for **RetailFlow Backend v2** with dedicated modules for the **Shop Analytics Engine**, **Kafka Order Events**, **Redis Caching & Telemetry**, **Transactional Email Notifications**, and comprehensive store operations.

---

## ✨ Features & Modules

1. **Live Dashboard (`/`)**:
   - Real-time performance comparing **Today vs. Yesterday** revenue, net profit, and orders count.
   - Profit margin percentage and inventory valuations.
   - Restock warning alerts and 5 most recent customer orders with live status.

2. **Dedicated Analytics Engine (`/analytics`)**:
   - **Financial Trends**: Interactive grouping across `daily`, `weekly`, `monthly`, and `yearly` timeframes.
   - **Product Sales Velocity**: Top-selling products ranked by volume and revenue generated.
   - **24-Hour Peak Ordering**: Hourly distribution bar chart highlighting store peak hours.
   - **Category Share**: Inventory unit count and valuation per merchandise category.
   - **Customer Lifetime Value (LTV)**: Top VIP customer rankings and order frequency.

3. **Inventory Management (`/inventory`)**:
   - Product SKU management with live stock status badges (`Sufficient`, `Short Stock`, `Out of Stock`).
   - Cost price, selling price, and gross margin calculations.
   - Fast inline stock adjustment with backend audit logging (`PATCH /api/v1/products/:id/stock`).

4. **Orders & Automated Invoicing (`/orders`)**:
   - Multi-item line order creation with real-time price subtotaling and stock checks.
   - Automated Kafka event publishing to trigger rich HTML invoices to customer email.
   - Order lifecycle workflow: `Pending` ➔ `Processing` ➔ `Completed` ➔ `Cancelled` (with automatic inventory rollback upon cancellation).

5. **Finance Ledger (`/finance`)**:
   - Monthly and yearly performance filtering.
   - Daily breakdown of Revenue vs. Profit vs. COGS.
   - Manual sale journal logging for offline transactions.

6. **Staff & Attendance Ledger (`/employees`)**:
   - Employee roster, designations, contact numbers, and monthly salary tracking.
   - Single-click daily attendance marking (`Present`, `Absent`, `Half-Day`, `Leave`) with date navigation.

7. **Email & System Audit Center (`/notifications`)**:
   - Live cluster health monitor showing MongoDB, Redis Cache, Kafka Producer, and Email dispatcher status.
   - Audit trail of all sent transactional emails with dispatch status.
   - Send custom test email notifications directly from the interface.

---

## 🛠️ Setup & Running

### 1. Install Dependencies
```bash
cd frontend_v2
npm install
```

### 2. Start the Development Server
Ensure `backend_v2` is running on port 5000:
```bash
# In backend_v2 directory:
npm run dev

# In frontend_v2 directory:
npm run dev
```

The Vite dev server will run on `http://localhost:5173` and automatically proxy all `/api/*` requests to `http://localhost:5000`.

### 3. Build for Production
```bash
npm run build
```
The optimized production bundle will be generated in `frontend_v2/dist/`.
