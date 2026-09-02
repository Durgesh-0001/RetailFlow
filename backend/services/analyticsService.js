/**
 * services/analyticsService.js — High-Performance Shop Analytics Engine
 * ─────────────────────────────────────────────────────────────────────
 * Calculates store metrics, financial trends, product velocity, order distributions,
 * and customer behavior with Redis caching & real-time counter integration.
 */

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const redisService = require('./redisService');

const CACHE_TTL_SECONDS = 300; // 5 minutes

class AnalyticsService {
  /**
   * High-Level Store Overview
   */
  async getOverview(shopId) {
    const cacheKey = `cache:analytics:overview:${shopId}`;
    const cached = await redisService.get(cacheKey);
    if (cached) return { ...cached, _source: 'cache' };

    const shopObjectId = new mongoose.Types.ObjectId(shopId);

    // Run parallel database aggregations
    const [salesStats, orderStats, productStats, uniqueCustomers] = await Promise.all([
      // Sales Aggregate: Total Revenue, COGS, Profit
      Sale.aggregate([
        { $match: { shop: shopObjectId } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$revenue' },
            totalCOGS: { $sum: '$costOfGoodsSold' },
            totalProfit: { $sum: '$profit' },
            salesCount: { $sum: 1 },
          },
        },
      ]),

      // Order Aggregate: Total Orders, Completed, Pending, Cancelled
      Order.aggregate([
        { $match: { shop: shopObjectId } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] },
            },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] },
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] },
            },
            totalOrderValue: { $sum: '$finalAmount' },
          },
        },
      ]),

      // Product Aggregate: Total SKUs, Inventory Retail Value, Cost Value, Out of Stock
      Product.aggregate([
        { $match: { shop: shopObjectId } },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalQuantity: { $sum: '$quantity' },
            inventoryRetailValue: { $sum: { $multiply: ['$quantity', '$sellingPrice'] } },
            inventoryCostValue: { $sum: { $multiply: ['$quantity', '$costPrice'] } },
            outOfStockCount: {
              $sum: { $cond: [{ $eq: ['$quantity', 0] }, 1, 0] },
            },
          },
        },
      ]),

      // Distinct Customers
      Order.distinct('customer.phone', {
        shop: shopObjectId,
        'customer.phone': { $exists: true, $ne: '' },
      }),
    ]);

    const sales = salesStats[0] || { totalRevenue: 0, totalCOGS: 0, totalProfit: 0, salesCount: 0 };
    const orders = orderStats[0] || { totalOrders: 0, completedOrders: 0, pendingOrders: 0, cancelledOrders: 0, totalOrderValue: 0 };
    const products = productStats[0] || { totalProducts: 0, totalQuantity: 0, inventoryRetailValue: 0, inventoryCostValue: 0, outOfStockCount: 0 };

    const averageOrderValue = orders.completedOrders > 0
      ? Math.round((sales.totalRevenue / orders.completedOrders) * 100) / 100
      : 0;

    const profitMargin = sales.totalRevenue > 0
      ? Math.round((sales.totalProfit / sales.totalRevenue) * 10000) / 100
      : 0;

    const result = {
      financials: {
        totalRevenue: sales.totalRevenue,
        totalCOGS: sales.totalCOGS,
        totalProfit: sales.totalProfit,
        profitMarginPercentage: profitMargin,
      },
      orders: {
        total: orders.totalOrders,
        completed: orders.completedOrders,
        pending: orders.pendingOrders,
        cancelled: orders.cancelledOrders,
        averageOrderValue,
      },
      inventory: {
        totalProducts: products.totalProducts,
        totalStockUnits: products.totalQuantity,
        inventoryCostValue: products.inventoryCostValue,
        inventoryRetailValue: products.inventoryRetailValue,
        outOfStockCount: products.outOfStockCount,
      },
      customers: {
        totalUniqueTracked: uniqueCustomers.length,
      },
    };

    await redisService.set(cacheKey, result, CACHE_TTL_SECONDS);
    return { ...result, _source: 'database' };
  }

  /**
   * Live Dashboard Metrics (Today vs Yesterday)
   */
  async getDashboard(shopId) {
    const cacheKey = `cache:analytics:dashboard:${shopId}`;
    const cached = await redisService.get(cacheKey);
    if (cached) return { ...cached, _source: 'cache' };

    const shopObjectId = new mongoose.Types.ObjectId(shopId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const [todaySales, yesterdaySales, todayOrders, recentOrders, lowStockProducts] = await Promise.all([
      // Today's Sales
      Sale.aggregate([
        { $match: { shop: shopObjectId, date: { $gte: todayStart } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$revenue' },
            cogs: { $sum: '$costOfGoodsSold' },
            profit: { $sum: '$profit' },
            count: { $sum: 1 },
          },
        },
      ]),

      // Yesterday's Sales
      Sale.aggregate([
        { $match: { shop: shopObjectId, date: { $gte: yesterdayStart, $lt: todayStart } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$revenue' },
            cogs: { $sum: '$costOfGoodsSold' },
            profit: { $sum: '$profit' },
            count: { $sum: 1 },
          },
        },
      ]),

      // Today's Orders count
      Order.countDocuments({ shop: shopObjectId, createdAt: { $gte: todayStart } }),

      // 5 Most Recent Orders
      Order.find({ shop: shopObjectId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('orderNumber customer finalAmount status createdAt items')
        .lean(),

      // Low stock count & list
      Product.find({
        shop: shopObjectId,
        $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
      })
        .sort({ quantity: 1 })
        .limit(5)
        .select('name sku quantity lowStockThreshold unit')
        .lean(),
    ]);

    const tSales = todaySales[0] || { revenue: 0, profit: 0, cogs: 0, count: 0 };
    const ySales = yesterdaySales[0] || { revenue: 0, profit: 0, cogs: 0, count: 0 };

    const revenueGrowth = ySales.revenue > 0
      ? Math.round(((tSales.revenue - ySales.revenue) / ySales.revenue) * 10000) / 100
      : tSales.revenue > 0 ? 100 : 0;

    const result = {
      today: {
        revenue: tSales.revenue,
        profit: tSales.profit,
        cogs: tSales.cogs,
        salesCount: tSales.count,
        ordersCount: todayOrders,
        revenueGrowthVsYesterday: revenueGrowth,
      },
      yesterday: {
        revenue: ySales.revenue,
        profit: ySales.profit,
        cogs: ySales.cogs,
        salesCount: ySales.count,
      },
      recentOrders,
      lowStockAlerts: lowStockProducts,
    };

    await redisService.set(cacheKey, result, 60); // 1-minute TTL for live dashboard
    return { ...result, _source: 'database' };
  }

  /**
   * Revenue and Profit Trends by Date Interval
   */
  async getRevenueTrends(shopId, { from, to, interval = 'daily' } = {}) {
    const shopObjectId = new mongoose.Types.ObjectId(shopId);

    const matchQuery = { shop: shopObjectId };
    if (from || to) {
      matchQuery.date = {};
      if (from) matchQuery.date.$gte = new Date(from);
      if (to) matchQuery.date.$lte = new Date(to + 'T23:59:59.999Z');
    } else {
      // Default: Last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchQuery.date = { $gte: thirtyDaysAgo };
    }

    let dateFormat;
    switch (interval) {
      case 'monthly':
        dateFormat = '%Y-%m';
        break;
      case 'yearly':
        dateFormat = '%Y';
        break;
      case 'weekly':
        dateFormat = '%Y-W%V';
        break;
      case 'daily':
      default:
        dateFormat = '%Y-%m-%d';
        break;
    }

    const trends = await Sale.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$date' } },
          revenue: { $sum: '$revenue' },
          cogs: { $sum: '$costOfGoodsSold' },
          profit: { $sum: '$profit' },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const summary = trends.reduce(
      (acc, curr) => {
        acc.totalRevenue += curr.revenue;
        acc.totalCOGS += curr.cogs;
        acc.totalProfit += curr.profit;
        acc.totalSales += curr.salesCount;
        return acc;
      },
      { totalRevenue: 0, totalCOGS: 0, totalProfit: 0, totalSales: 0 }
    );

    return {
      interval,
      summary,
      data: trends.map((t) => ({
        date: t._id,
        revenue: t.revenue,
        cogs: t.cogs,
        profit: t.profit,
        count: t.salesCount,
      })),
    };
  }

  /**
   * Product Performance Breakdown (Top Selling, Slow Moving, Category breakdown)
   */
  async getProductPerformance(shopId, { limit = 10 } = {}) {
    const shopObjectId = new mongoose.Types.ObjectId(shopId);

    const [topSelling, categoryBreakdown] = await Promise.all([
      // Top Selling Products from completed orders
      Order.aggregate([
        { $match: { shop: shopObjectId, status: 'Completed' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            productName: { $first: '$items.productName' },
            sku: { $first: '$items.sku' },
            totalQuantitySold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.subtotal' },
            ordersCount: { $sum: 1 },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: parseInt(limit, 10) || 10 },
      ]),

      // Product count and inventory by Category
      Product.aggregate([
        { $match: { shop: shopObjectId } },
        {
          $group: {
            _id: '$category',
            productCount: { $sum: 1 },
            totalStock: { $sum: '$quantity' },
            inventoryValue: { $sum: { $multiply: ['$quantity', '$sellingPrice'] } },
          },
        },
        { $sort: { productCount: -1 } },
      ]),
    ]);

    return {
      topSellingProducts: topSelling,
      categories: categoryBreakdown.map((c) => ({
        category: c._id || 'Uncategorized',
        productCount: c.productCount,
        totalStock: c.totalStock,
        inventoryValue: c.inventoryValue,
      })),
    };
  }

  /**
   * Order Lifecycle & Hourly Distribution
   */
  async getOrderAnalytics(shopId) {
    const shopObjectId = new mongoose.Types.ObjectId(shopId);

    const [statusDistribution, hourlyDistribution] = await Promise.all([
      Order.aggregate([
        { $match: { shop: shopObjectId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$finalAmount' },
          },
        },
      ]),

      Order.aggregate([
        { $match: { shop: shopObjectId } },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      byStatus: statusDistribution.map((s) => ({
        status: s._id,
        count: s.count,
        totalAmount: s.totalAmount,
      })),
      byHourOfDay: hourlyDistribution.map((h) => ({
        hour: `${String(h._id).padStart(2, '0')}:00`,
        count: h.orderCount,
      })),
    };
  }

  /**
   * Customer Insights & Top Spenders
   */
  async getCustomerAnalytics(shopId, { limit = 10 } = {}) {
    const shopObjectId = new mongoose.Types.ObjectId(shopId);

    const topCustomers = await Order.aggregate([
      {
        $match: {
          shop: shopObjectId,
          status: 'Completed',
          'customer.name': { $exists: true, $ne: 'Walk-in Customer' },
        },
      },
      {
        $group: {
          _id: {
            name: '$customer.name',
            phone: '$customer.phone',
            email: '$customer.email',
          },
          totalSpend: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          lastOrderDate: { $max: '$createdAt' },
        },
      },
      { $sort: { totalSpend: -1 } },
      { $limit: parseInt(limit, 10) || 10 },
    ]);

    return {
      topCustomers: topCustomers.map((c) => ({
        name: c._id.name,
        phone: c._id.phone,
        email: c._id.email,
        totalSpend: c.totalSpend,
        totalOrders: c.totalOrders,
        lastOrderDate: c.lastOrderDate,
      })),
    };
  }
}

module.exports = new AnalyticsService();
