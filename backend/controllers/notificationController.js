const Notification = require('../models/Notification');
const emailService = require('../services/emailService');
const ErrorResponse = require('../utils/errorResponse');

// ─── @desc  Get shop notification logs
// ─── @route GET /api/v1/notifications
// ─── @access Protected
exports.getNotifications = async (req, res, next) => {
  try {
    const { type, status, limit = 50 } = req.query;
    const query = { shop: req.user._id };

    if (type) query.type = type;
    if (status) query.status = status;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10) || 50);

    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Send a test notification email
// ─── @route POST /api/v1/notifications/test
// ─── @access Protected
exports.sendTestNotification = async (req, res, next) => {
  try {
    const { to = req.user.email, subject = 'Test Notification from RetailFlow', message = 'This is a test notification.' } = req.body;

    const result = await emailService.sendMail({
      to,
      subject,
      text: message,
      html: `<div style="font-family: Arial; padding: 20px;"><h2>RetailFlow Notification Test</h2><p>${message}</p></div>`,
      type: 'CUSTOM_ALERT',
      shopId: req.user._id,
      recipientType: 'owner',
    });

    res.status(200).json({
      success: result.success,
      message: result.success ? 'Notification sent successfully.' : 'Simulated notification recorded.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
