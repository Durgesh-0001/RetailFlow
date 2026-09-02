const express = require('express');
const router = express.Router();
const { register, login, getMe, updateMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.route('/me').get(protect, getMe).put(protect, updateMe);

module.exports = router;
