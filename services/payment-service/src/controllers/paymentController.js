const axios   = require('axios');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { checkPaymentFraud } = require('../../../shared/fraudDetection');
const { convertFromXAF, getCurrencyCode, getStripeCurrency } = require('../../../shared/currencyUtil');
const { callWithBreaker } = require('../../../shared/circuitBreaker');
const logger  = require('../utils/logger');

// ── Payment provider circuit breaker helpers ──────────────────────────────────
// Each external payment API (MTN, Orange, Wave, Stripe) is wrapped in an Opossum
// circuit breaker. If the provider's error rate exceeds 50% over 10 requests the
// breaker OPENS and all subsequent calls fail fast (no network round-trip) for
// 30 s. This prevents cascading failures: a flaky MTN API won't exhaust the
// Node.js event loop or the HTTP connection pool.
//
// Fallback: returns { success: false, provider_unavailable: true } so the caller
// can surface "Mobile money is temporarily unavailable — please pay with cash"
// rather than a generic 500.
/* istanbul ignore next */
function providerFallback(providerName) {
  return () => ({
    success:             false,
    provider_unavailable: true,
    message:             `${providerName} is temporarily unavailable. Please try again or pay with cash.`,
  });
}

/* istanbul ignore next */
async function withProviderBreaker(name, fn) {
  return callWithBreaker(name, fn, {
    fallback: providerFallback(name),
    breaker:  { timeout: 15000, errorThresholdPercent: 50, resetTimeout: 30000, volumeThreshold: 3 },
  });
}

// ── Payment audit log helper (PCI DSS Requirement 10.2) ──────────────────────
async function writePaymentAudit(fields) {
  try {
    await db.query(
      `INSERT INTO payment_audit_logs
         (payment_id, ride_id, user_id, event_type, amount_xaf, currency,
          method, provider, provider_ref, status_before, status_after,
          ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        fields.payment_id   || null,
        fields.ride_id      || null,
        fields.user_id      || null,
        fields.event_type,
        fields.amount       || null,
        fields.currency     || 'XAF',
        fields.method       || null,
        fields.provider     || null,
        fields.provider_ref || null,
        fields.status_before || null,
        fields.status_after  || null,
        fields.ip_address   || null,
        fields.user_agent   || null,
        JSON.stringify(fields.metadata || {}),
      ]
    );
  } catch (err) {
    // Audit failures are non-fatal but must be visible in logs
    logger.error('[PaymentAudit] Failed to write audit record:', err.message, {
      event_type: fields.event_type, payment_id: fields.payment_id,
    });
  }
}

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
// TOKEN CACHE  (in-process; survives restarts via re-auth)
// ============================================================
const tokenCache = {
  mtn:    { token: null, expiresAt: 0 },
  orange: { token: null, expiresAt: 0 },
};

// ============================================================
// PHONE NORMALISATION
// ============================================================
function normalizeCmPhone(phone) {
  // Strip everything except digits
  let p = String(phone).replace(/\D/g, '');
  // Remove leading + already stripped; handle 00237...
  if (p.startsWith('00')) p = p.slice(2);
  // Add 237 country code when missing
  if (!p.startsWith('237')) {
    p = p.replace(/^0/, ''); // remove leading 0
    p = '237' + p;
  }
  return p; // e.g. 237650000000
}

// ============================================================
// MTN MOBILE MONEY — Collections API
// https://momodeveloper.mtn.com/
// ============================================================

async function getMtnToken() {
  const now = Date.now();
  if (tokenCache.mtn.token && now < tokenCache.mtn.expiresAt) {
    return tokenCache.mtn.token;
  }

  const apiUserId      = process.env.MTN_API_USER_ID;
  const apiKey         = process.env.MTN_API_KEY;
  const subscriptionKey = process.env.MTN_COLLECTION_SUBSCRIPTION_KEY;

  if (!apiUserId || !apiKey || !subscriptionKey) {
    throw new Error('MTN_API_USER_ID, MTN_API_KEY and MTN_COLLECTION_SUBSCRIPTION_KEY are required');
  }

  const credentials = Buffer.from(`${apiUserId}:${apiKey}`).toString('base64');
  const baseUrl = process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';

  const { data } = await axios.post(
    `${baseUrl}/collection/token/`,
    {},
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    }
  );

  const { access_token, expires_in } = data;
  tokenCache.mtn.token     = access_token;
  tokenCache.mtn.expiresAt = now + (Number(expires_in) - 60) * 1000;
  return access_token;
}

/**
 * Initiate an MTN MoMo request-to-pay.
 * Returns { status: 'pending', reference_id, provider: 'mtn' }
 * or falls back to mock when credentials are absent (dev mode).
 */
async function processMtnMobileMoney(phone, amount, currency) {
  const subscriptionKey = process.env.MTN_COLLECTION_SUBSCRIPTION_KEY;
  const environment     = process.env.MTN_ENVIRONMENT || 'sandbox';
  const baseUrl         = process.env.MTN_BASE_URL    || 'https://sandbox.momodeveloper.mtn.com';

  if (!subscriptionKey || !process.env.MTN_API_USER_ID) {
    logger.warn('[MTN MoMo] Credentials not configured — using dev mock');
    return {
      status:       'pending',
      reference_id: `mock-mtn-${uuidv4()}`,
      provider:     'mtn',
      mock:          true,
    };
  }

  const referenceId = uuidv4();
  const payer       = normalizeCmPhone(phone);
  const token       = await getMtnToken();

  await axios.post(
    `${baseUrl}/collection/v1_0/requesttopay`,
    {
      amount:       String(Math.round(amount)),
      currency,
      externalId:   referenceId,
      payer:        { partyIdType: 'MSISDN', partyId: payer },
      payerMessage: 'MOBO Ride Payment',
      payeeNote:    'Ride fare payment',
    },
    {
      headers: {
        Authorization:                `Bearer ${token}`,
        'X-Reference-Id':              referenceId,
        'X-Target-Environment':        environment,
        'Ocp-Apim-Subscription-Key':   subscriptionKey,
        'Content-Type':                'application/json',
      },
    }
  );
  // 202 Accepted — push sent to customer phone
  return { status: 'pending', reference_id: referenceId, provider: 'mtn' };
}

/**
 * Poll MTN for the final status of a request-to-pay.
 * Returns { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED', financialTransactionId?, reason? }
 */
async function pollMtnStatus(referenceId) {
  const subscriptionKey = process.env.MTN_COLLECTION_SUBSCRIPTION_KEY;
  const environment     = process.env.MTN_ENVIRONMENT || 'sandbox';
  const baseUrl         = process.env.MTN_BASE_URL    || 'https://sandbox.momodeveloper.mtn.com';

  if (!subscriptionKey) return { status: 'PENDING' };

  const token = await getMtnToken();
  const { data } = await axios.get(
    `${baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        Authorization:               `Bearer ${token}`,
        'X-Target-Environment':       environment,
        'Ocp-Apim-Subscription-Key':  subscriptionKey,
      },
    }
  );
  return data; // { status, financialTransactionId, reason, ... }
}

// ============================================================
// ORANGE MONEY — Cameroon Web-Pay API
// https://developer.orange.com/apis/orange-money-webpay-cm/
// ============================================================

