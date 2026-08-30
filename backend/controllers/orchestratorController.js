/**
 * orchestratorController.js — RetailFlow API Gateway Orchestrator
 * ─────────────────────────────────────────────────────────────
 * Maps Hindi / Hinglish / English commands to a strict JSON schema,
 * enriches them with live DB context, and fans out actions
 * (e.g. order placement) to Kafka.
 */

const { GoogleGenAI } = require('@google/genai');
const crypto = require('crypto');
const { producer } = require('../config/kafka');

const LLM_TIMEOUT_MS = 8000;
const MAX_SPOKEN_WORDS = 10;
const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview'
];

const RESPONSE_SCHEMA = `{
  "intent": "ADD_PRODUCT | LOG_SALE | PLACE_ORDER | MARK_ATTENDANCE | FETCH_ANALYTICS | ASK_MISSING | ERROR",
  "payload": {
    "entity_id": "string or null",
    "value": (number or null),
    "meta": {
      "customerName": "string or null",
      "items": [{ "product_id": "string", "name": "string", "quantity": (number) }],
      "missing_slots": ["array of strings e.g. customerName, items, quantities"]
    }
  },
  "spokenResponse": "Concise language-matched confirmation (<10 words)"
}`;

// ─── Gemini client (singleton) ───────────────────────────────────
let ai = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
} catch (e) {
  console.warn('[RetailFlow Orchestrator] Gemini client could not initialise:', e.message);
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Deterministic request id for idempotency. */
function buildRequestId(userId, timestamp, text) {
  return crypto.createHash('sha256').update(`${userId}-${timestamp}-${text}`).digest('hex');
}

/** Builds the system prompt with live DB context baked in. */
function buildSystemInstruction(contextData) {
  const products = contextData.products || [];
  const productsStr = products
    .map(p => `${p.name} (ID: ${p.id}, price: ₹${p.price}, stock: ${p.stock})`)
    .join('; ');
  const salesStr = contextData.sales_today
    ? `Revenue: ₹${contextData.sales_today.revenue}, Profit: ₹${contextData.sales_today.profit}`
    : 'No sales today.';

  return `
Role: You are the RetailFlow API Gateway Orchestrator. You are a high-speed data processing API mapper.

CONTRACT RULES:
1. INTENT MAPPING: Map natural language to: ADD_PRODUCT | LOG_SALE | PLACE_ORDER | MARK_ATTENDANCE | FETCH_ANALYTICS | ASK_MISSING | ERROR.
2. DATA INTEGRITY: Use provided [DATABASE CONTEXT]. If a product exists in context (e.g. matching "bread" to "Britannia Bread"), map to its exact name and ID. Do not ask for info that is present in the context.
3. PARTIAL INFORMATION / ASK_MISSING: If vital slots (customerName, contact details, items, quantities) are completely missing, set "intent" to "ASK_MISSING" and list the missing slots in payload. Ask for only ONE missing detail in spokenResponse.
4. BREVITY: spokenResponse MUST be under 10 words, no greetings, no fluff.
5. STRICT JSON SCHEMA: Return ONLY raw JSON (no markdown fences) matching:
${RESPONSE_SCHEMA}

[DATABASE CONTEXT]:
- Products In Stock: ${productsStr}
- Sales Today Metrics: ${salesStr}
`.trim();
}

/** Calls Gemini, trying each model in the fallback chain until one succeeds. */
async function queryGemini(text, systemInstruction) {
  if (!ai) throw new Error('Gemini API client not initialised.');

  let lastErr = null;
  for (const modelName of MODEL_FALLBACK_CHAIN) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `Process this input: "${text}"`,
        config: { systemInstruction, responseMimeType: 'application/json' }
      });
      if (response?.text) return response.text.trim();
    } catch (err) {
      lastErr = err;
      console.warn(`[RetailFlow Orchestrator] Model ${modelName} failed: ${err.message}`);
    }
  }
  throw lastErr || new Error('All Gemini model calls failed.');
}

/** Races a promise against a timeout, rejecting with TIMEOUT_EXCEEDED. */
function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms)
  );
  return Promise.race([promise, timeout]);
}

/** Strips markdown fences and safely parses the LLM's JSON output. */
function parseLLMResponse(rawText) {
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned); // caller handles parse errors
}

/**
 * Matches order/sale items against DB context, fills in missing
 * product_id/name, and computes the total value.
 */
function enrichOrderItems(payload, contextData) {
  if (!payload.entity_id && payload.meta.customerName) {
    payload.entity_id = payload.meta.customerName;
  }

  if (!Array.isArray(payload.meta.items)) return;

  const products = contextData.products || [];
  let total = 0;

  for (const item of payload.meta.items) {
    const match = products.find(p =>
      p.id === item.product_id ||
      (item.name && p.name.toLowerCase() === item.name.toLowerCase())
    );
    if (!match) continue;

    item.product_id = item.product_id || match.id;
    item.name = item.name || match.name;
    total += match.price * (item.quantity || 1);
  }

  payload.value = total;
}

