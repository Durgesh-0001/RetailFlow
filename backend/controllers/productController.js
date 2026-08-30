const Product = require('../models/Product');
const ErrorResponse = require('../utils/errorResponse');

// Escape regex special characters in user-supplied search terms before
// dropping them into a $regex query. Without this, a search like "a(b"
// throws an invalid-regex error (500), and characters like ".*" let a
// caller build unintended wildcard/DoS-prone patterns.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

    // Filter by stockStatus virtual (done in-memory since it's a virtual)
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
    // quantity == 0 OR quantity <= threshold (using aggregation for the comparison)
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
    // Prevent changing the owning shop
    delete req.body.shop;

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, shop: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) return next(new ErrorResponse('Product not found.', 404));

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Adjust stock quantity only (increment/decrement)
// ─── @route PATCH /api/v1/products/:id/stock
// ─── @access Protected
exports.adjustStock = async (req, res, next) => {
  try {
    const { adjustment } = req.body; // positive = add, negative = remove

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

    res.status(200).json({ success: true, message: 'Product deleted successfully.' });
  } catch (err) {
    next(err);
  }
};