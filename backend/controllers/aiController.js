/**
 * aiController.js  —  RetailFlow AI Agent v2
 * ───────────────────────────────────────────
 * Three-layer intelligence system:
 *
 *  1. VOICE INTENT CLASSIFICATION
 *     Maps Hindi / English / Hinglish commands to typed intents.
 *
 *  2. DEMAND PREDICTION
 *     Pre-fetches sales-velocity data from the DB and injects it into the
 *     system prompt so the LLM can answer restock questions with real numbers.
 *
 *  3. PRODUCT PAIRING RECOMMENDATIONS
 *     Pre-fetches co-purchase patterns and injects them so the LLM (or the
 *     DB-side executor) can suggest companion products automatically.
 */

const { GoogleGenAI }          = require('@google/genai');
const Product                  = require('../models/Product');
const Order                    = require('../models/Order');
const Sale                     = require('../models/Sale');
const Employee                 = require('../models/Employee');
const Attendance               = require('../models/Attendance');
const { getLowStockPredictions } = require('../utils/demandPredictor');
const { getPairingRules }      = require('../utils/pairingEngine');

// ── Initialise Gemini client once at server start ────────────────────────────
// Previously this skipped the "is the key even set" check that
// orchestratorController.js does, so with no GEMINI_API_KEY the SDK could
// construct a client object without throwing, `ai` would stay truthy, and
// every request would pass the `if (!ai)` guard below only to fail deep
// inside the Gemini call instead of failing fast with a clear message.
let ai = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } else {
    console.warn('[RetailFlow AI] GEMINI_API_KEY not set — AI voice features disabled.');
  }
} catch (e) {
  console.warn('[RetailFlow AI] Gemini client not initialised — check GEMINI_API_KEY.');
}

