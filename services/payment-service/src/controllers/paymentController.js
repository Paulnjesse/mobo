const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

// ============================================================
// SUBSCRIPTION PLANS (XAF)
// ============================================================
const SUBSCRIPTION_PLANS = {
  basic: {
    price: 5000,
    duration_days: 30,
    discount_rate: 0.10,
    description: 'Basic Plan — 10% off all rides for 30 days'
  },
  premium: {
    price: 10000,
    duration_days: 30,
    discount_rate: 0.20,
    description: 'Premium Plan — 20% off all rides + priority support for 30 days'
  }
};

// ============================================================
// MOCK PAYMENT PROVIDERS
// ============================================================

async function processMtnMobileMoney(phone, amount, currency) {
  // Mock MTN Mobile Money API
  console.log(`[MTN MoMo] Processing ${amount} ${currency} from ${phone}`);
  // In production, integrate with MTN Mobile Money API:
  // https://momodeveloper.mtn.com/
  const success = Math.random() > 0.05; // 95% success rate simulation
  if (success) {
    return {
      success: true,
      transaction_id: `MTN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      provider_ref: `MOMO-${Math.floor(Math.random() * 1000000)}`,
      message: 'Payment successful'
    };
  }
  return { success: false, message: 'MTN MoMo payment failed. Please try again.' };
}

async function processOrangeMoney(phone, amount, currency) {
  // Mock Orange Money API
  console.log(`[Orange Money] Processing ${amount} ${currency} from ${phone}`);
  // In production, integrate with Orange Money API
  const success = Math.random() > 0.05;
  if (success) {
    return {
      success: true,
      transaction_id: `ORG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      provider_ref: `ORANGE-${Math.floor(Math.random() * 1000000)}`,
      message: 'Payment successful'
    };
  }
  return { success: false, message: 'Orange Money payment failed. Please try again.' };
}

async function processWave(phone, amount, currency) {
  // Mock Wave payment
  console.log(`[Wave] Processing ${amount} ${currency} from ${phone}`);
  // In production, integrate with Wave API
  const success = Math.random() > 0.05;
  if (success) {
    return {
      success: true,
      transaction_id: `WAVE-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      provider_ref: `WAVE-${Math.floor(Math.random() * 1000000)}`,
      message: 'Payment successful'
    };
  }
  return { success: false, message: 'Wave payment failed. Please try again.' };
}

async function processStripe(amount, currency, paymentMethodToken) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey || stripeKey === 'sk_test_xxxx') {
    // Mock Stripe
    console.log(`[Stripe Mock] Processing ${amount} ${currency}`);
    return {
      success: true,
      transaction_id: `pi_mock_${Date.now()}`,
      provider_ref: `pi_mock_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Mock Stripe payment successful'
    };
  }

  try {
    const stripe = require('stripe')(stripeKey);
    // XAF is zero-decimal currency in Stripe, amount already in smallest unit
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency.toLowerCase(),
      payment_method: paymentMethodToken,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' }
    });

    return {
      success: paymentIntent.status === 'succeeded',
      transaction_id: paymentIntent.id,
      provider_ref: paymentIntent.id,
      message: paymentIntent.status === 'succeeded' ? 'Payment successful' : 'Payment pending'
    };
  } catch (err) {
    console.error('[Stripe Error]', err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================
// CONTROLLERS
// ============================================================

/**
 * POST /payments/methods
 * Add a payment method
 */
const addPaymentMethod = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, phone, card_number, card_brand, label, set_default = false } = req.body;

    const validTypes = ['card', 'mtn_mobile_money', 'orange_money', 'wave'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method type' });
    }

    let card_last4 = null;
    let maskedCardBrand = card_brand || null;

    if (type === 'card') {
      if (!card_number) {
        return res.status(400).json({ success: false, message: 'Card number required' });
      }
      // Mask card — store only last 4 digits
      const cleanCard = card_number.replace(/\s/g, '');
      if (cleanCard.length < 4) {
        return res.status(400).json({ success: false, message: 'Invalid card number' });
      }
      card_last4 = cleanCard.slice(-4);
    } else {
      // Mobile money types require phone
      if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number required for mobile money' });
      }
    }

    // If set as default, unset current defaults
    if (set_default) {
      await db.query(
        'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
        [userId]
      );
    }

    const result = await db.query(
      `INSERT INTO payment_methods (user_id, type, label, phone, card_last4, card_brand, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, type, label, phone, card_last4, card_brand, is_default, created_at`,
      [userId, type, label || null, phone || null, card_last4, maskedCardBrand, set_default]
    );

    res.status(201).json({
      success: true,
      message: 'Payment method added',
      data: { payment_method: result.rows[0] }
    });
  } catch (err) {
    console.error('[AddPaymentMethod Error]', err);
    res.status(500).json({ success: false, message: 'Failed to add payment method' });
  }
};

