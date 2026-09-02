const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const cacheMiddleware = require('../middleware/cache');
const {
  getProducts,
  getLowStockProducts,
  getProduct,
  createProduct,
  updateProduct,
  adjustStock,
  deleteProduct,
} = require('../controllers/productController');

router.use(protect);

router.route('/').get(cacheMiddleware(120), getProducts).post(createProduct);
router.route('/low-stock').get(cacheMiddleware(60), getLowStockProducts);
router.route('/:id').get(cacheMiddleware(120), getProduct).put(updateProduct).delete(deleteProduct);
router.patch('/:id/stock', adjustStock);

module.exports = router;