// Escape regex special characters in voice-transcribed names before they're
// dropped into a $regex query. Without this, a product/employee name
// containing characters like "(" or "*" either throws an invalid-regex
// error or builds an unintended wildcard pattern.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE CACHE — Store heavy database aggregations in memory (5 min cache)
// ─────────────────────────────────────────────────────────────────────────────
const cache = {
  lowStock: { data: null, timestamp: 0 },
  pairingRules: { data: null, timestamp: 0 },
};
const CACHE_DURATION_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Helper to determine a realistic default grocery price if missing
function getFallbackPrice(name) {
  const lower = name.toLowerCase();
  if (lower.includes('butter')) return { price: 60, cost: 42 };
  if (lower.includes('bread')) return { price: 42, cost: 29.4 };
  if (lower.includes('soda')) return { price: 20, cost: 14 };
  if (lower.includes('milk')) return { price: 30, cost: 21 };
  if (lower.includes('egg')) return { price: 6, cost: 4.2 };
  if (lower.includes('rice')) return { price: 50, cost: 35 };
  if (lower.includes('biscuit')) return { price: 10, cost: 7 };
  if (lower.includes('cheese')) return { price: 120, cost: 84 };
  if (lower.includes('sugar')) return { price: 45, cost: 31.5 };
  if (lower.includes('tea')) return { price: 80, cost: 56 };
  return { price: 50, cost: 35 }; // general fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP A — Build a dynamic, data-enriched system prompt
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(allProducts, lowStockList, pairingRules, dailySales) {
  // Serialise ALL products and prices in the inventory for dynamic lookup!
  const productContext = allProducts.length > 0
    ? allProducts.map(p => `${p.name} (price: ₹${p.sellingPrice} per ${p.unit})`).join('; ')
    : 'No products in inventory.';

  const lowStockSummary = lowStockList.length > 0
    ? lowStockList.map(i => `${i.name} (stock: ${i.currentStock} ${i.unit})`).join('; ')
    : 'No critical stock alerts right now.';

  const statsContext = dailySales
    ? `Revenue: ₹${dailySales.revenue}, Profit: ₹${dailySales.profit}, Orders: ${dailySales.orderCount}`
    : 'No stats yet.';

  return `
Role: You are the RetailFlow Autonomous Agent. You are NOT a chatbot. You are a high-speed data-processing API router.

CONVERSATIONAL STEP-BY-STEP FLOWS (CRITICAL):

1. INTENT: PLACE_ORDER (Placing an Order)
   You MUST gather these details step-by-step from the user before placing the order:
   - Step 1: Customer Name (e.g. "Aapka naam kya hai?")
   - Step 2: Contact Number / Phone (e.g. "Aapka mobile number kya hai?")
   - Step 3: Order Details (Which products and their quantities)
   
   If any of these details are missing, ask for them politely ONE BY ONE. DO NOT ask for everything at once. Keep questions extremely short and friendly.
   If the user already specified some fields in their input, skip those questions and ask for the remaining ones.
   
   Once you have gathered Customer Name, Contact Number, and Order Details:
   - Look up the prices of the products in the DATABASE CONTEXT.
   - Calculate the totalAmount (sellingPrice * quantity for each item).
   - Output "status": "pending".
   - Ask for confirmation in Hinglish: "Aapka order total ₹[Amount] hua. Is this your final order to place?"
   
   Once the user confirms (says "yes", "haan", "ok", "place kar do", "final"):
   - Set "intent": "PLACE_ORDER" and "status": "success".
   - Output all gathered customer details, totalAmount, and items (with productName, quantity, and looked-up price) in the data payload.

2. INTENT: ADD_PRODUCT (Adding a New Item to Inventory)
   You MUST gather these details step-by-step from the user before adding the product:
   - Step 1: Product Name (e.g. "Product ka naam kya hai?")
   - Step 2: Stock Quantity (e.g. "Kitni quantity add karni hai?")
   - Step 3: Selling Price (e.g. "Selling price kya hoga?")
   - Step 4: Cost Price (e.g. "Cost price kya hoga?")
   
   If any of these details are missing, ask for them politely ONE BY ONE. DO NOT ask for everything at once.
   If the user already specified some fields, skip those and ask for the rest.
   
   Once you have gathered all 4 fields:
   - Output "status": "pending".
   - Ask for confirmation in Hinglish: "[Qty] [Product] ₹[Selling Price] selling price aur ₹[Cost Price] cost price par add kar doon?"
   
   Once the user confirms (says "yes", "haan", "ok"):
   - Set "intent": "ADD_PRODUCT" and "status": "success".
   - Output the product details in the data payload (items array with productName, quantity, price as selling price, and costPrice).

OUTPUT SCHEMA (STRICT JSON — output ONLY this valid JSON block, no markdown formatting, no code fences):
{
  "intent": "ADD_PRODUCT | PLACE_ORDER | MARK_ATTENDANCE | FETCH_ANALYTICS | ERROR",
  "data": { 
    "items": [
      {
        "productName": "string",
        "quantity": (number),
        "price": (number or null),
        "costPrice": (number or null),
        "unit": "string"
      }
    ],
    "totalAmount": (number or null), 
    "customerName": "string or null",
    "customerPhone": "string or null",
    "status": "success | pending",
    "employeeName": "string or null",
    "attendanceStatus": "Present | Absent | Half-Day | null",
    "analyticsType": "revenue | profit | orders | employees | null"
  },
  "spokenResponse": "Short status question or confirmation message (matching input language, < 15 words)"
}

DATABASE CONTEXT:
- Current Products & Prices: ${productContext}
- Low Stock Alerts: ${lowStockSummary}
- Current Stats: ${statsContext}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP B — Pre-fetch all context data in parallel (High-speed Cached)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchContextData(shopId) {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Check and reuse lowStock cache
  let lowStockPromise;
  if (cache.lowStock.data && (now - cache.lowStock.timestamp < CACHE_DURATION_MS)) {
    lowStockPromise = Promise.resolve(cache.lowStock.data);
  } else {
    lowStockPromise = getLowStockPredictions(shopId).then(data => {
      cache.lowStock.data = data;
      cache.lowStock.timestamp = Date.now();
      return data;
    }).catch(() => []);
  }

  // Check and reuse pairingRules cache
  let pairingPromise;
  if (cache.pairingRules.data && (now - cache.pairingRules.timestamp < CACHE_DURATION_MS)) {
    pairingPromise = Promise.resolve(cache.pairingRules.data);
  } else {
    pairingPromise = getPairingRules(shopId).then(data => {
      cache.pairingRules.data = data;
      cache.pairingRules.timestamp = Date.now();
      return data;
    }).catch(() => ({}));
  }

  // Run fast Mongoose queries in parallel with cached promises
  const [lowList, pairRules, orders, sales, products] = await Promise.all([
    lowStockPromise,
    pairingPromise,
    Order.find({ shop: shopId, createdAt: { $gte: todayStart } }).select('_id').lean(),
    Sale.find({ shop: shopId, date: { $gte: todayStart } }).select('revenue profit').lean(),
    Product.find({ shop: shopId }).select('name sellingPrice unit').lean(),
  ]);

  // Revenue must come from the Sale collection ONLY. Every completed order
  // already gets a mirrored Sale record — both orderController's
  // updateOrderStatus and the PLACE_ORDER branch below create one — so
  // also summing Order.finalAmount here double-counted that same revenue.
  // Worse, this summed ALL orders regardless of status, so Pending/
  // Processing/Cancelled orders (which haven't generated any revenue yet)
  // were being reported as revenue too.
  const saleRevenue = sales.reduce((s, x) => s + (x.revenue || 0), 0);
  const saleProfit  = sales.reduce((s, x) => s + (x.profit  || 0), 0);

  const dailySales = {
    revenue:    saleRevenue,
    profit:     saleProfit,
    orderCount: orders.length, // total orders placed today, any status
  };

  return { lowStockList: lowList, pairingRules: pairRules, dailySales, allProducts: products };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP C — Execute DB action based on classified intent
// ─────────────────────────────────────────────────────────────────────────────
async function executeAction(intent, payload, shopId, pairingRules, aiResult) {
  // If the flow is pending user confirmation, do NOT execute database changes!
  if (payload.status === 'pending') {
    return { internalData: null, navigationTarget: null, refreshRequired: false, recommendation: null };
  }

  let internalData     = null;   // String sent to Gemini for spoken-response fallback
  let navigationTarget = null;
  let refreshRequired  = false;
  let recommendation   = null;   // DB-computed pairing wins over LLM suggestion

  switch (intent) {

    // ── ADD_PRODUCT ─────────────────────────────────────────────────────────
    case 'ADD_PRODUCT': {
      // Build normalized items array supporting both single product payload and list format
      let itemsList = payload.items || [];
      if (itemsList.length === 0 && payload.productName) {
        itemsList.push({
          productName: payload.productName,
          quantity: payload.quantity ?? 1,
          price: payload.price || payload.sellingPrice,
          costPrice: payload.costPrice,
          unit: payload.unit || 'pcs'
        });
      }

      if (itemsList.length === 0) {
        internalData = 'Product details missing.';
        if (aiResult) aiResult.spokenResponse = 'Product details missing.';
        break;
      }

      const addedSummary = [];
      let lastProductName = '';

      for (const item of itemsList) {
        if (!item.productName) continue;
        lastProductName = item.productName;
        const qty = Number(item.quantity ?? 1);

        // Check if product already exists (case-insensitive) to prevent duplicate inventory rows!
        let dbProd = await Product.findOne({
          shop: shopId,
          name: { $regex: new RegExp(`^${escapeRegex(item.productName.trim())}$`, 'i') }
        });

        if (dbProd) {
          // Atomic $inc instead of read-mutate-save. The old read-then-write
          // pattern could lose an update if two ADD_PRODUCT voice commands
          // for the same product landed at nearly the same time.
          const priceUpdate = (item.price && item.price > 0)
            ? { sellingPrice: item.price, costPrice: item.costPrice || (item.price * 0.7) }
            : {};

          dbProd = await Product.findOneAndUpdate(
            { _id: dbProd._id },
            { $inc: { quantity: qty }, $set: priceUpdate },
            { new: true }
          );
          addedSummary.push(`${qty} ${dbProd.name}`);
        } else {
          // Determine non-zero price and cost using intelligent fallback heuristics
          let price = Number(item.price || 0);
          let cost = Number(item.costPrice || price * 0.7);
          if (price <= 0) {
            const fallback = getFallbackPrice(item.productName);
            price = fallback.price;
            cost = fallback.cost;
          }
          const generatedSku = 'VOICE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
          await Product.create({
            shop:         shopId,
            name:         item.productName,
            sku:          generatedSku,
            costPrice:    cost,
            sellingPrice: price,
            quantity:     qty,
            unit:         item.unit || 'pcs',
          });
          addedSummary.push(`${qty} ${item.productName}`);
        }
      }

      internalData = `Added: ${addedSummary.join(', ')}.`;
      refreshRequired  = true;
      navigationTarget = '/inventory';

      // ── Pairing recommendation (DB-computed, most reliable) ──────────────
      if (lastProductName) {
        const matchedKey = Object.keys(pairingRules).find(
          (k) => k.toLowerCase() === lastProductName.toLowerCase()
        );
        if (matchedKey && pairingRules[matchedKey]?.length > 0) {
          const top = pairingRules[matchedKey][0];
          recommendation = `Sir, iske saath ${top.pairedWith} bhi bikta hai.`;
        }
      }
      break;
    }

    // ── PLACE_ORDER ─────────────────────────────────────────────────────────
    case 'PLACE_ORDER': {
      // Build normalized items array
      let itemsList = payload.items || [];
      if (itemsList.length === 0 && payload.productName) {
        itemsList.push({
          productName: payload.productName,
          quantity: payload.quantity ?? 1,
          price: payload.price || payload.sellingPrice,
          unit: payload.unit || 'pcs'
        });
      }

      if (itemsList.length === 0) {
        internalData = 'Order details missing.';
        if (aiResult) aiResult.spokenResponse = 'Order details missing.';
        break;
      }

      let totalAmount = 0;
      let totalCOGS   = 0;
      const orderItems = [];
      const orderSummary = [];

      for (const item of itemsList) {
        if (!item.productName) continue;

        let dbProd = await Product.findOne({
          shop: shopId,
          name: { $regex: new RegExp(`^${escapeRegex(item.productName.trim())}$`, 'i') }
        });

        const requestedQty = Number(item.quantity || 1);

        if (!dbProd) {
          // AUTO-CREATION IN INVENTORY: Missing products are automatically created first!
          let price = Number(item.price || 0);
          let cost = price * 0.7;
          if (price <= 0) {
            const fallback = getFallbackPrice(item.productName);
            price = fallback.price;
            cost = fallback.cost;
          }
          const generatedSku = 'VOICE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
          // Initialize with a default sufficient stock to satisfy the current order deduction
          dbProd = await Product.create({
            shop:         shopId,
            name:         item.productName,
            sku:          generatedSku,
            costPrice:    cost,
            sellingPrice: price,
            quantity:     requestedQty + 10,
            unit:         item.unit || 'pcs',
          });
        }

        // Only ever sell what's actually on the shelf. The old code did a
        // read-then-write (findOne → mutate in JS → save) and, if stock was
        // short, silently zeroed the shelf quantity while STILL billing the
        // customer for the full requested amount — overselling and hiding
        // a real inventory shortfall. This caps the sale at what's
        // available, and uses one atomic conditional update so two
        // concurrent orders can't both read the same stock count and both
        // "succeed" in selling it.
        const fulfilledQty = Math.min(requestedQty, dbProd.quantity);

        if (fulfilledQty <= 0) {
          orderSummary.push(`0 ${dbProd.name} (out of stock)`);
          continue;
        }

        const updatedProd = await Product.findOneAndUpdate(
          { _id: dbProd._id, quantity: { $gte: fulfilledQty } },
          { $inc: { quantity: -fulfilledQty } },
          { new: true }
        );

        // Another order beat us to the remaining stock between our read
        // and this update — skip rather than sell stock that no longer
        // exists.
        if (!updatedProd) {
          orderSummary.push(`0 ${dbProd.name} (out of stock)`);
          continue;
        }

        const subtotal = updatedProd.sellingPrice * fulfilledQty;
        totalAmount += subtotal;
        totalCOGS   += updatedProd.costPrice * fulfilledQty;

        orderItems.push({
          product:     updatedProd._id,
          productName: updatedProd.name,
          sku:         updatedProd.sku,
          unitPrice:   updatedProd.sellingPrice,
          costPrice:   updatedProd.costPrice,
          quantity:    fulfilledQty,
          subtotal
        });

        const shortfallNote = fulfilledQty < requestedQty ? ` (only ${fulfilledQty} in stock)` : '';
        orderSummary.push(`${fulfilledQty} ${updatedProd.name}${shortfallNote}`);
      }

      if (orderItems.length === 0) {
        internalData = 'None of the requested items are in stock.';
        if (aiResult) aiResult.spokenResponse = 'Sorry, stock khatam hai.';
        break;
      }

      // Create a completed Mongoose Order document
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const orderCount = await Order.countDocuments({ shop: shopId });
      const orderNumber = `ORD-${dateStr}-${String(orderCount + 1).padStart(3, '0')}`;

      const newOrder = await Order.create({
        shop: shopId,
        orderNumber,
        customer: { 
          name: payload.customerName || 'Walk-in Customer',
          phone: payload.customerPhone || undefined
        },
        items: orderItems,
        totalAmount,
        finalAmount: totalAmount,
        status: 'Completed'
      });

      // Create a Sale record
      await Sale.create({
        shop:            shopId,
        order:           newOrder._id,
        revenue:         totalAmount,
        costOfGoodsSold: totalCOGS,
        date:            new Date(),
        notes:           `Voice Assistant Order: ${orderSummary.join(', ')}`,
      });
      
      internalData = `Order logged. Total ₹${totalAmount}.`;
      // Override provisional spokenResponse with precise computed total for safety.
      // Previously both branches of this language check produced the exact
      // same English string, so the Hindi detection did nothing.
      if (aiResult) {
        const lang = (aiResult.spokenResponse || '').match(/[\u0900-\u097F]/) ? 'hi' : 'en';
        aiResult.spokenResponse = lang === 'hi'
          ? `Order ho gaya. Total ₹${totalAmount}.`
          : `Order placed. Total ₹${totalAmount}.`;
      }
      refreshRequired  = true;
      navigationTarget = '/orders';
      break;
    }

    // ── MARK_ATTENDANCE ─────────────────────────────────────────────────────
    case 'MARK_ATTENDANCE': {
      if (!payload.employeeName || !payload.attendanceStatus) {
        internalData = 'Employee attendance details missing.';
        if (aiResult) aiResult.spokenResponse = 'Attendance details missing.';
        break;
      }
      const emp = await Employee.findOne({
        shop:     shopId,
        name:     { $regex: new RegExp(escapeRegex(payload.employeeName.trim()), 'i') },
        isActive: true,
      });
      if (!emp) {
        internalData = 'Employee not found.';
        if (aiResult) aiResult.spokenResponse = 'Employee not found.';
      } else {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        await Attendance.findOneAndUpdate(
          { shop: shopId, employee: emp._id, date: { $gte: todayStart } },
          { shop: shopId, employee: emp._id, status: payload.attendanceStatus, date: new Date() },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        internalData = 'Attendance marked successfully.';
        refreshRequired  = true;
        navigationTarget = '/employees';
      }
      break;
    }

    // ── FETCH_ANALYTICS ─────────────────────────────────────────────────────
    case 'FETCH_ANALYTICS': {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const type = payload.analyticsType || 'revenue';

      if (type === 'revenue' || type === 'profit') {
        const [monthlySales, todaySales] = await Promise.all([
          Sale.find({ shop: shopId, date: { $gte: monthStart } }).lean(),
          Sale.find({ shop: shopId, date: { $gte: todayStart } }).lean(),
        ]);
        const monthRev    = monthlySales.reduce((s, x) => s + (x.revenue || 0), 0);
        const monthProfit = monthlySales.reduce((s, x) => s + (x.profit  || 0), 0);
        internalData = `Month revenue: ₹${monthRev.toLocaleString('en-IN')}, profit: ₹${monthProfit.toLocaleString('en-IN')}.`;
        navigationTarget = '/finance';
      } else if (type === 'orders') {
        const orders = await Order.find({ shop: shopId, createdAt: { $gte: todayStart } }).lean();
        internalData = `Today orders count: ${orders.length}.`;
        navigationTarget = '/orders';
      } else if (type === 'employees') {
        const empCount = await Employee.countDocuments({ shop: shopId, isActive: true });
        internalData = `Active employees: ${empCount}.`;
        navigationTarget = '/employees';
      }
      break;
    }

    // ── ERROR / default ─────────────────────────────────────────────────────
    case 'ERROR':
    default:
      break;
  }

  return { internalData, navigationTarget, refreshRequired, recommendation };
}

async function generateContentWithFallback(aiClient, options) {
  const models = [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
  ];
  let lastError = null;

  for (const modelName of models) {
    let retries = 2; // Only retry 2 times max to prevent slow responses
    let delay = 500;  // Start with 500ms delay to keep it lightning-fast

    while (retries > 0) {
      try {
        const callOpts = { ...options, model: modelName };
        return await aiClient.models.generateContent(callOpts);
      } catch (err) {
        console.warn(`[RetailFlow AI] Model ${modelName} call failed: ${err.message}. Retries left: ${retries - 1}`);
        lastError = err;

        const isRateLimit =
          err.status === 429 ||
          err.message?.includes('429') ||
          err.message?.includes('RESOURCE_EXHAUSTED') ||
          err.message?.includes('quota');
        const isOverloaded =
          err.status === 503 ||
          err.message?.includes('503') ||
          err.message?.includes('high demand') ||
          err.message?.includes('UNAVAILABLE');

        if (isRateLimit || isOverloaded) {
          retries--;
          if (retries > 0) {
            console.log(`[RetailFlow AI] Rate-limited. Waiting ${delay}ms before retrying ${modelName}...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2; // exponential backoff (500ms -> 1000ms)
            continue;
          }
        }
        break; // break early for other errors to instantly swap models
      }
    }
  }
  throw lastError;
}

