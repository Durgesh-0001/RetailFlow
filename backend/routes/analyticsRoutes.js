const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const cacheMiddleware = require('../middleware/cache');
const {
  getOverview,
  getDashboard,
  getRevenueTrends,
  getProductPerformance,
  getOrderAnalytics,
  getCustomerAnalytics,
} = require('../controllers/analyticsController');

router.use(protect);

router.get('/overview', cacheMiddleware(300), getOverview);
router.get('/dashboard', cacheMiddleware(60), getDashboard);
router.get('/revenue-trends', cacheMiddleware(300), getRevenueTrends);
router.get('/products', cacheMiddleware(300), getProductPerformance);
router.get('/orders', cacheMiddleware(300), getOrderAnalytics);
router.get('/customers', cacheMiddleware(300), getCustomerAnalytics);

module.exports = router;