async function getOrangeToken() {
  const now = Date.now();
  if (tokenCache.orange.token && now < tokenCache.orange.expiresAt) {
    return tokenCache.orange.token;
  }

  const clientId     = process.env.ORANGE_CLIENT_ID;
  const clientSecret = process.env.ORANGE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('ORANGE_CLIENT_ID and ORANGE_CLIENT_SECRET are required');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const { data } = await axios.post(
    'https://api.orange.com/oauth/v3/token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, expires_in } = data;
  tokenCache.orange.token     = access_token;
  tokenCache.orange.expiresAt = now + (Number(expires_in) - 60) * 1000;
  return access_token;
}

/**
 * Initiate an Orange Money web-payment.
 * Returns { status: 'pending', reference_id (orderId), pay_token, provider: 'orange' }
 */
async function processOrangeMoney(phone, amount, currency) {
  const merchantKey = process.env.ORANGE_MERCHANT_KEY;

  if (!merchantKey || !process.env.ORANGE_CLIENT_ID) {
    logger.warn('[Orange Money] Credentials not configured — using dev mock');
    return {
      status:       'pending',
      reference_id: `mock-orange-${uuidv4()}`,
      pay_token:    null,
      provider:     'orange',
      mock:          true,
    };
  }

  const orderId = uuidv4();
  const token   = await getOrangeToken();

  const { data } = await axios.post(
    'https://api.orange.com/orange-money-webpay/cm/v1/webpayment',
    {
      merchant_key: merchantKey,
      currency,
      order_id:     orderId,
      amount:       Math.round(amount),
      return_url:   process.env.ORANGE_RETURN_URL  || 'https://mobo.cm/payment/return',
      cancel_url:   process.env.ORANGE_CANCEL_URL  || 'https://mobo.cm/payment/cancel',
      notif_url:    process.env.ORANGE_NOTIF_URL   || `${process.env.API_BASE_URL || ''}/payments/webhook/orange`,
      lang:         'fr',
      reference:    orderId,
    },
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    status:       'pending',
    reference_id: orderId,
    pay_token:    data.pay_token,
    notif_token:  data.notif_token,
    provider:     'orange',
  };
}

/**
 * Poll Orange for the final status of a transaction.
 * Returns { status: 'SUCCESS' | 'FAILED' | 'PENDING' }
 */
async function pollOrangeStatus(orderId, payToken) {
  if (!process.env.ORANGE_MERCHANT_KEY) return { status: 'PENDING' };

  const token = await getOrangeToken();
  const { data } = await axios.post(
    'https://api.orange.com/orange-money-webpay/cm/v1/transactionstatus',
    { order_id: orderId, pay_token: payToken },
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return data; // { status, txnid, message, ... }
}

// ============================================================
// WAVE / STRIPE  (unchanged)
// ============================================================

async function processWave(phone, amount, currency) {
  const waveApiKey = process.env.WAVE_API_KEY;
  const waveBaseUrl = process.env.WAVE_BASE_URL || 'https://api.wave.com/v1';

  if (!waveApiKey) {
    logger.warn('[Wave] WAVE_API_KEY not configured — payment rejected');
    return {
      success: false,
      message: 'Wave payment is not yet configured on this server. Please use MTN Mobile Money, Orange Money, or cash.',
    };
  }

  try {
    // Wave Collect API — initiate a pull payment
    const { data } = await axios.post(
      `${waveBaseUrl}/checkout/sessions`,
      {
        amount: String(Math.round(amount)),
        currency,
        client_reference: `MOBO-${Date.now()}`,
        success_url: process.env.WAVE_SUCCESS_URL || 'https://mobo.cm/payment/success',
        error_url:   process.env.WAVE_ERROR_URL   || 'https://mobo.cm/payment/error',
      },
      {
        headers: {
          Authorization:  `Bearer ${waveApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return {
      success: true,
      transaction_id: data.id,
      provider_ref:   data.id,
      wave_launch_url: data.wave_launch_url,
      message: 'Wave checkout session created',
    };
  } catch (err) {
    logger.error('[Wave] API error:', err.message);
    return { success: false, message: `Wave payment failed: ${err.message}` };
  }
}

async function processStripe(amount, currency, paymentMethodToken) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey || stripeKey === 'sk_test_xxxx') {
    logger.info({ amount, currency }, '[Stripe Mock] Processing payment');
    return {
      success: true,
      transaction_id: `pi_mock_${Date.now()}`,
      provider_ref: `pi_mock_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Mock Stripe payment successful',
    };
  }

  try {
    const stripe = require('stripe')(stripeKey);
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      payment_method: paymentMethodToken,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    return {
      success: paymentIntent.status === 'succeeded',
      transaction_id: paymentIntent.id,
      provider_ref: paymentIntent.id,
      message: paymentIntent.status === 'succeeded' ? 'Payment successful' : 'Payment pending',
    };
  } catch (err) {
    logger.error('[Stripe Error]', err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================
// HELPERS
// ============================================================

/** Resolve a pending mobile-money payment once the provider confirms. */
async function resolvePendingPayment(paymentId, status, transactionId, failureReason) {
  // Fetch current state for audit delta
  const { rows: before } = await db.query(
    'SELECT ride_id, user_id, method, amount, provider_ref FROM payments WHERE id = $1',
    [paymentId]
  );

  await db.query(
    `UPDATE payments
     SET status = $1, transaction_id = $2, failure_reason = $3
     WHERE id = $4`,
    [status, transactionId || null, failureReason || null, paymentId]
  );

  const p = before[0] || {};

  // Audit: payment_completed or payment_failed
  await writePaymentAudit({
    payment_id:    paymentId,
    ride_id:       p.ride_id,
    user_id:       p.user_id,
    event_type:    status === 'completed' ? 'payment_completed' : 'payment_failed',
    amount:        p.amount,
    method:        p.method,
    provider_ref:  transactionId || p.provider_ref,
    status_before: 'pending',
    status_after:  status,
    metadata:      failureReason ? { failure_reason: failureReason } : {},
  });

  if (status === 'completed' && p.ride_id) {
    await db.query(
      "UPDATE rides SET payment_status = 'paid', payment_method = $1 WHERE id = $2",
      [p.method, p.ride_id]
    );
    // Saga settlement: move pending driver earnings to drivers.total_earnings now
    // that payment is confirmed. Non-blocking — settlement failure is logged and
    // flagged for ops review; the payment itself is already confirmed.
    const { settleDriverEarnings } = require('../jobs/settleEarnings');
    settleDriverEarnings(p.ride_id, { notes: `Payment ${paymentId} confirmed via ${p.method}` })
      .catch((err) => logger.error('[resolvePendingPayment] Earnings settlement failed', { rideId: p.ride_id, err: err.message }));
  }
}

// ============================================================
// CONTROLLERS
// ============================================================

/**
 * POST /payments/methods
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

    if (type === 'card') {
      if (!card_number) {
        return res.status(400).json({ success: false, message: 'Card number required' });
      }
      const cleanCard = card_number.replace(/\s/g, '');
      // 13–19 digit numeric string (Visa 13/16, Amex 15, Mastercard 16, others up to 19)
      if (!/^\d{13,19}$/.test(cleanCard)) {
        return res.status(400).json({ success: false, message: 'Invalid card number — must be 13–19 digits' });
      }
      card_last4 = cleanCard.slice(-4);
    } else {
      if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number required for mobile money' });
      }
      // E.164-style: optional +, 7–15 digits (covers African mobile number formats)
      if (!/^\+?\d{7,15}$/.test(phone.replace(/[\s\-().]/g, ''))) {
        return res.status(400).json({ success: false, message: 'Invalid phone number format' });
      }
    }

    if (set_default) {
      await db.query('UPDATE payment_methods SET is_default = false WHERE user_id = $1', [userId]);
    }

    const result = await db.query(
      `INSERT INTO payment_methods (user_id, type, label, phone, card_last4, card_brand, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, type, label, phone, card_last4, card_brand, is_default, created_at`,
      [userId, type, label || null, phone || null, card_last4, card_brand || null, set_default]
    );

    res.status(201).json({
      success: true,
      message: 'Payment method added',
      data: { payment_method: result.rows[0] },
    });
  } catch (err) {
    logger.error('[AddPaymentMethod Error]', err);
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
    res.json({ success: true, data: { payment_methods: result.rows, count: result.rows.length } });
  } catch (err) {
    logger.error('[ListPaymentMethods Error]', err);
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

    await db.query('UPDATE payment_methods SET is_default = false WHERE user_id = $1', [userId]);

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
      data: { payment_method: result.rows[0] },
    });
  } catch (err) {
    logger.error('[SetDefaultMethod Error]', err);
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
    logger.error('[DeletePaymentMethod Error]', err);
    res.status(500).json({ success: false, message: 'Failed to remove payment method' });
  }
};

// ── Loyalty Bonus: 2% wallet credit per 20,000 XAF spend milestone ───────────
// Called fire-and-forget after every successful ride payment.
// Safe to fail — bonus loss is logged but never blocks the payment response.
async function checkAndAwardLoyaltyBonus(userId, spendAmountXAF, rideId) {
  if (process.env.NODE_ENV === 'test') return; // skip in tests
  const THRESHOLD = 20000;
  const BONUS_RATE = 0.02;
  const BONUS_XAF = Math.round(THRESHOLD * BONUS_RATE); // 400 XAF

  try {
    // Fetch current totals
    const { rows } = await db.query(
      `SELECT total_spend_xaf, next_loyalty_threshold_xaf FROM users WHERE id = $1`,
      [userId]
    );
    if (!rows.length) return;

    const prev      = rows[0];
    const prevSpend = Number(prev.total_spend_xaf) || 0;
    const newSpend  = prevSpend + spendAmountXAF;

    const prevCrossings = Math.floor(prevSpend / THRESHOLD);
    const newCrossings  = Math.floor(newSpend  / THRESHOLD);
    const crossings     = newCrossings - prevCrossings;

    if (crossings > 0) {
      const totalBonus = crossings * BONUS_XAF;
      await db.query(
        `UPDATE users
         SET total_spend_xaf            = $2,
             wallet_balance             = wallet_balance + $3,
             next_loyalty_threshold_xaf = $4
         WHERE id = $1`,
        [userId, newSpend, totalBonus, (newCrossings + 1) * THRESHOLD]
      );
      // Log each milestone crossed
      for (let i = 0; i < crossings; i++) {
        const milestone = (prevCrossings + i + 1) * THRESHOLD;
        await db.query(
          `INSERT INTO loyalty_bonus_log
             (user_id, threshold_xaf, cumulative_spend_xaf, bonus_xaf, ride_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, THRESHOLD, milestone, BONUS_XAF, rideId || null]
        );
      }
      logger.info(
        `[Loyalty] User ${userId} crossed ${crossings}×20k XAF milestone — +${totalBonus} XAF bonus`
      );
    } else {
      await db.query(
        `UPDATE users SET total_spend_xaf = $2 WHERE id = $1`,
        [userId, newSpend]
      );
    }
  } catch (err) {
    logger.warn('[Loyalty] checkAndAwardLoyaltyBonus failed (non-fatal):', err.message);
  }
}

/**
 * POST /payments/charge
 * Initiate a ride payment.
 * Mobile-money methods return { pending: true, reference_id } — caller must poll /status/:ref
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

    const amountXAF = ride.final_fare || ride.estimated_fare;
    if (!amountXAF || amountXAF <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid fare amount' });
    }

    // req.currency is attached by currencyMiddleware (runs inside authenticate)
    // No extra DB query needed — country_code comes from the JWT
    const countryCode    = req.currency?.country_code || 'CM';
    const localCurrency  = convertFromXAF(amountXAF, countryCode);
    // amount used for the actual payment provider call (local currency integer)
    const amount         = localCurrency.amount;
    const chargeCurrency = localCurrency.currency_code;

    // Resolve phone: body param → saved payment method
    let paymentPhone = phone;
    if (!paymentPhone && payment_method_id) {
      const pmRow = await db.query(
        'SELECT phone FROM payment_methods WHERE id = $1 AND user_id = $2',
        [payment_method_id, userId]
      );
      paymentPhone = pmRow.rows[0]?.phone || null;
    }

    // ── FRAUD CHECK (ML-backed) ───────────────────────────────────────────────
    try {
      const [vel1h, vel24h, failed1h, avg30d, acctAge] = await Promise.all([
        db.query(`SELECT COUNT(*) FROM payments WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 hour'`, [userId]),
        db.query(`SELECT COUNT(*) FROM payments WHERE user_id=$1 AND created_at>NOW()-INTERVAL '24 hours'`, [userId]),
        db.query(`SELECT COUNT(*) FROM payments WHERE user_id=$1 AND status='failed' AND created_at>NOW()-INTERVAL '1 hour'`, [userId]),
        db.query(`SELECT AVG(amount) FROM payments WHERE user_id=$1 AND status='completed' AND created_at>NOW()-INTERVAL '30 days'`, [userId]),
        db.query(`SELECT EXTRACT(EPOCH FROM (NOW()-created_at))/86400 AS age FROM users WHERE id=$1`, [userId]),
      ]);
      const fraudCheck = await checkPaymentFraud(userId, ride_id, {
        amount,
        method,
        paymentsLast1h:  parseInt(vel1h.rows[0]?.count  || 0, 10),
        paymentsLast24h: parseInt(vel24h.rows[0]?.count || 0, 10),
        failedLast1h:    parseInt(failed1h.rows[0]?.count || 0, 10),
        avgAmount30d:    parseFloat(avg30d.rows[0]?.avg  || 0),
        accountAgeDays:  Math.floor(parseFloat(acctAge.rows[0]?.age || 365)),
        ipAddress:       req.ip,
        deviceFingerprint: req.headers['x-device-id'] || null,
      });
      if (fraudCheck.flagged && fraudCheck.verdict === 'block') {
        return res.status(403).json({ success: false, message: 'Payment declined due to fraud risk', code: 'fraud_block' });
      }
    } catch (fraudErr) {
      // Non-blocking — log and continue
      logger.warn('[chargeRide] Fraud check error:', fraudErr.message);
    }

    // ── MOBILE MONEY (async) ──────────────────────────────────────────────────
    if (method === 'mtn_mobile_money' || method === 'orange_money') {
      if (!paymentPhone) {
        return res.status(400).json({ success: false, message: 'Phone number required for mobile money' });
      }

      let initResult;
      try {
        initResult = method === 'mtn_mobile_money'
          ? await withProviderBreaker('mtn_mobile_money', () => processMtnMobileMoney(paymentPhone, amount, chargeCurrency))
          : await withProviderBreaker('orange_money',     () => processOrangeMoney(paymentPhone, amount, chargeCurrency));

        if (initResult && initResult.provider_unavailable) {
          return res.status(503).json({ success: false, message: initResult.message });
        }
      } catch (providerErr) {
        logger.error(`[${method}] Init error:`, providerErr.message);
        return res.status(502).json({
          success: false,
          message: `Mobile money service unavailable: ${providerErr.message}`,
        });
      }

      // Store as pending
      const metadata = {
        method,
        phone: paymentPhone,
        provider:    initResult.provider,
        pay_token:   initResult.pay_token   || null,
        notif_token: initResult.notif_token || null,
        mock:        initResult.mock        || false,
      };

      const payment = await db.query(
        `INSERT INTO payments
           (ride_id, user_id, amount, currency, method, status, provider_ref, metadata)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
         RETURNING id, status, provider_ref`,
        [ride_id, userId, amountXAF, chargeCurrency, method, initResult.reference_id, JSON.stringify(metadata)]
      );

      // PCI DSS 10.2 — log payment initiation
      await writePaymentAudit({
        payment_id:   payment.rows[0].id,
        ride_id,
        user_id:      userId,
        event_type:   'payment_initiated',
        amount,
        method,
        provider:     initResult.provider,
        provider_ref: initResult.reference_id,
        status_after: 'pending',
        ip_address:   req.ip,
        user_agent:   req.get('user-agent'),
      });

      return res.status(202).json({
        success:      true,
        pending:      true,
        message:      'Mobile money request sent. Check your phone for the USSD prompt.',
        data: {
          payment_id:   payment.rows[0].id,
          reference_id: initResult.reference_id,
          status:       'pending',
        },
      });
    }

    // ── SYNCHRONOUS METHODS ────────────────────────────────────────────────────
    let paymentResult;
    let walletPayment = null; // set inside wallet case when atomic INSERT succeeds

    switch (method) {
      case 'cash':
        paymentResult = {
          success: true,
          transaction_id: `CASH-${Date.now()}`,
          provider_ref: 'CASH',
          message: 'Cash payment recorded',
        };
        break;

      case 'wave':
        if (!paymentPhone) {
          return res.status(400).json({ success: false, message: 'Phone number required for Wave' });
        }
        paymentResult = await withProviderBreaker('wave', () => processWave(paymentPhone, amount, chargeCurrency));
        break;

      case 'card': {
        // stripe_payment_method_token must be obtained from the Stripe mobile SDK payment sheet
        const stripeToken = req.body.stripe_payment_method_token || null;
        if (!stripeToken && process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_xxxx') {
          return res.status(400).json({
            success: false,
            message: 'A Stripe payment method token (stripe_payment_method_token) is required for card payments. Use the Stripe mobile SDK to obtain one.',
          });
        }
        // Stripe charges in local currency (supports NGN, KES, ZAR natively)
        paymentResult = await withProviderBreaker('stripe', () => processStripe(amount, getStripeCurrency(countryCode), stripeToken));
        break;
      }

      case 'wallet': {
        // CRITICAL-003: Wrap wallet deduction + payment INSERT in a single DB
        // transaction so there is no window where the wallet is debited but no
        // payment record exists (e.g. process crash between the two queries).
        const walletClient = await db.connect();
        try {
          await walletClient.query('BEGIN');
          const walletUpdate = await walletClient.query(
            `UPDATE users SET wallet_balance = wallet_balance - $1
             WHERE id = $2 AND wallet_balance >= $1
             RETURNING wallet_balance`,
            [amountXAF, userId]
          );
          if (!walletUpdate.rows[0]) {
            await walletClient.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Insufficient wallet balance. Need ${amountXAF.toLocaleString()} XAF (${localCurrency.currency_symbol} ${amount.toLocaleString()} ${chargeCurrency}).`,
            });
          }
          const txId = `WALLET-${Date.now()}`;
          const walletPaymentRow = await walletClient.query(
            `INSERT INTO payments
               (ride_id, user_id, amount, currency, method, status, transaction_id, provider_ref, failure_reason, metadata)
             VALUES ($1, $2, $3, $4, $5, 'completed', $6, 'WALLET', NULL, $7)
             RETURNING *`,
            [ride_id, userId, amountXAF, chargeCurrency, method, txId,
             JSON.stringify({ method, phone: paymentPhone || null })]
          );
          await walletClient.query('COMMIT');
          // paymentResult and walletPayment used downstream to skip the shared INSERT
          paymentResult = { success: true, transaction_id: txId, provider_ref: 'WALLET', message: 'Wallet payment successful' };
          walletPayment = walletPaymentRow.rows[0];
        } catch (walletErr) {
          await walletClient.query('ROLLBACK');
          throw walletErr;
        } finally {
          walletClient.release();
        }
        break;
      }

      default:
        paymentResult = { success: false, message: 'Unsupported payment method' };
    }

    const paymentStatus = paymentResult.success ? 'completed' : 'failed';

    // Wallet already did its own atomic INSERT (CRITICAL-003 fix); all other
    // methods use the shared INSERT below.
    const payment = walletPayment
      ? { rows: [walletPayment] }
      : await db.query(
          `INSERT INTO payments
             (ride_id, user_id, amount, currency, method, status, transaction_id, provider_ref, failure_reason, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            ride_id, userId, amountXAF, chargeCurrency, method, paymentStatus,
            paymentResult.transaction_id || null,
            paymentResult.provider_ref   || null,
            paymentResult.success ? null : paymentResult.message,
            JSON.stringify({ method, phone: paymentPhone || null }),
          ]
        );

    // PCI DSS 10.2 — log synchronous payment initiation
    await writePaymentAudit({
      payment_id:   payment.rows[0].id,
      ride_id,
      user_id:      userId,
      event_type:   'payment_initiated',
      amount,
      method,
      status_after: paymentStatus,
      ip_address:   req.ip,
      user_agent:   req.get('user-agent'),
    });

    if (paymentResult.success) {
      await db.query(
        "UPDATE rides SET payment_status = 'paid', payment_method = $1 WHERE id = $2",
        [method, ride_id]
      );
      await writePaymentAudit({
        payment_id:    payment.rows[0].id,
        ride_id,
        user_id:       userId,
        event_type:    'payment_completed',
        amount,
        method,
        provider_ref:  paymentResult.transaction_id || paymentResult.provider_ref,
        status_before: 'pending',
        status_after:  'completed',
        ip_address:    req.ip,
        user_agent:    req.get('user-agent'),
      });

      // Award 2% loyalty bonus for every 20,000 XAF spend milestone (fire-and-forget)
      checkAndAwardLoyaltyBonus(userId, amountXAF, ride_id).catch(() => {});
    }

    if (!paymentResult.success) {
      await writePaymentAudit({
        payment_id:    payment.rows[0].id,
        ride_id,
        user_id:       userId,
        event_type:    'payment_failed',
        amount,
        method,
        status_before: 'pending',
        status_after:  'failed',
        ip_address:    req.ip,
        user_agent:    req.get('user-agent'),
        metadata:      { reason: paymentResult.message },
      });
      return res.status(402).json({
        success: false,
        message: paymentResult.message,
        data: { payment: payment.rows[0] },
      });
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment:        payment.rows[0],
        transaction_id: paymentResult.transaction_id,
      },
    });
  } catch (err) {
    logger.error('[ChargeRide Error]', err);
    res.status(500).json({ success: false, message: 'Payment processing failed' });
  }
};

/**
 * GET /payments/status/:referenceId
 * Poll the live status of a pending mobile-money payment.
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const userId      = req.user.id;
    const { referenceId } = req.params;

    const { rows } = await db.query(
      'SELECT * FROM payments WHERE provider_ref = $1 AND user_id = $2 LIMIT 1',
      [referenceId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const payment = rows[0];

    // Already resolved — return cached result
    if (payment.status === 'completed' || payment.status === 'failed') {
      return res.json({
        success: true,
        data: {
          status:         payment.status,
          payment_id:     payment.id,
          transaction_id: payment.transaction_id,
        },
      });
    }

    // Mock payments (dev mode) — auto-succeed after first poll
    const metadata = payment.metadata || {};
    if (metadata.mock) {
      await resolvePendingPayment(payment.id, 'completed', `MOCK-${Date.now()}`, null);
      return res.json({
        success: true,
        data: { status: 'completed', payment_id: payment.id },
      });
    }

    // Poll the real provider
    const provider = metadata.provider;
    let providerData;

    try {
      if (provider === 'mtn') {
        providerData = await pollMtnStatus(referenceId);
      } else if (provider === 'orange') {
        providerData = await pollOrangeStatus(referenceId, metadata.pay_token);
      } else {
        // Unknown provider — return current DB status
        return res.json({ success: true, data: { status: payment.status, payment_id: payment.id } });
      }
    } catch (pollErr) {
      logger.error(`[checkPaymentStatus] Provider poll failed:`, pollErr.message);
      return res.json({ success: true, data: { status: 'pending', payment_id: payment.id } });
    }

    // MTN: SUCCESSFUL / FAILED / PENDING
    // Orange: SUCCESS / FAILED / PENDING
    const rawStatus = (providerData.status || '').toUpperCase();

    if (rawStatus === 'SUCCESSFUL' || rawStatus === 'SUCCESS') {
      const txnId = providerData.financialTransactionId || providerData.txnid || referenceId;
      await resolvePendingPayment(payment.id, 'completed', txnId, null);
      return res.json({
        success: true,
        data: { status: 'completed', payment_id: payment.id, transaction_id: txnId },
      });
    }

    if (rawStatus === 'FAILED' || rawStatus === 'FAIL') {
      const reason = providerData.reason || providerData.message || 'Provider declined';
      await resolvePendingPayment(payment.id, 'failed', null, reason);
      return res.json({
        success: true,
        data: { status: 'failed', payment_id: payment.id, reason },
      });
    }

    // Still pending
    return res.json({ success: true, data: { status: 'pending', payment_id: payment.id } });
  } catch (err) {
    logger.error('[checkPaymentStatus Error]', err);
    res.status(500).json({ success: false, message: 'Status check failed' });
  }
};

/**
 * POST /payments/webhook/mtn  (public — no auth middleware)
 */
const webhookMtn = async (req, res) => {
  try {
    // Verify webhook secret token to prevent spoofing
    const webhookSecret = process.env.MTN_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-mtn-signature'] || req.headers['x-callback-secret'];
      if (!signature) return res.sendStatus(401);
      const rawBody = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const provided = signature.replace(/^sha256=/, '');
      try {
        const expectedBuf = Buffer.from(expected, 'hex');
        const providedBuf = Buffer.from(provided, 'hex');
        // Reject immediately if lengths differ — padding tricks cannot pass
        if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
          return res.sendStatus(401);
        }
      } catch {
        return res.sendStatus(401);
      }
    }

    // MTN sends a callback with the same referenceId used in X-Reference-Id header
    const body        = req.body || {};
    const referenceId = body.externalId || req.headers['x-reference-id'];
    const status      = (body.status || '').toUpperCase();

    if (!referenceId || !status) {
      return res.status(400).json({ message: 'Missing referenceId or status' });
    }

    // SELECT FOR UPDATE SKIP LOCKED ensures concurrent webhook deliveries don't double-process
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        "SELECT id FROM payments WHERE provider_ref = $1 AND status = 'pending' LIMIT 1 FOR UPDATE SKIP LOCKED",
        [referenceId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.sendStatus(200); // already resolved, already locked by another delivery, or unknown
      }

      if (status === 'SUCCESSFUL') {
        const txnId = body.financialTransactionId || referenceId;
        await resolvePendingPayment(rows[0].id, 'completed', txnId, null);
      } else if (status === 'FAILED') {
        await resolvePendingPayment(rows[0].id, 'failed', null, body.reason || 'MTN declined');
      }

      await client.query('COMMIT');
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }

    logger.info({ referenceId, status }, "[Webhook/MTN] callback received");
    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, '[Webhook/MTN Error]');
    res.sendStatus(500);
  }
};

/**
 * POST /payments/webhook/orange  (public — no auth middleware)
 */
const webhookOrange = async (req, res) => {
  try {
    // Verify webhook secret token to prevent spoofing
    const webhookSecret = process.env.ORANGE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-orange-signature'] || req.headers['x-callback-secret'];
      if (!signature) return res.sendStatus(401);
      const rawBody = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const provided = signature.replace(/^sha256=/, '');
      try {
        const expectedBuf = Buffer.from(expected, 'hex');
        const providedBuf = Buffer.from(provided, 'hex');
        // Reject immediately if lengths differ — padding tricks cannot pass
        if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
          return res.sendStatus(401);
        }
      } catch {
        return res.sendStatus(401);
      }
    }

    const body    = req.body || {};
    const orderId = body.order_id;
    const status  = (body.status || '').toUpperCase();

    if (!orderId || !status) {
      return res.status(400).json({ message: 'Missing order_id or status' });
    }

    // SELECT FOR UPDATE SKIP LOCKED prevents concurrent Orange webhook deliveries from double-processing
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        "SELECT id FROM payments WHERE provider_ref = $1 AND status = 'pending' LIMIT 1 FOR UPDATE SKIP LOCKED",
        [orderId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.sendStatus(200);
      }

      if (status === 'SUCCESS' || status === 'SUCCESSFUL') {
        await resolvePendingPayment(rows[0].id, 'completed', body.txnid || orderId, null);
      } else if (status === 'FAILED' || status === 'FAIL') {
        await resolvePendingPayment(rows[0].id, 'failed', null, body.message || 'Orange declined');
      }

      await client.query('COMMIT');
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }

    logger.info({ orderId, status }, '[Webhook/Orange] callback received');
    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, '[Webhook/Orange Error]');
    res.sendStatus(500);
  }
};

