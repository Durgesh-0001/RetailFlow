const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const cacheMiddleware = require('../middleware/cache');
const {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  deleteOrder,
} = require('../controllers/orderController');

router.use(protect);

router.route('/').get(cacheMiddleware(60), getOrders).post(createOrder);
router.route('/:id').get(cacheMiddleware(60), getOrder).delete(deleteOrder);
router.patch('/:id/status', updateOrderStatus);

module.exports = router;