// MAIN CONTROLLER EXPORT
// ─────────────────────────────────────────────────────────────────────────────
exports.processVoiceCommand = async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        message: 'AI Assistant is not configured — GEMINI_API_KEY is missing.',
      });
    }

    const { text, history } = req.body;
    if (!text) return res.status(400).json({ message: 'No text provided.' });

    const shopId = req.user._id; // consistent with every other controller (avoids relying on the string `id` virtual)

    // ── A: Fetch live context data (utilizes 0ms in-memory cache) ──────────
    const { lowStockList, pairingRules, dailySales, allProducts } =
      await fetchContextData(shopId);

    // ── B: Build data-enriched system prompt ──────────────────────────────
    const systemPrompt = buildSystemPrompt(allProducts, lowStockList, pairingRules, dailySales);

    // ── C: Build conversation context (last 6 turns max) ──────────────────
    let promptContext = `User: ${text}`;
    if (history && history.length > 0) {
      const recentHistory = history.slice(-6);
      promptContext =
        recentHistory.map((h) => `${h.role}: ${h.content}`).join('\n') +
        `\nUser: ${text}`;
    }

    // ── D: Classify intent via Gemini with dynamic fallback ────────────────
    const llmResponse = await generateContentWithFallback(ai, {
      contents: promptContext,
      config: {
        systemInstruction:  systemPrompt,
        responseMimeType:   'application/json',
      },
    });

    let aiResult;
    try {
      const raw = llmResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
      aiResult  = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({
        message: 'Failed to parse AI JSON response.',
        error:   e.message,
      });
    }

    const { intent = 'ERROR', data = {} } = aiResult;

    // ── E: Execute DB action (and pass aiResult to allow dynamic spokenResponse injection) 
    const { internalData, navigationTarget, refreshRequired, recommendation } =
      await executeAction(intent, data, shopId, pairingRules, aiResult);

    // ── F: High-Speed Response optimization: 
    // Only invoke Gemini a second time if the first turn did not yield a spokenResponse!
    if (internalData && !aiResult.spokenResponse) {
      try {
        console.log('[RetailFlow AI] Running fallback sequential spokenResponse call...');
        const spokenRes = await generateContentWithFallback(ai, {
          contents:
            `User ne poocha: "${text}"\n` +
            `System ne fetch kiya: "${internalData}"\n\n` +
            `Sirf ek ultra-brief spoken response generate karo. Keep it strictly under 10 words. Reply in the exact same language (Hindi or English).`,
        });
        aiResult.spokenResponse = spokenRes.text.trim();
      } catch (err) {
        console.error('[RetailFlow AI] Follow-up Gemini call failed:', err.message);
        aiResult.spokenResponse = internalData;
      }
    }

    // ── G: DB-computed recommendation overrides LLM suggestion ────────────
    if (recommendation) {
      aiResult.recommendation = recommendation;
    }

    // ── H: Return enriched, backward-compatible response to frontend ───────
    return res.json({
      intent:          aiResult.intent          || intent,
      data:            aiResult.data            || data,
      recommendation:  aiResult.recommendation  || null,
      spokenResponse:  aiResult.spokenResponse  || 'Done.',
      navigationTarget: navigationTarget         || null,
      refreshRequired:  refreshRequired          || false,
      requiresFollowUp: !!aiResult.requiresFollowUp,
    });

  } catch (error) {
    console.error('[RetailFlow AI] Processing error:', error);
    const is503 =
      error?.status === 503 || (error?.message || '').includes('503');
    const message = is503
      ? 'AI provider is overloaded (503). Thodi der baad try karein.'
      : 'Voice command process karne mein error aaya.';
    return res.status(500).json({ message, error: error.message });
  }
};