/** Truncates spokenResponse to the configured word limit. */
function enforceWordLimit(spokenResponse, maxWords = MAX_SPOKEN_WORDS) {
  const words = spokenResponse.trim().split(/\s+/);
  if (words.length <= maxWords) return spokenResponse;
  return words.slice(0, maxWords - 1).join(' ') + '.';
}

/** Returns a 403 payload if the intent requires a permission the caller lacks. */
function checkAuthorization(intent, roles) {
  if (intent === 'PLACE_ORDER' && roles.can_place_order !== true) {
    return { action: 'PLACE_ORDER', spokenResponse: 'Order place karne ki permission nahi hai.' };
  }
  if (intent === 'ADD_PRODUCT' && roles.can_add_product !== true && roles.role !== 'owner') {
    return { action: 'ADD_PRODUCT', spokenResponse: 'Product add karne ki permission nahi hai.' };
  }
  return null;
}

/** Publishes a PLACE_ORDER event to Kafka; failures are logged, not thrown. */
async function publishOrderEvent({ requestId, intent, payload, timestamp, userId }) {
  try {
    console.log(`[Trace ID: ${requestId}] Publishing order event...`);
    await producer.send({
      topic: 'retailflow.orders.v1',
      messages: [{
        key: requestId,
        value: JSON.stringify({ request_id: requestId, intent, payload, timestamp, userId }),
        headers: { correlation_id: requestId }
      }]
    });
    console.log(`[Trace ID: ${requestId}] Event published to 'retailflow.orders.v1'.`);
  } catch (err) {
    console.error(`[Trace ID: ${requestId}] Kafka publish failed:`, err.message);
  }
}

// ─── Controller ───────────────────────────────────────────────────

/**
 * POST /api/v1/ai/orchestrator
 */
exports.processGatewayCommand = async (req, res) => {
  const userId = req.user?.id || req.body.userId || 'anonymous-user';
  const { text, context_data: contextData = {}, roles = {}, timestamp = Date.now() } = req.body;
  const requestId = buildRequestId(userId, timestamp, text);

  if (!text || typeof text !== 'string') {
    return res.status(400).json({
      request_id: requestId,
      intent: 'ERROR',
      payload: { error: 'BAD_REQUEST', message: 'Input command "text" is required.' },
      spokenResponse: 'Command khali hai.'
    });
  }

  const systemInstruction = buildSystemInstruction(contextData);

  let rawResult;
  try {
    rawResult = await withTimeout(queryGemini(text, systemInstruction), LLM_TIMEOUT_MS);
  } catch (error) {
    if (error.message === 'TIMEOUT_EXCEEDED') {
      return res.status(503).json({
        request_id: requestId,
        intent: 'ERROR',
        payload: { error: 'TIMEOUT', message: 'System busy, please try again.' },
        spokenResponse: 'Server busy hai, thodi der baad koshish karein.'
      });
    }
    console.error('[RetailFlow Orchestrator] Execution error:', error.message);
    return res.status(500).json({
      request_id: requestId,
      intent: 'ERROR',
      payload: { error: 'INTERNAL_SERVER_ERROR', message: error.message },
      spokenResponse: 'Kuch gadbad ho gayi. Firse try karein.'
    });
  }

  let parsed;
  try {
    parsed = parseLLMResponse(rawResult);
  } catch (e) {
    console.error('[RetailFlow Orchestrator] JSON parse failed. Raw text:', rawResult);
    return res.status(500).json({
      request_id: requestId,
      intent: 'ERROR',
      payload: { error: 'PARSE_ERROR', rawText: rawResult },
      spokenResponse: 'A I response reading failed.'
    });
  }

  let intent = parsed.intent || 'ERROR';
  const payload = parsed.payload || {};
  payload.meta = payload.meta || {};
  let spokenResponse = parsed.spokenResponse || 'Ho gaya.';

  if (intent === 'PLACE_ORDER' || intent === 'LOG_SALE') {
    enrichOrderItems(payload, contextData);
  }

  if (payload.meta.missing_slots?.length > 0) {
    intent = 'ASK_MISSING';
  }

  const authFailure = checkAuthorization(intent, roles);
  if (authFailure) {
    return res.status(403).json({
      request_id: requestId,
      intent: 'ERROR',
      payload: { error: 'UNAUTHORIZED', action: authFailure.action },
      spokenResponse: authFailure.spokenResponse
    });
  }

  spokenResponse = enforceWordLimit(spokenResponse);

  if (intent === 'PLACE_ORDER') {
    await publishOrderEvent({ requestId, intent, payload, timestamp, userId });
  }

  return res.json({ request_id: requestId, intent, payload, spokenResponse });
};