/**
 * GET /payments/methods
 */
const listPaymentMethods = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT id, type, label, phone, card_last4, card_brand, is_default, is_active, created_at
       FROM payment_methods
       WHERE user_id = $1 AND is_active = true
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: { payment_methods: result.rows, count: result.rows.length }
    });
  } catch (err) {
    console.error('[ListPaymentMethods Error]', err);
    res.status(500).json({ success: false, message: 'Failed to list payment methods' });
  }
};

/**
 * PUT /payments/methods/:id/default
 */
const setDefaultMethod = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Unset all
    await db.query(
      'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
      [userId]
    );

    // Set new default
    const result = await db.query(
      `UPDATE payment_methods SET is_default = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, type, label, is_default`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    res.json({
      success: true,
      message: 'Default payment method updated',
      data: { payment_method: result.rows[0] }
    });
  } catch (err) {
    console.error('[SetDefaultMethod Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update default method' });
  }
};

/**
 * DELETE /payments/methods/:id
 */
const deletePaymentMethod = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await db.query(
      `UPDATE payment_methods SET is_active = false
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    res.json({ success: true, message: 'Payment method removed' });
  } catch (err) {
    console.error('[DeletePaymentMethod Error]', err);
    res.status(500).json({ success: false, message: 'Failed to remove payment method' });
  }
};

/**
 * POST /payments/charge
 * Charge a ride
 */
const chargeRide = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ride_id, method, payment_method_id, phone } = req.body;

    if (!ride_id || !method) {
      return res.status(400).json({ success: false, message: 'ride_id and method are required' });
    }

    const validMethods = ['cash', 'card', 'mtn_mobile_money', 'orange_money', 'wave', 'wallet'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    // Get ride
    const rideResult = await db.query(
      'SELECT * FROM rides WHERE id = $1 AND rider_id = $2',
      [ride_id, userId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    if (ride.payment_status === 'paid') {
      return res.status(400).json({ success: false, message: 'Ride already paid' });
    }

    const amount = ride.final_fare || ride.estimated_fare;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid fare amount' });
    }

    // Get user for wallet balance
    const userResult = await db.query(
      'SELECT wallet_balance, loyalty_points FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    let paymentResult;
    const paymentPhone = phone || (payment_method_id ?
      (await db.query('SELECT phone FROM payment_methods WHERE id = $1 AND user_id = $2',
        [payment_method_id, userId])).rows[0]?.phone : null);

    // Process based on method
    switch (method) {
      case 'cash':
        paymentResult = { success: true, transaction_id: `CASH-${Date.now()}`, provider_ref: 'CASH', message: 'Cash payment recorded' };
        break;

      case 'mtn_mobile_money':
        if (!paymentPhone) {
          return res.status(400).json({ success: false, message: 'Phone number required for MTN MoMo' });
        }
        paymentResult = await processMtnMobileMoney(paymentPhone, amount, 'XAF');
        break;

      case 'orange_money':
        if (!paymentPhone) {
          return res.status(400).json({ success: false, message: 'Phone number required for Orange Money' });
        }
        paymentResult = await processOrangeMoney(paymentPhone, amount, 'XAF');
        break;

      case 'wave':
        if (!paymentPhone) {
          return res.status(400).json({ success: false, message: 'Phone number required for Wave' });
        }
        paymentResult = await processWave(paymentPhone, amount, 'XAF');
        break;

      case 'card':
        paymentResult = await processStripe(amount, 'XAF', null);
        break;

      case 'wallet':
        if (user.wallet_balance < amount) {
          return res.status(400).json({
            success: false,
            message: `Insufficient wallet balance. You have ${user.wallet_balance} XAF, need ${amount} XAF.`
          });
        }
        await db.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
          [amount, userId]
        );
        paymentResult = { success: true, transaction_id: `WALLET-${Date.now()}`, provider_ref: 'WALLET', message: 'Wallet payment successful' };
        break;

      default:
        paymentResult = { success: false, message: 'Unsupported payment method' };
    }

    const paymentStatus = paymentResult.success ? 'completed' : 'failed';

    // Record payment
    const payment = await db.query(
      `INSERT INTO payments (ride_id, user_id, amount, currency, method, status, transaction_id, provider_ref, failure_reason, metadata)
       VALUES ($1, $2, $3, 'XAF', $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        ride_id, userId, amount, method, paymentStatus,
        paymentResult.transaction_id || null,
        paymentResult.provider_ref || null,
        paymentResult.success ? null : paymentResult.message,
        JSON.stringify({ method, phone: paymentPhone || null })
      ]
    );

    // Update ride payment status
    if (paymentResult.success) {
      await db.query(
        'UPDATE rides SET payment_status = $1, payment_method = $2 WHERE id = $3',
        ['paid', method, ride_id]
      );
    }

    if (!paymentResult.success) {
      return res.status(402).json({
        success: false,
        message: paymentResult.message,
        data: { payment: payment.rows[0] }
      });
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment: payment.rows[0],
        transaction_id: paymentResult.transaction_id
      }
    });
  } catch (err) {
    console.error('[ChargeRide Error]', err);
    res.status(500).json({ success: false, message: 'Payment processing failed' });
  }
};

