const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const ErrorResponse = require('../utils/errorResponse');

// ─── @desc  Get all orders (filterable by status)
// ─── @route GET /api/v1/orders?status=Pending
// ─── @access Protected
exports.getOrders = async (req, res, next) => {
  try {
    const query = { shop: req.user._id };
    if (req.query.status) query.status = req.query.status;

    const orders = await Order.find(query).sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Get a single order
// ─── @route GET /api/v1/orders/:id
// ─── @access Protected
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, shop: req.user._id });

    if (!order) return next(new ErrorResponse('Order not found.', 404));

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Create a new order (auto-deducts stock)
// ─── @route POST /api/v1/orders
// ─── @access Protected
exports.createOrder = async (req, res, next) => {
  // Use a session for atomicity: if stock deduction fails, order is rolled back
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { customer, items, discount = 0, notes } = req.body;

    if (!items || items.length === 0) {
      // The transaction session was already started above — abort and end
      // it before bailing out, otherwise this leaves a hanging transaction
      // open on the connection every time someone submits an empty cart.
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Order must contain at least one item.', 400));
    }

    let totalAmount = 0;
    let totalCOGS   = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = await Product.findOne({
        _id: item.product,
        shop: req.user._id,
      }).session(session);

      if (!product) {
        await session.abortTransaction();
        return next(new ErrorResponse(`Product ${item.product} not found.`, 404));
      }

      if (product.quantity < item.quantity) {
        await session.abortTransaction();
        return next(
          new ErrorResponse(
            `Insufficient stock for "${product.name}". Available: ${product.quantity}, Requested: ${item.quantity}.`,
            400
          )
        );
      }

      // Deduct stock
      product.quantity -= item.quantity;
      await product.save({ session });

      const subtotal = product.sellingPrice * item.quantity;
      totalAmount += subtotal;
      totalCOGS   += product.costPrice * item.quantity;

      resolvedItems.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        unitPrice: product.sellingPrice,
        costPrice: product.costPrice,
        quantity: item.quantity,
        subtotal,
      });
    }

    const finalAmount = totalAmount - discount;

    const [order] = await Order.create(
      [{ shop: req.user._id, customer, items: resolvedItems, totalAmount, discount, finalAmount, notes }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// ─── @desc  Update order status
// ─── @route PATCH /api/v1/orders/:id/status
// ─── @access Protected
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return next(new ErrorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}.`, 400));
    }

    const order = await Order.findOne({ _id: req.params.id, shop: req.user._id });
    if (!order) return next(new ErrorResponse('Order not found.', 404));

    const previousStatus = order.status;
    order.status = status;
    await order.save();

    // ── Auto-create a Sale record when order is marked Completed ──────────────
    if (status === 'Completed' && previousStatus !== 'Completed') {
      const revenue = order.finalAmount;
      const cogs    = order.items.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);

      await Sale.create({
        shop: req.user._id,
        order: order._id,
        date: new Date(),
        revenue,
        costOfGoodsSold: cogs,
        notes: `Auto-logged from Order ${order.orderNumber}`,
      });
    }

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// ─── @desc  Delete / cancel an order
// ─── @route DELETE /api/v1/orders/:id
// ─── @access Protected
exports.deleteOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({ _id: req.params.id, shop: req.user._id }).session(session);

    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Order not found.', 404));
    }

    // Restore the stock that was deducted at creation time. The previous
    // version deleted the order outright without giving inventory back,
    // so every deleted/cancelled order permanently lost that stock.
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { quantity: item.quantity } },
        { session }
      );
    }

    // If the order had already been marked Completed, updateOrderStatus
    // auto-created a matching Sale record for it. Deleting the order
    // without deleting that Sale left a dangling record pointing at a
    // non-existent order and kept inflating revenue/profit reports.
    if (order.status === 'Completed') {
      await Sale.findOneAndDelete({ order: order._id, shop: req.user._id }).session(session);
    }

    await Order.findByIdAndDelete(order._id).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, message: 'Order deleted successfully and stock restored.' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};