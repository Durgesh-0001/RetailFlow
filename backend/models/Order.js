const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Snapshot fields — protect historical data from price/name changes
    productName: { type: String, required: true },
    sku:         { type: String },
    unitPrice:   { type: Number, required: true },
    costPrice:   { type: Number, required: true },
    quantity:    { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    subtotal:    { type: Number, required: true },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      unique: true,
    },
    customer: {
      name:  { type: String, trim: true, default: 'Walk-in Customer' },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
    },
    items: {
      type: [OrderItemSchema],
      validate: [(v) => v.length > 0, 'Order must have at least one item'],
    },
    totalAmount:  { type: Number, required: true },
    discount:     { type: Number, default: 0, min: 0 },
    finalAmount:  { type: Number, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Completed', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// ─── Auto-generate order number before saving ────────────────────────────────
OrderSchema.pre('save', async function (next) {
  if (this.isNew && !this.orderNumber) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    });
    this.orderNumber = `ORD-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', OrderSchema);
