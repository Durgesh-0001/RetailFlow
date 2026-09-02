/**
 * services/kafkaService.js — RetailFlow Event Publisher
 * ───────────────────────────────────────────────────────
 * Standardized event publishing across orders, inventory, and notifications.
 */

const crypto = require('crypto');
const { producer, TOPICS, isProducerConnected, connectProducer } = require('../config/kafka');

class KafkaService {
  /**
   * Internal generic publisher
   */
  async publish(topic, key, eventType, shopId, payload = {}, headers = {}) {
    const eventId = `evt_${crypto.randomBytes(8).toString('hex')}`;
    const correlationId = headers.correlation_id || `corr_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = Date.now();

    const messagePayload = {
      eventId,
      eventType,
      shopId: shopId ? shopId.toString() : null,
      timestamp,
      payload,
    };

    const message = {
      key: key ? key.toString() : eventId,
      value: JSON.stringify(messagePayload),
      headers: {
        event_type: eventType,
        correlation_id: correlationId,
        shop_id: shopId ? shopId.toString() : '',
        timestamp: String(timestamp),
        ...headers,
      },
    };

    try {
      // If not yet connected, attempt connection before sending
      if (!isProducerConnected()) {
        await connectProducer(4000);
      }

      await producer.send({
        topic,
        messages: [message],
      });

      console.log(`📤 [KafkaService] [${eventType}] Published to '${topic}' (Key: ${message.key}, EventId: ${eventId})`);
      return { success: true, eventId, correlationId };
    } catch (err) {
      console.error(`❌ [KafkaService] Failed to publish ${eventType} to '${topic}':`, err.message);
      return { success: false, error: err.message, eventId };
    }
  }

  /**
   * Publish ORDER_CREATED event
   */
  async publishOrderCreated(order, user) {
    return await this.publish(
      TOPICS.ORDERS,
      order._id.toString(),
      'ORDER_CREATED',
      order.shop,
      {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        items: order.items,
        totalAmount: order.totalAmount,
        discount: order.discount,
        finalAmount: order.finalAmount,
        status: order.status,
        ownerEmail: user?.email,
        ownerName: user?.ownerName,
        shopName: user?.shopName,
      }
    );
  }

  /**
   * Publish ORDER_STATUS_UPDATED event (e.g. Completed, Cancelled, Processing)
   */
  async publishOrderStatusUpdated(order, previousStatus, user) {
    const eventType = order.status === 'Completed'
      ? 'ORDER_COMPLETED'
      : order.status === 'Cancelled'
      ? 'ORDER_CANCELLED'
      : 'ORDER_STATUS_UPDATED';

    return await this.publish(
      TOPICS.ORDERS,
      order._id.toString(),
      eventType,
      order.shop,
      {
        orderId: order._id,
        orderNumber: order.orderNumber,
        previousStatus,
        newStatus: order.status,
        customer: order.customer,
        items: order.items,
        finalAmount: order.finalAmount,
        ownerEmail: user?.email,
        ownerName: user?.ownerName,
        shopName: user?.shopName,
      }
    );
  }

  /**
   * Publish STOCK_UPDATED event
   */
  async publishStockUpdated(product, adjustment, user) {
    return await this.publish(
      TOPICS.INVENTORY,
      product._id.toString(),
      'STOCK_UPDATED',
      product.shop,
      {
        productId: product._id,
        name: product.name,
        sku: product.sku,
        quantity: product.quantity,
        adjustment,
        lowStockThreshold: product.lowStockThreshold,
        isLowStock: product.quantity <= product.lowStockThreshold,
        ownerEmail: user?.email,
      }
    );
  }
}

module.exports = new KafkaService();