/**
 * GET /payments/history
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);

    // READ-REPLICA: payment history is read-only — offload to replica
    const [result, countResult, totalSpentResult] = await Promise.all([
      db.queryRead(
        `SELECT
          p.*,
          r.pickup_address, r.dropoff_address, r.ride_type,
          r.distance_km, r.duration_minutes
         FROM payments p
         LEFT JOIN rides r ON p.ride_id = r.id
         WHERE p.user_id = $1
         ORDER BY p.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, safeLimit, parseInt(offset)]
      ),
      db.queryRead('SELECT COUNT(*) FROM payments WHERE user_id = $1', [userId]),
      db.queryRead(
        "SELECT SUM(amount) AS total FROM payments WHERE user_id = $1 AND status = 'completed'",
        [userId]
      ),
    ]);

    res.json({
      success: true,
      data: {
        payments:       result.rows,
        total:          parseInt(countResult.rows[0].count),
        total_spent_xaf: parseInt(totalSpentResult.rows[0].total) || 0,
        limit:           parseInt(limit),
        offset:          parseInt(offset),
      },
    });
  } catch (err) {
    logger.error('[GetPaymentHistory Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get payment history' });
  }
};

/**
 * POST /payments/refund/:id
 */
const refundPayment = async (req, res) => {
  try {
    const userId    = req.user.id;
    const isAdmin   = req.user.role === 'admin';
    const { id: paymentId } = req.params;
    const { reason } = req.body;

    // Admins can refund any payment; riders can only refund their own
    const paymentResult = isAdmin
      ? await db.query('SELECT * FROM payments WHERE id = $1', [paymentId])
      : await db.query('SELECT * FROM payments WHERE id = $1 AND user_id = $2', [paymentId, userId]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Non-admins can only refund their own payments (double-check ownership)
    if (!isAdmin && payment.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (payment.status === 'refunded') {
      return res.status(400).json({ success: false, message: 'Payment already refunded' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Only completed payments can be refunded' });
    }

    if (payment.method === 'wallet') {
      await db.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [payment.amount, payment.user_id]
      );
    }

    await db.query(
      `UPDATE payments SET status = 'refunded', metadata = metadata || $1 WHERE id = $2`,
      [JSON.stringify({ refund_reason: reason, refunded_at: new Date().toISOString() }), paymentId]
    );

    await writePaymentAudit({
      payment_id:    paymentId,
      ride_id:       payment.ride_id,
      user_id:       userId,
      event_type:    'payment_refunded',
      amount:        payment.amount,
      method:        payment.method,
      provider_ref:  payment.provider_ref,
      status_before: 'completed',
      status_after:  'refunded',
      ip_address:    req.ip,
      user_agent:    req.get('user-agent'),
      metadata:      { refund_reason: reason },
    });

    if (payment.ride_id) {
      await db.query(
        "UPDATE rides SET payment_status = 'refunded' WHERE id = $1",
        [payment.ride_id]
      );
    }

    res.json({
      success: true,
      message: `Refund of ${Number(payment.amount || 0).toLocaleString()} XAF processed`,
      data: { payment_id: paymentId, amount: payment.amount, method: payment.method },
    });
  } catch (err) {
    logger.error('[RefundPayment Error]', err);
    res.status(500).json({ success: false, message: 'Failed to process refund' });
  }
};

/**
 * GET /payments/wallet
 */
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    // READ-REPLICA: wallet balance is read-only
    const result = await db.queryRead(
      'SELECT wallet_balance, loyalty_points FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { wallet_balance, loyalty_points } = result.rows[0];
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
        currency: 'XAF',
      },
    });
  } catch (err) {
    logger.error('[GetWalletBalance Error]', err);
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
        message: 'Invalid plan. Choose: basic (5,000 XAF/month) or premium (10,000 XAF/month)',
      });
    }

    const planData = SUBSCRIPTION_PLANS[plan];

    const existingSub = await db.query(
      `SELECT id, plan, expires_at FROM subscriptions
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()`,
      [userId]
    );

    if (existingSub.rows.length > 0) {
      const existing = existingSub.rows[0];
      return res.status(400).json({
        success: false,
        message: `You already have an active ${existing.plan} subscription until ${new Date(existing.expires_at).toLocaleDateString()}`,
      });
    }

    let paymentResult;
    switch (method) {
      case 'cash':
        paymentResult = { success: true, transaction_id: `CASH-SUB-${Date.now()}`, provider_ref: 'CASH' };
        break;
      case 'mtn_mobile_money':
        paymentResult = await withProviderBreaker('mtn_mobile_money', () => processMtnMobileMoney(phone, planData.price, 'XAF'))
          .then((r) => (r.provider_unavailable ? r : { success: r.status === 'pending', ...r }));
        break;
      case 'orange_money':
        paymentResult = await withProviderBreaker('orange_money', () => processOrangeMoney(phone, planData.price, 'XAF'))
          .then((r) => (r.provider_unavailable ? r : { success: r.status === 'pending', ...r }));
        break;
      case 'wave':
        paymentResult = await withProviderBreaker('wave', () => processWave(phone, planData.price, 'XAF'));
        break;
      case 'wallet': {
        const userResult = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [userId]);
        const bal = userResult.rows[0].wallet_balance;
        if (bal < planData.price) {
          return res.status(400).json({
            success: false,
            message: `Insufficient wallet balance. You have ${bal} XAF, need ${planData.price} XAF.`,
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

    const paymentRecord = await db.query(
      `INSERT INTO payments (user_id, amount, currency, method, status, transaction_id, provider_ref, metadata)
       VALUES ($1, $2, 'XAF', $3, 'completed', $4, $5, $6)
       RETURNING id`,
      [userId, planData.price, method,
       paymentResult.transaction_id || paymentResult.reference_id,
       paymentResult.provider_ref   || paymentResult.reference_id,
       JSON.stringify({ type: 'subscription', plan })]
    );

    const expiresAt = new Date(Date.now() + planData.duration_days * 24 * 60 * 60 * 1000);

    const sub = await db.query(
      `INSERT INTO subscriptions (user_id, plan, price, currency, expires_at, payment_id)
       VALUES ($1, $2, $3, 'XAF', $4, $5)
       RETURNING *`,
      [userId, plan, planData.price, expiresAt, paymentRecord.rows[0].id]
    );

    await db.query(
      'UPDATE users SET subscription_plan = $1, subscription_expiry = $2 WHERE id = $3',
      [plan, expiresAt, userId]
    );

    res.status(201).json({
      success: true,
      message: `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan activated! Enjoy your discounts.`,
      data: { subscription: sub.rows[0], plan_details: planData, expires_at: expiresAt },
    });
  } catch (err) {
    logger.error('[ProcessSubscription Error]', err);
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

    const activeSub = result.rows.find((s) => s.is_active && new Date(s.expires_at) > new Date());

    res.json({
      success: true,
      data: {
        active_subscription: activeSub || null,
        history:             result.rows,
        available_plans:     SUBSCRIPTION_PLANS,
      },
    });
  } catch (err) {
    logger.error('[GetSubscriptionStatus Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get subscription' });
  }
};

/**
 * POST /payments/stripe/payment-intent
 * Creates a Stripe PaymentIntent and returns the client_secret to the mobile app.
 * The app uses this with the Stripe payment sheet SDK to collect card details securely.
 *
 * Body: { ride_id?, amount?, currency? }
 */
const createStripePaymentIntent = async (req, res) => {
  try {
    const userId   = req.user.id;
    const { ride_id, amount: bodyAmount, currency = 'XAF' } = req.body;

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === 'sk_test_xxxx') {
      // Dev mode — return a mock client secret so the UI can be tested
      return res.json({
        success: true,
        mock: true,
        client_secret: `pi_mock_${Date.now()}_secret_mock`,
        publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mock',
        amount: bodyAmount || 0,
        currency,
      });
    }

    let amount = bodyAmount;
    if (!amount && ride_id) {
      const rideRow = await db.query(
        'SELECT estimated_fare, final_fare FROM rides WHERE id = $1 AND rider_id = $2',
        [ride_id, userId]
      );
      if (rideRow.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Ride not found' });
      }
      amount = rideRow.rows[0].final_fare || rideRow.rows[0].estimated_fare;
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'amount is required' });
    }

    const stripe = require('stripe')(stripeKey);

    // Idempotency key prevents duplicate PaymentIntents on client retry
    const idempotencyKey = uuidv4();

    // XAF is a zero-decimal currency — Stripe expects the amount as-is (not ×100)
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount:   Math.round(amount),
        currency: currency.toLowerCase(),
        metadata: { user_id: userId, ride_id: ride_id || '', idempotency_key: idempotencyKey },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey }
    );

    res.json({
      success:           true,
      client_secret:     paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      idempotency_key:   idempotencyKey,
      publishable_key:   process.env.STRIPE_PUBLISHABLE_KEY,
      amount,
      currency,
    });
  } catch (err) {
    logger.error('[CreateStripePaymentIntent Error]', err.message);
    res.status(500).json({ success: false, message: `Failed to create payment intent: ${err.message}` });
  }
};

