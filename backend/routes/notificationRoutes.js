const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getNotifications, sendTestNotification } = require('../controllers/notificationController');

router.use(protect);

router.get('/', getNotifications);
router.post('/test', sendTestNotification);

module.exports = router;
