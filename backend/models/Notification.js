const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    recipientType: {
      type: String,
      enum: ['customer', 'owner', 'system'],
      default: 'customer',
    },
    type: {
      type: String,
      enum: [
        'ORDER_CONFIRMATION',
        'ORDER_STATUS_UPDATE',
        'LOW_STOCK_ALERT',
        'DAILY_SALES_DIGEST',
        'CUSTOM_ALERT',
      ],
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'failed', 'queued'],
      default: 'sent',
    },
    metadata: {
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
      orderNumber: { type: String },
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      errorMessage: { type: String },
      messageId: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', NotificationSchema);