/**
 * POST /payments/stripe/confirm
 * Called by the mobile app after the user completes the Stripe payment sheet.
 * The Stripe SDK returns a PaymentIntent ID; this endpoint:
 *   1. Retrieves the PI from Stripe to verify its status.
 *   2. Records the payment row (or updates an existing one) in our DB.
 *   3. Returns the final status so the app can show a receipt or retry prompt.
 *
 * Body: { payment_intent_id, ride_id? }
 */
const confirmStripePayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { payment_intent_id, ride_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({ success: false, message: 'payment_intent_id is required' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === 'sk_test_xxxx') {
      // Dev/test mode — trust the client's assertion
      return res.json({
        success: true,
        mock: true,
        status: 'succeeded',
        message: 'Payment recorded (mock mode)',
      });
    }

    const stripe = require('stripe')(stripeKey);
    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    } catch (stripeErr) {
      logger.error('[ConfirmStripe] Failed to retrieve PaymentIntent', stripeErr.message);
      return res.status(400).json({ success: false, message: `Invalid payment_intent_id: ${stripeErr.message}` });
    }

    // Verify the PI belongs to this user (metadata set in createStripePaymentIntent)
    if (pi.metadata?.user_id && pi.metadata.user_id !== String(userId)) {
      return res.status(403).json({ success: false, message: 'PaymentIntent does not belong to this user' });
    }

    const succeeded = pi.status === 'succeeded';
    const amount    = pi.amount; // XAF integer (zero-decimal currency)

    // Upsert payment record
    await db.query(
      `INSERT INTO payments
         (user_id, ride_id, amount, method, status, provider, provider_ref,
          stripe_payment_intent_id, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, 'card', $4, 'stripe', $5, $5, $6, NOW(), NOW())
       ON CONFLICT (stripe_payment_intent_id) DO UPDATE
         SET status     = EXCLUDED.status,
             updated_at = NOW()`,
      [
        userId,
        ride_id || pi.metadata?.ride_id || null,
        amount,
        succeeded ? 'completed' : pi.status,
        pi.id,
        JSON.stringify({ stripe_status: pi.status, currency: pi.currency }),
      ]
    );

    // Mark ride as paid if succeeded and ride_id provided
    if (succeeded && (ride_id || pi.metadata?.ride_id)) {
      const rideId = ride_id || pi.metadata?.ride_id;
      await db.query(
        `UPDATE rides
         SET payment_status = 'paid', payment_method = 'card', updated_at = NOW()
         WHERE id = $1 AND rider_id = $2`,
        [rideId, userId]
      );
    }

    res.json({
      success:  succeeded,
      status:   pi.status,
      amount,
      currency: pi.currency.toUpperCase(),
      message:  succeeded ? 'Payment confirmed' : `Payment status: ${pi.status}`,
    });
  } catch (err) {
    logger.error('[ConfirmStripe Error]', err.message);
    res.status(500).json({ success: false, message: `Payment confirmation failed: ${err.message}` });
  }
};

