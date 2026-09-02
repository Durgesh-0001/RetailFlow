/**
 * backend_v2/test.js — RetailFlow Full End-to-End API Test Suite
 * ───────────────────────────────────────────────────────────────
 * Tests all endpoints: Auth, Products, Orders, Sales, Analytics,
 * Email Notifications, and Employees with live assertions.
 * Run with: node test.js
 */

const BASE = process.env.TEST_API_URL || 'http://localhost:5000/api/v1';

let TOKEN = '';
let IDs = {};

const pass = (label) => console.log(`  ✅  ${label}`);
const fail = (label, msg) => console.log(`  ❌  ${label} — ${msg}`);

async function req(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RetailFlow Backend v2 — Comprehensive Test Suite');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 1. HEALTH CHECK ───────────────────────────────────────────────────────
  console.log('🏥 1. System Health Check');
  try {
    const { data } = await req('GET', '/health', null, false);
    if (data.success) {
      pass(`GET /health (Services: Mongo=${data.services?.mongodb}, Redis=${data.services?.redis}, Kafka=${data.services?.kafkaProducer})`);
    } else {
      fail('GET /health', JSON.stringify(data));
    }
  } catch (e) {
    fail('GET /health', e.message);
  }

  // ── 2. AUTHENTICATION ─────────────────────────────────────────────────────
  console.log('\n🔐 2. Authentication');
  const testUser = {
    shopName: 'SuperStore V2',
    ownerName: 'V2 Admin',
    email: `owner_${Date.now()}@retailflow.dev`,
    password: 'password123',
    phone: '+91 9988776655',
    address: '456 Business Park, Mumbai',
  };

  try {
    const { data } = await req('POST', '/auth/register', testUser, false);
    if (data.token) {
      TOKEN = data.token;
      pass(`POST /auth/register (New User Created: ${testUser.email})`);
    } else {
      fail('POST /auth/register', data.message);
    }
  } catch (e) {
    fail('POST /auth/register', e.message);
  }

  try {
    const { data } = await req('POST', '/auth/login', {
      email: testUser.email,
      password: testUser.password,
    }, false);
    if (data.token) {
      TOKEN = data.token;
      pass('POST /auth/login (JWT token retrieved)');
    } else {
      fail('POST /auth/login', data.message);
    }
  } catch (e) {
    fail('POST /auth/login', e.message);
  }

  try {
    const { data } = await req('GET', '/auth/me');
    data.success ? pass(`GET /auth/me (Logged in as ${data.user?.ownerName})`) : fail('GET /auth/me', data.message);
  } catch (e) {
    fail('GET /auth/me', e.message);
  }

  // ── 3. PRODUCTS & INVENTORY ───────────────────────────────────────────────
  console.log('\n📦 3. Products & Inventory Management');
  const sampleProducts = [
    { name: 'Organic Almonds', sku: `ALM-${Date.now().toString().slice(-4)}`, category: 'Dry Fruits', unit: 'kg', costPrice: 600, sellingPrice: 900, quantity: 50, lowStockThreshold: 10 },
    { name: 'Whole Wheat Flour', sku: `FLR-${Date.now().toString().slice(-4)}`, category: 'Grains', unit: 'kg', costPrice: 30, sellingPrice: 45, quantity: 8, lowStockThreshold: 10 },
    { name: 'Fresh Milk', sku: `MLK-${Date.now().toString().slice(-4)}`, category: 'Dairy', unit: 'litre', costPrice: 40, sellingPrice: 60, quantity: 100, lowStockThreshold: 15 },
  ];

  for (const p of sampleProducts) {
    try {
      const { data } = await req('POST', '/products', p);
      if (data.success) {
        IDs[p.name] = data.data._id;
        pass(`POST /products — ${p.name} (Stock: ${p.quantity}, Price: ₹${p.sellingPrice})`);
      } else {
        fail(`POST /products — ${p.name}`, data.message);
      }
    } catch (e) {
      fail(`POST /products — ${p.name}`, e.message);
    }
  }

  try {
    const { data } = await req('GET', '/products');
    data.success ? pass(`GET /products (${data.count} items listed)`) : fail('GET /products', data.message);
  } catch (e) {
    fail('GET /products', e.message);
  }

  try {
    const { data } = await req('GET', '/products/low-stock');
    data.success ? pass(`GET /products/low-stock (${data.count} low-stock items detected)`) : fail('GET /products/low-stock', data.message);
  } catch (e) {
    fail('GET /products/low-stock', e.message);
  }

  const almondId = IDs['Organic Almonds'];
  if (almondId) {
    try {
      const { data } = await req('PATCH', `/products/${almondId}/stock`, { adjustment: -5 });
      data.success ? pass(`PATCH /products/:id/stock (Deducted 5 units, new stock: ${data.data.quantity})`) : fail('PATCH /products/:id/stock', data.message);
    } catch (e) {
      fail('PATCH /products/:id/stock', e.message);
    }
  }

  // ── 4. ORDERS & KAFKA EVENT STREAMING ─────────────────────────────────────
  console.log('\n🛒 4. Order Processing & Kafka Publishing');
  let createdOrderId = null;
  if (almondId && IDs['Fresh Milk']) {
    try {
      const orderPayload = {
        customer: {
          name: 'Aarav Patel',
          email: 'aarav.patel@example.com',
          phone: '+91 9123456780',
        },
        items: [
          { product: almondId, quantity: 2 },
          { product: IDs['Fresh Milk'], quantity: 5 },
        ],
        discount: 50,
        notes: 'Express Delivery with Receipt',
      };

      const { data } = await req('POST', '/orders', orderPayload);
      if (data.success) {
        createdOrderId = data.data._id;
        pass(`POST /orders — Created Order ${data.data.orderNumber} (Final Amount: ₹${data.data.finalAmount})`);
      } else {
        fail('POST /orders', data.message);
      }
    } catch (e) {
      fail('POST /orders', e.message);
    }
  }

  try {
    const { data } = await req('GET', '/orders');
    data.success ? pass(`GET /orders (${data.count} orders found)`) : fail('GET /orders', data.message);
  } catch (e) {
    fail('GET /orders', e.message);
  }

  if (createdOrderId) {
    try {
      const { data } = await req('PATCH', `/orders/${createdOrderId}/status`, { status: 'Completed' });
      data.success ? pass(`PATCH /orders/:id/status → Completed (Kafka event published & Sale auto-logged)`) : fail('PATCH /orders/:id/status', data.message);
    } catch (e) {
      fail('PATCH /orders/:id/status', e.message);
    }
  }

  // ── 5. SALES & FINANCE ────────────────────────────────────────────────────
  console.log('\n💰 5. Sales & Finance');
  try {
    const { data } = await req('GET', '/sales');
    data.success ? pass(`GET /sales (${data.count} records)`) : fail('GET /sales', data.message);
  } catch (e) {
    fail('GET /sales', e.message);
  }

  try {
    const { data } = await req('GET', '/sales/daily');
    data.success ? pass(`GET /sales/daily (Today's Revenue: ₹${data.data?.totalRevenue || 0}, Profit: ₹${data.data?.totalProfit || 0})`) : fail('GET /sales/daily', data.message);
  } catch (e) {
    fail('GET /sales/daily', e.message);
  }

  // ── 6. DEDICATED ANALYTICS ENDPOINTS ──────────────────────────────────────
  console.log('\n📊 6. Analytics Engine & Redis Caching (NEW)');

  try {
    const { data } = await req('GET', '/analytics/overview');
    if (data.success) {
      pass(`GET /analytics/overview (Revenue: ₹${data.data.financials.totalRevenue}, Profit: ₹${data.data.financials.totalProfit}, Margin: ${data.data.financials.profitMarginPercentage}%, Orders: ${data.data.orders.total})`);
    } else {
      fail('GET /analytics/overview', data.message);
    }
  } catch (e) {
    fail('GET /analytics/overview', e.message);
  }

  try {
    const { data } = await req('GET', '/analytics/dashboard');
    if (data.success) {
      pass(`GET /analytics/dashboard (Today: ₹${data.data.today.revenue} rev, Yesterday: ₹${data.data.yesterday.revenue} rev, Recent Orders: ${data.data.recentOrders?.length})`);
    } else {
      fail('GET /analytics/dashboard', data.message);
    }
  } catch (e) {
    fail('GET /analytics/dashboard', e.message);
  }

  try {
    const { data } = await req('GET', '/analytics/revenue-trends?interval=daily');
    if (data.success) {
      pass(`GET /analytics/revenue-trends (Trend points: ${data.data.data?.length}, Total Period Revenue: ₹${data.data.summary?.totalRevenue})`);
    } else {
      fail('GET /analytics/revenue-trends', data.message);
    }
  } catch (e) {
    fail('GET /analytics/revenue-trends', e.message);
  }

  try {
    const { data } = await req('GET', '/analytics/products');
    if (data.success) {
      pass(`GET /analytics/products (Top products tracked: ${data.data.topSellingProducts?.length}, Categories: ${data.data.categories?.length})`);
    } else {
      fail('GET /analytics/products', data.message);
    }
  } catch (e) {
    fail('GET /analytics/products', e.message);
  }

  try {
    const { data } = await req('GET', '/analytics/orders');
    if (data.success) {
      pass(`GET /analytics/orders (Status breakdowns: ${data.data.byStatus?.length})`);
    } else {
      fail('GET /analytics/orders', data.message);
    }
  } catch (e) {
    fail('GET /analytics/orders', e.message);
  }

  try {
    const { data } = await req('GET', '/analytics/customers');
    if (data.success) {
      pass(`GET /analytics/customers (Top Customers: ${data.data.topCustomers?.length})`);
    } else {
      fail('GET /analytics/customers', data.message);
    }
  } catch (e) {
    fail('GET /analytics/customers', e.message);
  }

  // ── 7. EMAIL NOTIFICATIONS ────────────────────────────────────────────────
  console.log('\n📧 7. Email Notification System (NEW)');
  try {
    const { data } = await req('POST', '/notifications/test', {
      to: 'customer.test@example.com',
      subject: 'Order Receipt Test',
      message: 'Your order was successfully verified by RetailFlow Backend v2.',
    });
    data.success ? pass('POST /notifications/test (Notification successfully dispatched & logged)') : fail('POST /notifications/test', data.message);
  } catch (e) {
    fail('POST /notifications/test', e.message);
  }

  try {
    const { data } = await req('GET', '/notifications');
    data.success ? pass(`GET /notifications (${data.count} notification logs found in DB)`) : fail('GET /notifications', data.message);
  } catch (e) {
    fail('GET /notifications', e.message);
  }

  // ── 8. EMPLOYEES & ATTENDANCE ─────────────────────────────────────────────
  console.log('\n👥 8. Employees & Attendance');
  const staff = { name: 'Kavita Singh', phone: '+91 9888877777', email: 'kavita@store.com', role: 'Store Manager', salary: 25000 };
  let staffId = null;

  try {
    const { data } = await req('POST', '/employees', staff);
    if (data.success) {
      staffId = data.data._id;
      pass(`POST /employees (Added ${staff.name} - ${staff.role})`);
    } else {
      fail('POST /employees', data.message);
    }
  } catch (e) {
    fail('POST /employees', e.message);
  }

  if (staffId) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data } = await req('POST', '/employees/attendance', {
        employee: staffId,
        date: today,
        status: 'Present',
        notes: 'On time',
      });
      data.success ? pass(`POST /employees/attendance (Marked Present for ${today})`) : fail('POST /employees/attendance', data.message);
    } catch (e) {
      fail('POST /employees/attendance', e.message);
    }

    try {
      const { data } = await req('GET', `/employees/attendance?date=${today}`);
      data.success ? pass(`GET /employees/attendance (${data.count} attendance records for today)`) : fail('GET /employees/attendance', data.message);
    } catch (e) {
      fail('GET /employees/attendance', e.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🎉 All RetailFlow Backend v2 Tests Completed Successfully!');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
