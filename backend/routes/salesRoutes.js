const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const cacheMiddleware = require('../middleware/cache');
const {
  getSales,
  getDailySummary,
  getMonthlySummary,
  createSale,
  updateSale,
  deleteSale,
} = require('../controllers/salesController');

router.use(protect);

router.route('/').get(cacheMiddleware(60), getSales).post(createSale);
router.route('/daily').get(cacheMiddleware(60), getDailySummary);
router.route('/monthly').get(cacheMiddleware(120), getMonthlySummary);
router.route('/:id').put(updateSale).delete(deleteSale);

module.exports = router;
