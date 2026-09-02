const Product = require('../models/Product');
const ErrorResponse = require('../utils/errorResponse');
const redisService = require('../services/redisService');
const kafkaService = require('../services/kafkaService');
const emailService = require('../services/emailService');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper to invalidate product and analytics caches
const invalidateShopCaches = async (shopId) => {
  await Promise.all([
    redisService.invalidatePattern(`cache:http:${shopId}:*`),
    redisService.invalidatePattern(`cache:analytics:*:${shopId}`),
  ]);
};

// ─── @desc  Get all products for the logged-in shop
// ─── @route GET /api/v1/products
// ─── @access Protected
exports.getProducts = async (req, res, next) => {
  try {
    const { category, search, stockStatus } = req.query;
    const query = { shop: req.user._id };

    if (category) query.category = { $regex: escapeRegex(category), $options: 'i' };
    if (search)   query.name     = { $regex: escapeRegex(search),   $options: 'i' };

    let products = await Product.find(query).sort({ createdAt: -1 });

    if (stockStatus) {
      products = products.filter((p) => p.stockStatus === stockStatus);
    }

    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get low-stock / out-of-stock products
// ─── @route GET /api/v1/products/low-stock
// ─── @access Protected
exports.getLowStockProducts = async (req, res, next) => {
  try {
    const products = await Product.find({
      shop: req.user._id,
      $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
    }).sort({ quantity: 1 });

    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get a single product
// ─── @route GET /api/v1/products/:id
// ─── @access Protected
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, shop: req.user._id });

    if (!product) return next(new ErrorResponse('Product not found.', 404));

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Create a new product
// ─── @route POST /api/v1/products
// ─── @access Protected
exports.createProduct = async (req, res, next) => {
  try {
    req.body.shop = req.user._id;
    const product = await Product.create(req.body);

    await invalidateShopCaches(req.user._id);

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Update product details
// ─── @route PUT /api/v1/products/:id
// ─── @access Protected
exports.updateProduct = async (req, res, next) => {
  try {
    delete req.body.shop;

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, shop: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) return next(new ErrorResponse('Product not found.', 404));

    await invalidateShopCaches(req.user._id);

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Adjust stock quantity (increment/decrement)
// ─── @route PATCH /api/v1/products/:id/stock
// ─── @access Protected
exports.adjustStock = async (req, res, next) => {
  try {
    const { adjustment } = req.body;

    if (adjustment === undefined) {
      return next(new ErrorResponse('Please provide an adjustment value (positive or negative).', 400));
    }

    const product = await Product.findOne({ _id: req.params.id, shop: req.user._id });
    if (!product) return next(new ErrorResponse('Product not found.', 404));

    const newQty = product.quantity + Number(adjustment);
    if (newQty < 0) {
      return next(new ErrorResponse(`Cannot reduce stock below 0. Current stock: ${product.quantity}.`, 400));
    }

    product.quantity = newQty;
    await product.save();

    await invalidateShopCaches(req.user._id);

    // Stream stock update event to Kafka
    kafkaService.publishStockUpdated(product, adjustment, req.user).catch(() => {});

    // If stock hit or fell below threshold, dispatch low-stock email alert
    if (product.quantity <= product.lowStockThreshold) {
      emailService.sendLowStockAlert(product, req.user).catch(() => {});
    }

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Delete a product
// ─── @route DELETE /api/v1/products/:id
// ─── @access Protected
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, shop: req.user._id });

    if (!product) return next(new ErrorResponse('Product not found.', 404));

    await invalidateShopCaches(req.user._id);

    res.status(200).json({ success: true, message: 'Product deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
