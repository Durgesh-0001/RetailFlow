/**
 * services/emailService.js — Transactional Email Notification Service
 * ───────────────────────────────────────────────────────────────────
 * Sends email receipts, status notifications, and stock alerts via Nodemailer.
 * Includes graceful dev fallback, styled HTML templates, and DB notification logging.
 */

const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initTransporter();
  }

  /**
   * Initialise the Nodemailer Transporter
   */
  async initTransporter() {
    const isEmailEnabled = process.env.EMAIL_ENABLED !== 'false';
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (isEmailEnabled && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.isConfigured = true;
      console.log(`📧 [EmailService] SMTP Transporter configured (${host}:${port})`);
    } else {
      console.log('ℹ️ [EmailService] Using simulated email logger (Set SMTP_USER & SMTP_PASS in .env for live delivery).');
    }
  }

  /**
   * Internal email dispatcher with logging to MongoDB
   */
  async sendMail({ to, subject, html, text, type, shopId, metadata = {}, recipientType = 'customer' }) {
    const from = process.env.FROM_EMAIL || 'RetailFlow Notifications <noreply@retailflow.app>';

    let status = 'sent';
    let errorMessage = null;
    let messageId = `sim_${Date.now()}`;

    try {
      if (this.isConfigured && this.transporter) {
        const info = await this.transporter.sendMail({
          from,
          to,
          subject,
          text,
          html,
        });
        messageId = info.messageId;
        console.log(`✉️ [EmailService] Email sent to <${to}>: "${subject}" (ID: ${messageId})`);
      } else {
        console.log('\n────────────────────────────────────────────────────────────');
        console.log(`📧 [SIMULATED EMAIL DISPATCH]`);
        console.log(`   To:      ${to}`);
        console.log(`   From:    ${from}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Type:    ${type}`);
        console.log(`   Preview: ${text?.slice(0, 150)}...`);
        console.log('────────────────────────────────────────────────────────────\n');
      }
    } catch (err) {
      status = 'failed';
      errorMessage = err.message;
      console.error(`❌ [EmailService] Failed to send email to <${to}>:`, err.message);
    }

    // Persist notification record in MongoDB
    if (shopId) {
      try {
        await Notification.create({
          shop: shopId,
          recipient: to,
          recipientType,
          type,
          subject,
          message: text || subject,
          status,
          metadata: {
            ...metadata,
            errorMessage,
            messageId,
          },
        });
      } catch (dbErr) {
        console.warn('⚠️ [EmailService] Failed to log notification in DB:', dbErr.message);
      }
    }

    return { success: status === 'sent', messageId, status, error: errorMessage };
  }

  /**
   * Send Order Confirmation / Tax Invoice to Customer & Shop Owner
   */
  async sendOrderConfirmation(order, shop) {
    const customerEmail = order.customer?.email;
    const ownerEmail = shop?.email;
    const shopName = shop?.shopName || 'RetailFlow Store';
    const currency = shop?.currencySymbol || '₹';

    const itemsHtml = (order.items || [])
      .map(
        (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${currency}${item.unitPrice}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${currency}${item.subtotal}</td>
        </tr>`
      )
      .join('');

    const plainItems = (order.items || [])
      .map((item) => `- ${item.productName} x ${item.quantity} = ${currency}${item.subtotal}`)
      .join('\n');

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"/></head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <div style="background: #1e293b; color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">${shopName}</h1>
          <p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">Order Confirmation & Receipt</p>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 16px; color: #334155;">Hello <strong>${order.customer?.name || 'Valued Customer'}</strong>,</p>
          <p style="color: #64748b;">Thank you for your order! Here are your order details:</p>
          
          <div style="background: #f8fafc; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
            <p style="margin: 4px 0; color: #334155;"><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p style="margin: 4px 0; color: #334155;"><strong>Date:</strong> ${new Date(order.createdAt || Date.now()).toLocaleDateString()}</p>
            <p style="margin: 4px 0; color: #334155;"><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">${order.status}</span></p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left; color: #475569;">
                <th style="padding: 10px;">Item</th>
                <th style="padding: 10px; text-align: center;">Qty</th>
                <th style="padding: 10px; text-align: right;">Price</th>
                <th style="padding: 10px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="margin-top: 20px; text-align: right; border-top: 2px solid #e2e8f0; padding-top: 12px;">
            <p style="margin: 4px 0; color: #64748b;">Total Amount: ${currency}${order.totalAmount}</p>
            ${order.discount ? `<p style="margin: 4px 0; color: #ef4444;">Discount: -${currency}${order.discount}</p>` : ''}
            <p style="margin: 8px 0 0; font-size: 18px; color: #0f172a; font-weight: bold;">Final Amount: ${currency}${order.finalAmount}</p>
          </div>
        </div>
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
          RetailFlow Order Processing System • Thank you for shopping with us!
        </div>
      </div>
    </body>
    </html>`;

    const textContent = `Order Confirmation - ${order.orderNumber}
Shop: ${shopName}
Customer: ${order.customer?.name}
Status: ${order.status}

Items:
${plainItems}

Total: ${currency}${order.totalAmount}
Discount: ${currency}${order.discount || 0}
Final Amount: ${currency}${order.finalAmount}

Thank you for your order!`;

    const results = [];

    // Dispatch to Customer if email is present
    if (customerEmail) {
      const resCustomer = await this.sendMail({
        to: customerEmail,
        subject: `Order Confirmation: ${order.orderNumber} - ${shopName}`,
        html: htmlContent,
        text: textContent,
        type: 'ORDER_CONFIRMATION',
        shopId: order.shop,
        recipientType: 'customer',
        metadata: { orderId: order._id, orderNumber: order.orderNumber },
      });
      results.push({ recipient: customerEmail, ...resCustomer });
    }

    // Dispatch a copy / alert to Store Owner
    if (ownerEmail && ownerEmail !== customerEmail) {
      const resOwner = await this.sendMail({
        to: ownerEmail,
        subject: `[New Order Alert] ${order.orderNumber} placed for ${currency}${order.finalAmount}`,
        html: htmlContent,
        text: textContent,
        type: 'ORDER_CONFIRMATION',
        shopId: order.shop,
        recipientType: 'owner',
        metadata: { orderId: order._id, orderNumber: order.orderNumber },
      });
      results.push({ recipient: ownerEmail, ...resOwner });
    }

    return results;
  }

  /**
   * Send Order Status Update (Completed, Cancelled, Processing)
   */
  async sendOrderStatusUpdate(order, previousStatus, shop) {
    const customerEmail = order.customer?.email || shop?.email;
    if (!customerEmail) return null;

    const shopName = shop?.shopName || 'RetailFlow Store';
    const currency = shop?.currencySymbol || '₹';

    const subject = `Order ${order.orderNumber} Status Update: ${order.status}`;
    const textContent = `Hello ${order.customer?.name || 'Customer'},\n\nYour order ${order.orderNumber} has been updated from "${previousStatus}" to "${order.status}".\n\nTotal Amount: ${currency}${order.finalAmount}\n\nThank you for choosing ${shopName}!`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #1e293b; margin-top: 0;">Order Status Update</h2>
      <p style="color: #475569;">Hello <strong>${order.customer?.name || 'Customer'}</strong>,</p>
      <p style="color: #475569;">Your order <strong>${order.orderNumber}</strong> status is now:</p>
      <div style="display: inline-block; padding: 8px 16px; background: #e0f2fe; color: #0284c7; border-radius: 4px; font-weight: bold; font-size: 16px;">
        ${order.status}
      </div>
      <p style="color: #64748b; margin-top: 16px;">Final Amount: <strong>${currency}${order.finalAmount}</strong></p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 12px;">${shopName} via RetailFlow</p>
    </div>`;

    return await this.sendMail({
      to: customerEmail,
      subject,
      html: htmlContent,
      text: textContent,
      type: 'ORDER_STATUS_UPDATE',
      shopId: order.shop,
      recipientType: order.customer?.email ? 'customer' : 'owner',
      metadata: { orderId: order._id, orderNumber: order.orderNumber, previousStatus, newStatus: order.status },
    });
  }

  /**
   * Send Low Stock Warning to Shop Owner
   */
  async sendLowStockAlert(product, shop) {
    if (!shop?.email) return null;

    const subject = `⚠️ Low Stock Alert: "${product.name}" (${product.quantity} ${product.unit} remaining)`;
    const textContent = `Alert for shop "${shop.shopName}":\n\nProduct "${product.name}" (SKU: ${product.sku || 'N/A'}) has reached low stock level: ${product.quantity} ${product.unit} remaining (Threshold: ${product.lowStockThreshold}).\n\nPlease restock soon!`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #fed7aa; border-radius: 8px;">
      <h2 style="color: #ea580c; margin-top: 0;">⚠️ Low Stock Alert</h2>
      <p style="color: #475569;">The following product has dropped below its safe inventory threshold:</p>
      <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; margin: 16px 0;">
        <h3 style="margin: 0; color: #9a3412;">${product.name}</h3>
        <p style="margin: 4px 0; color: #431407;">Current Stock: <strong>${product.quantity} ${product.unit}</strong></p>
        <p style="margin: 4px 0; color: #7c2d12;">Threshold: ${product.lowStockThreshold} ${product.unit}</p>
        <p style="margin: 4px 0; color: #7c2d12;">SKU: ${product.sku || 'N/A'}</p>
      </div>
      <p style="color: #64748b; font-size: 14px;">Please reorder stock to avoid lost sales.</p>
    </div>`;

    return await this.sendMail({
      to: shop.email,
      subject,
      html: htmlContent,
      text: textContent,
      type: 'LOW_STOCK_ALERT',
      shopId: shop._id,
      recipientType: 'owner',
      metadata: { productId: product._id, currentStock: product.quantity, threshold: product.lowStockThreshold },
    });
  }
}

module.exports = new EmailService();
