const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const ErrorResponse = require('../utils/errorResponse');
const kafkaService = require('../services/kafkaService');
const redisService = require('../services/redisService');

// Helper to invalidate order & analytics caches
const invalidateOrderCaches = async (shopId) => {
  await Promise.all([
    redisService.invalidatePattern(`cache:http:${shopId}:*`),
    redisService.invalidatePattern(`cache:analytics:*:${shopId}`),
  ]);
};

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

// ─── @desc  Create a new order (auto-deducts stock atomically)
// ─── @route POST /api/v1/orders
// ─── @access Protected
exports.createOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { customer, items, discount = 0, notes, status = 'Completed' } = req.body;

    if (!items || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Order must contain at least one item.', 400));
    }

    let totalAmount = 0;
    let totalCOGS   = 0;
    const resolvedItems = [];
    const lowStockAlerts = [];

    for (const item of items) {
      const product = await Product.findOne({
        _id: item.product,
        shop: req.user._id,
      }).session(session);

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse(`Product ${item.product} not found.`, 404));
      }

      if (product.quantity < item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return next(
          new ErrorResponse(
            `Insufficient stock for "${product.name}". Available: ${product.quantity}, Requested: ${item.quantity}.`,
            400
          )
        );
      }

      // Deduct stock inside transaction
      product.quantity -= item.quantity;
      await product.save({ session });

      if (product.quantity <= product.lowStockThreshold) {
        lowStockAlerts.push(product);
      }

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

    const finalAmount = Math.max(0, totalAmount - discount);

    const [order] = await Order.create(
      [{
        shop: req.user._id,
        customer,
        items: resolvedItems,
        totalAmount,
        discount,
        finalAmount,
        status,
        notes,
      }],
      { session }
    );

    // Auto-create Sale ledger record if order is Completed
    if (status === 'Completed') {
      await Sale.create(
        [{
          shop: req.user._id,
          order: order._id,
          date: new Date(),
          revenue: finalAmount,
          costOfGoodsSold: totalCOGS,
          notes: `Auto-logged from Order ${order.orderNumber}`,
        }],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Invalidate Redis caches
    invalidateOrderCaches(req.user._id).catch(() => {});

    // Stream ORDER_CREATED event to Kafka for downstream consumers (Email, Analytics)
    kafkaService.publishOrderCreated(order, req.user).catch((e) => {
      console.warn('⚠️ [orderController] Kafka publish failed (non-blocking):', e.message);
    });

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled'];

    if (!status || !validStatuses.includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}.`, 400));
    }

    const order = await Order.findOne({ _id: req.params.id, shop: req.user._id }).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Order not found.', 404));
    }

    const previousStatus = order.status;
    order.status = status;

    // Handle Completed status -> create Sale record if not already created
    if (status === 'Completed' && previousStatus !== 'Completed') {
      const existingSale = await Sale.findOne({ order: order._id, shop: req.user._id }).session(session);
      if (!existingSale) {
        const cogs = order.items.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
        await Sale.create(
          [{
            shop: req.user._id,
            order: order._id,
            date: new Date(),
            revenue: order.finalAmount,
            costOfGoodsSold: cogs,
            notes: `Auto-logged from Order ${order.orderNumber}`,
          }],
          { session }
        );
      }
    }

    // Handle Cancelled status -> restore stock & remove Sale if cancelling a completed order
    if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { quantity: item.quantity } },
          { session }
        );
      }
      await Sale.findOneAndDelete({ order: order._id, shop: req.user._id }).session(session);
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Invalidate Redis caches
    invalidateOrderCaches(req.user._id).catch(() => {});

    // Stream ORDER_STATUS_UPDATED event to Kafka
    kafkaService.publishOrderStatusUpdated(order, previousStatus, req.user).catch(() => {});

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// ─── @desc  Delete an order
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

    // Restore stock if not already cancelled
    if (order.status !== 'Cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { quantity: item.quantity } },
          { session }
        );
      }
    }

    // Delete matching Sale record if exists
    await Sale.findOneAndDelete({ order: order._id, shop: req.user._id }).session(session);
    await Order.findByIdAndDelete(order._id).session(session);

    await session.commitTransaction();
    session.endSession();

    // Invalidate Redis caches
    invalidateOrderCaches(req.user._id).catch(() => {});

    res.status(200).json({ success: true, message: 'Order deleted successfully and inventory adjusted.' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};