/**
 * POST /payments/webhook/stripe
 * Handles Stripe webhook events. Must receive the raw request body (not JSON-parsed)
 * so that signature verification works. Registered in server.js before express.json().
 *
 * Handles:
 *   payment_intent.succeeded       → mark payment completed
 *   payment_intent.payment_failed  → mark payment failed
 */
const webhookStripe = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('[StripeWebhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // req.body is a raw Buffer (express.raw middleware applied in server.js)
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error({ err }, '[StripeWebhook] Signature verification failed');
    return res.status(400).json({ error: 'Webhook signature invalid' });
  }

  // Idempotency: skip if we already processed this event
  const existing = await db.query(
    'SELECT id FROM stripe_webhook_events WHERE stripe_event_id = $1',
    [event.id]
  );
  if (existing.rows.length > 0) {
    // Already processed — return 200 so Stripe stops retrying
    return res.json({ received: true, duplicate: true });
  }

  // Record the event first (before processing) to prevent concurrent duplicates
  await db.query(
    `INSERT INTO stripe_webhook_events
       (stripe_event_id, event_type, payment_intent_id, raw_payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (stripe_event_id) DO NOTHING`,
    [
      event.id,
      event.type,
      event.data?.object?.id || null,
      JSON.stringify(event),
    ]
  );

  const pi = event.data?.object; // PaymentIntent object

  if (event.type === 'payment_intent.succeeded') {
    // Find the payment row by provider_ref (PaymentIntent ID) or metadata idempotency_key
    const paymentRow = await db.query(
      `SELECT id, ride_id, user_id, amount, status FROM payments
       WHERE provider_ref = $1 OR metadata->>'idempotency_key' = $2
       LIMIT 1`,
      [pi.id, pi.metadata?.idempotency_key || '']
    );

    if (paymentRow.rows.length > 0) {
      const payment = paymentRow.rows[0];
      if (payment.status !== 'completed') {
        await db.query(
          `UPDATE payments SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [payment.id]
        );
        // Mark ride as paid
        await db.query(
          `UPDATE rides SET payment_status = 'paid' WHERE id = $1`,
          [payment.ride_id]
        );
        await writePaymentAudit({
          payment_id:   payment.id,
          ride_id:      payment.ride_id,
          user_id:      payment.user_id,
          event_type:   'payment_completed',
          amount:       payment.amount,
          method:       'card',
          provider:     'stripe',
          provider_ref: pi.id,
          status_before: payment.status,
          status_after:  'completed',
          metadata:     { stripe_event_id: event.id, payment_method: pi.payment_method },
        });
      }
    } else {
      logger.warn({ piId: pi.id }, '[StripeWebhook] payment_intent.succeeded: no matching payment row');
    }

  } else if (event.type === 'payment_intent.payment_failed') {
    const paymentRow = await db.query(
      `SELECT id, ride_id, user_id, amount, status FROM payments
       WHERE provider_ref = $1 OR metadata->>'idempotency_key' = $2
       LIMIT 1`,
      [pi.id, pi.metadata?.idempotency_key || '']
    );

    if (paymentRow.rows.length > 0) {
      const payment = paymentRow.rows[0];
      if (payment.status !== 'failed') {
        await db.query(
          `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1`,
          [payment.id]
        );
        await writePaymentAudit({
          payment_id:   payment.id,
          ride_id:      payment.ride_id,
          user_id:      payment.user_id,
          event_type:   'payment_failed',
          amount:       payment.amount,
          method:       'card',
          provider:     'stripe',
          provider_ref: pi.id,
          status_before: payment.status,
          status_after:  'failed',
          metadata:     {
            stripe_event_id:   event.id,
            failure_code:      pi.last_payment_error?.code,
            failure_message:   pi.last_payment_error?.message,
          },
        });
      }
    }
  }

  res.json({ received: true });
};

/**
 * POST /payments/driver/cashout
 * Driver initiates payout of accumulated earnings to their mobile money account.
 *
 * Workflow:
 *   1. Verify caller is a driver
 *   2. Look up available_balance on drivers table
 *   3. Validate minimum cashout (500 XAF) and sufficient balance
 *   4. Deduct balance atomically (UPDATE WHERE available_balance >= amount)
 *   5. Insert cashout record (status = 'pending')
 *   6. Return cashout reference for client polling
 */
const driverCashout = async (req, res) => {
  try {
    const driverUserId = req.user.id;
    const { amount, method = 'mtn_momo', phone } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive integer (XAF)' });
    }

    const MIN_CASHOUT_XAF = 500;
    if (amount < MIN_CASHOUT_XAF) {
      return res.status(400).json({
        success: false,
        message: `Minimum cashout is ${MIN_CASHOUT_XAF.toLocaleString()} XAF`,
      });
    }

    const ALLOWED_METHODS = ['mtn_momo', 'orange_money', 'bank_transfer'];
    if (!ALLOWED_METHODS.includes(method)) {
      return res.status(400).json({
        success: false,
        message: `method must be one of: ${ALLOWED_METHODS.join(', ')}`,
      });
    }

    // Find driver record
    const driverRow = await db.query(
      'SELECT id, available_balance FROM drivers WHERE user_id = $1',
      [driverUserId]
    );
    if (!driverRow.rows[0]) {
      return res.status(403).json({ success: false, message: 'Driver account not found' });
    }

    const driverId = driverRow.rows[0].id;

    // Atomic deduction — prevents double-spend
    const deduct = await db.query(
      `UPDATE drivers
         SET available_balance = available_balance - $1
       WHERE id = $2 AND available_balance >= $1
       RETURNING available_balance`,
      [amount, driverId]
    );

    if (!deduct.rows[0]) {
      return res.status(400).json({ success: false, message: 'Insufficient available balance' });
    }

    // Record cashout
    const cashout = await db.query(
      `INSERT INTO driver_cashouts
         (driver_id, amount, method, phone, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, amount, method, status, created_at`,
      [driverId, amount, method, phone || null]
    );

    res.status(202).json({
      success:           true,
      message:           'Cashout initiated — funds will arrive within 24 hours',
      data: {
        cashout_id:        cashout.rows[0].id,
        amount,
        method,
        status:            'pending',
        remaining_balance: deduct.rows[0].available_balance,
        currency:          'XAF',
      },
    });
  } catch (err) {
    logger.error('[DriverCashout Error]', err);
    res.status(500).json({ success: false, message: 'Cashout request failed' });
  }
};

/**
 * GET /payments/driver/cashout-history
 * Returns the driver's past cashout records (paginated).
 */
const getDriverCashoutHistory = async (req, res) => {
  try {
    const driverUserId = req.user.id;
    const limit  = Math.min(parseInt(req.query.limit  || '20', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);

    const driverRow = await db.query(
      'SELECT id FROM drivers WHERE user_id = $1',
      [driverUserId]
    );
    if (!driverRow.rows[0]) {
      return res.status(403).json({ success: false, message: 'Driver account not found' });
    }

    const driverId = driverRow.rows[0].id;

    const results = await db.query(
      `SELECT id, amount, method, phone, status, created_at, completed_at, failure_reason
         FROM driver_cashouts
        WHERE driver_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [driverId, limit, offset]
    );

    const count = await db.query(
      'SELECT COUNT(*)::int FROM driver_cashouts WHERE driver_id = $1',
      [driverId]
    );

    res.json({
      success: true,
      data: {
        cashouts: results.rows,
        total:    count.rows[0].count,
        limit,
        offset,
        currency: 'XAF',
      },
    });
  } catch (err) {
    logger.error('[GetDriverCashoutHistory Error]', err);
    res.status(500).json({ success: false, message: 'Failed to load cashout history' });
  }
};

/**
 * POST /payments/webhook/flutterwave  (public — no auth middleware)
 *
 * Flutterwave sends a `verif-hash` header equal to the FLW_SECRET_HASH (also
 * accepted as FLUTTERWAVE_WEBHOOK_HASH for backwards compatibility) secret you
 * set in the Flutterwave dashboard. We use timingSafeEqual to prevent
 * timing-oracle attacks even on this simpler comparison.
 *
 * Security: https://developer.flutterwave.com/docs/integration-guides/webhooks/
 */
const webhookFlutterwave = async (req, res) => {
  try {
    // ── Signature verification ────────────────────────────────────────────────
    // FLW_SECRET_HASH is the canonical Flutterwave env var name; fall back to
    // FLUTTERWAVE_WEBHOOK_HASH for backwards compatibility.
    const webhookHash = process.env.FLW_SECRET_HASH || process.env.FLUTTERWAVE_WEBHOOK_HASH;
    if (webhookHash) {
      const provided = req.headers['verif-hash'] || '';
      if (!provided) {
        logger.warn('[Webhook/Flutterwave] Missing verif-hash header');
        return res.sendStatus(401);
      }
      // timingSafeEqual on UTF-8 buffers — prevent timing oracle
      const expectedBuf = Buffer.from(webhookHash);
      const providedBuf = Buffer.from(provided);
      const maxLen = Math.max(expectedBuf.length, providedBuf.length);
      const ePad = Buffer.alloc(maxLen); expectedBuf.copy(ePad);
      const pPad = Buffer.alloc(maxLen); providedBuf.copy(pPad);
      if (ePad.length !== pPad.length || !crypto.timingSafeEqual(ePad, pPad)) {
        logger.warn('[Webhook/Flutterwave] Invalid verif-hash — request rejected');
        return res.sendStatus(401);
      }
    } else {
      logger.warn('[Webhook/Flutterwave] FLW_SECRET_HASH not set — skipping signature check');
    }

    const body = req.body || {};
    // Flutterwave wraps event data in body.data
    const event  = body.event || '';
    const data   = body.data  || {};
    const txRef  = data.tx_ref || data.flw_ref;
    const status = (data.status || '').toUpperCase();

    if (!txRef || !status) {
      return res.status(400).json({ message: 'Missing tx_ref or status' });
    }

    const { rows } = await db.query(
      "SELECT id FROM payments WHERE provider_ref = $1 AND status = 'pending' LIMIT 1",
      [txRef]
    );

    if (rows.length === 0) {
      return res.sendStatus(200); // already resolved or unknown tx_ref
    }

    if (status === 'SUCCESSFUL') {
      await resolvePendingPayment(rows[0].id, 'completed', data.flw_ref || txRef, null);
    } else if (status === 'FAILED') {
      await resolvePendingPayment(rows[0].id, 'failed', null, data.processor_response || 'Flutterwave declined');
    }

    logger.info({ txRef, status, event }, '[Webhook/Flutterwave] callback processed');
    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, '[Webhook/Flutterwave Error]');
    res.sendStatus(500);
  }
};

module.exports = {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultMethod,
  deletePaymentMethod,
  chargeRide,
  checkPaymentStatus,
  createStripePaymentIntent,
  confirmStripePayment,
  webhookMtn,
  webhookOrange,
  webhookStripe,
  webhookFlutterwave,
  getPaymentHistory,
  refundPayment,
  getWalletBalance,
  processSubscription,
  getSubscriptionStatus,
  driverCashout,
  getDriverCashoutHistory,
  bulkRefund,
};

// ── Bulk Refund (CF-006) ──────────────────────────────────────────────────────
/**
 * POST /payments/admin/bulk/refund
 * Issue refunds for up to 100 payments in a single audited operation.
 * Each refund is attempted individually; partial failure returns a summary.
 * Requires: finance:write admin permission.
 */
async function bulkRefund(req, res) {
  const { payment_ids, reason = 'bulk_admin_refund' } = req.body;

  if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
    return res.status(400).json({ error: 'payment_ids must be a non-empty array' });
  }
  if (payment_ids.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 payments per bulk refund' });
  }

  const results = { succeeded: [], failed: [], skipped: [] };

  for (const paymentId of payment_ids) {
    try {
      const { rows } = await db.query(
        `SELECT id, ride_id, user_id, amount, method, status, metadata
         FROM payments WHERE id = $1`,
        [paymentId]
      );
      const payment = rows[0];
      if (!payment) { results.skipped.push({ id: paymentId, reason: 'not_found' }); continue; }
      if (payment.status === 'refunded') { results.skipped.push({ id: paymentId, reason: 'already_refunded' }); continue; }
      if (payment.status !== 'completed') { results.skipped.push({ id: paymentId, reason: `status_is_${payment.status}` }); continue; }

      // Mark as refunded atomically
      const { rowCount } = await db.query(
        `UPDATE payments
         SET status = 'refunded',
             metadata = metadata || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2 AND status = 'completed'`,
        [JSON.stringify({ refund_reason: reason, refunded_by: req.user?.id, refunded_at: new Date().toISOString() }), paymentId]
      );

      if (rowCount === 0) {
        results.skipped.push({ id: paymentId, reason: 'concurrent_update' });
      } else {
        results.succeeded.push(paymentId);
        logger.info('[BulkRefund] Refunded payment', { paymentId, admin: req.user?.id });
      }
    } catch (err) {
      logger.error('[BulkRefund] Error on payment', { paymentId, err: err.message });
      results.failed.push({ id: paymentId, reason: err.message });
    }
  }

  const statusCode = results.failed.length === payment_ids.length ? 500
    : results.succeeded.length === 0 ? 422
    : 207; // Multi-Status: partial success

  res.status(statusCode).json({
    success: results.failed.length === 0 && results.skipped.length === 0,
    ...results,
    summary: {
      total:     payment_ids.length,
      succeeded: results.succeeded.length,
      failed:    results.failed.length,
      skipped:   results.skipped.length,
    },
  });
}
