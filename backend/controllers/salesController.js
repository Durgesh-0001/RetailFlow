const Sale = require('../models/Sale');
const ErrorResponse = require('../utils/errorResponse');
const redisService = require('../services/redisService');

const dayRange = (dateStr) => {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const invalidateSalesCaches = async (shopId) => {
  await Promise.all([
    redisService.invalidatePattern(`cache:analytics:*:${shopId}`),
    redisService.invalidatePattern(`cache:http:${shopId}:*`),
  ]);
};

// ─── @desc  Get all sales
// ─── @route GET /api/v1/sales
// ─── @access Protected
exports.getSales = async (req, res, next) => {
  try {
    const query = { shop: req.user._id };

    if (req.query.from || req.query.to) {
      query.date = {};
      if (req.query.from) query.date.$gte = new Date(req.query.from);
      if (req.query.to)   query.date.$lte = new Date(req.query.to + 'T23:59:59.999Z');
    }

    const sales = await Sale.find(query).populate('order', 'orderNumber customer').sort({ date: -1 });

    res.status(200).json({ success: true, count: sales.length, data: sales });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get daily summary
// ─── @route GET /api/v1/sales/daily?date=YYYY-MM-DD
// ─── @access Protected
exports.getDailySummary = async (req, res, next) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const { start, end } = dayRange(dateStr);

    const [summary] = await Sale.aggregate([
      { $match: { shop: req.user._id, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$revenue' },
          totalCOGS:    { $sum: '$costOfGoodsSold' },
          totalProfit:  { $sum: '$profit' },
          salesCount:   { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      date: dateStr,
      data: summary || { totalRevenue: 0, totalCOGS: 0, totalProfit: 0, salesCount: 0 },
    });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get monthly revenue & profit breakdown
// ─── @route GET /api/v1/sales/monthly?month=5&year=2024
// ─── @access Protected
exports.getMonthlySummary = async (req, res, next) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();

    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59, 999);

    const dailyBreakdown = await Sale.aggregate([
      { $match: { shop: req.user._id, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          revenue: { $sum: '$revenue' },
          cogs:    { $sum: '$costOfGoodsSold' },
          profit:  { $sum: '$profit' },
          count:   { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totals = dailyBreakdown.reduce(
      (acc, d) => {
        acc.totalRevenue += d.revenue;
        acc.totalCOGS    += d.cogs;
        acc.totalProfit  += d.profit;
        return acc;
      },
      { totalRevenue: 0, totalCOGS: 0, totalProfit: 0 }
    );

    res.status(200).json({
      success: true,
      month,
      year,
      totals,
      dailyBreakdown,
    });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Manually log a sale entry
// ─── @route POST /api/v1/sales
// ─── @access Protected
exports.createSale = async (req, res, next) => {
  try {
    req.body.shop = req.user._id;
    const sale = await Sale.create(req.body);

    await invalidateSalesCaches(req.user._id);

    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Update a sale entry
// ─── @route PUT /api/v1/sales/:id
// ─── @access Protected
exports.updateSale = async (req, res, next) => {
  try {
    delete req.body.shop;

    const sale = await Sale.findOneAndUpdate(
      { _id: req.params.id, shop: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!sale) return next(new ErrorResponse('Sale record not found.', 404));

    await invalidateSalesCaches(req.user._id);

    res.status(200).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Delete a sale entry
// ─── @route DELETE /api/v1/sales/:id
// ─── @access Protected
exports.deleteSale = async (req, res, next) => {
  try {
    const sale = await Sale.findOneAndDelete({ _id: req.params.id, shop: req.user._id });

    if (!sale) return next(new ErrorResponse('Sale record not found.', 404));

    await invalidateSalesCaches(req.user._id);

    res.status(200).json({ success: true, message: 'Sale deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
