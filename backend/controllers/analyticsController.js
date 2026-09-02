const analyticsService = require('../services/analyticsService');

// ─── @desc  Get High-Level Store Overview Analytics
// ─── @route GET /api/v1/analytics/overview
// ─── @access Protected
exports.getOverview = async (req, res, next) => {
  try {
    const data = await analyticsService.getOverview(req.user._id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get Live Dashboard Metrics (Today vs Yesterday)
// ─── @route GET /api/v1/analytics/dashboard
// ─── @access Protected
exports.getDashboard = async (req, res, next) => {
  try {
    const data = await analyticsService.getDashboard(req.user._id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get Revenue & Profit Trends (?from=YYYY-MM-DD&to=YYYY-MM-DD&interval=daily|weekly|monthly)
// ─── @route GET /api/v1/analytics/revenue-trends
// ─── @access Protected
exports.getRevenueTrends = async (req, res, next) => {
  try {
    const { from, to, interval } = req.query;
    const data = await analyticsService.getRevenueTrends(req.user._id, { from, to, interval });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get Product Sales Velocity & Performance Breakdown (?limit=10)
// ─── @route GET /api/v1/analytics/products
// ─── @access Protected
exports.getProductPerformance = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const data = await analyticsService.getProductPerformance(req.user._id, { limit });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get Order Status & Hourly Distribution Analytics
// ─── @route GET /api/v1/analytics/orders
// ─── @access Protected
exports.getOrderAnalytics = async (req, res, next) => {
  try {
    const data = await analyticsService.getOrderAnalytics(req.user._id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get Customer Spend & Loyalty Analytics (?limit=10)
// ─── @route GET /api/v1/analytics/customers
// ─── @access Protected
exports.getCustomerAnalytics = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const data = await analyticsService.getCustomerAnalytics(req.user._id, { limit });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