/**
 * GET /payments/history
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT
        p.*,
        r.pickup_address, r.dropoff_address, r.ride_type,
        r.distance_km, r.duration_minutes
       FROM payments p
       LEFT JOIN rides r ON p.ride_id = r.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM payments WHERE user_id = $1',
      [userId]
    );

    const totalSpentResult = await db.query(
      `SELECT SUM(amount) AS total FROM payments
       WHERE user_id = $1 AND status = 'completed'`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        payments: result.rows,
        total: parseInt(countResult.rows[0].count),
        total_spent_xaf: parseInt(totalSpentResult.rows[0].total) || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error('[GetPaymentHistory Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get payment history' });
  }
};

/**
 * POST /payments/refund/:id
 */
const refundPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: paymentId } = req.params;
    const { reason } = req.body;

    const paymentResult = await db.query(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
      [paymentId, userId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.status === 'refunded') {
      return res.status(400).json({ success: false, message: 'Payment already refunded' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Only completed payments can be refunded' });
    }

    // Process refund based on method
    if (payment.method === 'wallet') {
      // Credit back to wallet
      await db.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [payment.amount, userId]
      );
    }
    // For mobile money / card: log refund (in production, call provider API)
    console.log(`[Refund] Processing refund for payment ${paymentId}, amount: ${payment.amount} XAF, method: ${payment.method}`);

    // Mark as refunded
    await db.query(
      `UPDATE payments SET status = 'refunded', metadata = metadata || $1 WHERE id = $2`,
      [JSON.stringify({ refund_reason: reason, refunded_at: new Date().toISOString() }), paymentId]
    );

    // Update ride payment status
    if (payment.ride_id) {
      await db.query(
        "UPDATE rides SET payment_status = 'refunded' WHERE id = $1",
        [payment.ride_id]
      );
    }

    res.json({
      success: true,
      message: `Refund of ${payment.amount.toLocaleString()} XAF processed`,
      data: { payment_id: paymentId, amount: payment.amount, method: payment.method }
    });
  } catch (err) {
    console.error('[RefundPayment Error]', err);
    res.status(500).json({ success: false, message: 'Failed to process refund' });
  }
};

/**
 * GET /payments/wallet
 */
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      'SELECT wallet_balance, loyalty_points FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { wallet_balance, loyalty_points } = result.rows[0];

    // 100 points = 500 XAF
    const points_value_xaf = loyalty_points * 5;

    const transactions = await db.query(
      `SELECT points, action, description, created_at
       FROM loyalty_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        wallet_balance,
        loyalty_points,
        points_value_xaf,
        total_available_xaf: wallet_balance + points_value_xaf,
        recent_transactions: transactions.rows,
        currency: 'XAF'
      }
    });
  } catch (err) {
    console.error('[GetWalletBalance Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get wallet balance' });
  }
};

/**
 * POST /payments/subscribe
 */
const processSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan, method = 'cash', phone } = req.body;

    if (!plan || !SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan. Choose: basic (5,000 XAF/month) or premium (10,000 XAF/month)'
      });
    }

    const planData = SUBSCRIPTION_PLANS[plan];

    // Check for active subscription
    const existingSub = await db.query(
      `SELECT id, plan, expires_at FROM subscriptions
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()`,
      [userId]
    );

    if (existingSub.rows.length > 0) {
      const existing = existingSub.rows[0];
      return res.status(400).json({
        success: false,
        message: `You already have an active ${existing.plan} subscription until ${new Date(existing.expires_at).toLocaleDateString()}`
      });
    }

    // Process payment for subscription
    let paymentResult;
    switch (method) {
      case 'cash':
        paymentResult = { success: true, transaction_id: `CASH-SUB-${Date.now()}`, provider_ref: 'CASH' };
        break;
      case 'mtn_mobile_money':
        paymentResult = await processMtnMobileMoney(phone, planData.price, 'XAF');
        break;
      case 'orange_money':
        paymentResult = await processOrangeMoney(phone, planData.price, 'XAF');
        break;
      case 'wave':
        paymentResult = await processWave(phone, planData.price, 'XAF');
        break;
      case 'wallet': {
        const userResult = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [userId]);
        const bal = userResult.rows[0].wallet_balance;
        if (bal < planData.price) {
          return res.status(400).json({
            success: false,
            message: `Insufficient wallet balance. You have ${bal} XAF, need ${planData.price} XAF.`
          });
        }
        await db.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
          [planData.price, userId]
        );
        paymentResult = { success: true, transaction_id: `WALLET-SUB-${Date.now()}`, provider_ref: 'WALLET' };
        break;
      }
      default:
        paymentResult = { success: false, message: 'Unsupported payment method for subscription' };
    }

    if (!paymentResult.success) {
      return res.status(402).json({ success: false, message: paymentResult.message });
    }

    // Record payment
    const paymentRecord = await db.query(
      `INSERT INTO payments (user_id, amount, currency, method, status, transaction_id, provider_ref, metadata)
       VALUES ($1, $2, 'XAF', $3, 'completed', $4, $5, $6)
       RETURNING id`,
      [userId, planData.price, method, paymentResult.transaction_id, paymentResult.provider_ref,
       JSON.stringify({ type: 'subscription', plan })]
    );

    const expiresAt = new Date(Date.now() + planData.duration_days * 24 * 60 * 60 * 1000);

    // Create subscription
    const sub = await db.query(
      `INSERT INTO subscriptions (user_id, plan, price, currency, expires_at, payment_id)
       VALUES ($1, $2, $3, 'XAF', $4, $5)
       RETURNING *`,
      [userId, plan, planData.price, expiresAt, paymentRecord.rows[0].id]
    );

    // Update user subscription plan
    await db.query(
      'UPDATE users SET subscription_plan = $1, subscription_expiry = $2 WHERE id = $3',
      [plan, expiresAt, userId]
    );

    res.status(201).json({
      success: true,
      message: `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan activated! Enjoy your discounts.`,
      data: {
        subscription: sub.rows[0],
        plan_details: planData,
        expires_at: expiresAt
      }
    });
  } catch (err) {
    console.error('[ProcessSubscription Error]', err);
    res.status(500).json({ success: false, message: 'Failed to process subscription' });
  }
};

/**
 * GET /payments/subscription
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT s.*, p.transaction_id, p.method AS payment_method
       FROM subscriptions s
       LEFT JOIN payments p ON s.payment_id = p.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 5`,
      [userId]
    );

    const activeSub = result.rows.find(s => s.is_active && new Date(s.expires_at) > new Date());

    res.json({
      success: true,
      data: {
        active_subscription: activeSub || null,
        history: result.rows,
        available_plans: SUBSCRIPTION_PLANS
      }
    });
  } catch (err) {
    console.error('[GetSubscriptionStatus Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get subscription' });
  }
};

module.exports = {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultMethod,
  deletePaymentMethod,
  chargeRide,
  getPaymentHistory,
  refundPayment,
  getWalletBalance,
  processSubscription,
  getSubscriptionStatus
};
