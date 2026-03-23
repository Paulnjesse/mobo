const axios   = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

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
    console.error('[PaymentAudit] Failed to write audit record:', err.message, {
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
    console.warn('[MTN MoMo] Credentials not configured — using dev mock');
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
    console.warn('[Orange Money] Credentials not configured — using dev mock');
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
    console.warn('[Wave] WAVE_API_KEY not configured — payment rejected');
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
    console.error('[Wave] API error:', err.message);
    return { success: false, message: `Wave payment failed: ${err.message}` };
  }
}

async function processStripe(amount, currency, paymentMethodToken) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey || stripeKey === 'sk_test_xxxx') {
    console.log(`[Stripe Mock] Processing ${amount} ${currency}`);
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
    console.error('[Stripe Error]', err.message);
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
      if (cleanCard.length < 4) {
        return res.status(400).json({ success: false, message: 'Invalid card number' });
      }
      card_last4 = cleanCard.slice(-4);
    } else {
      if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number required for mobile money' });
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
    res.json({ success: true, data: { payment_methods: result.rows, count: result.rows.length } });
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

    const amount = ride.final_fare || ride.estimated_fare;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid fare amount' });
    }

    // Resolve phone: body param → saved payment method
    let paymentPhone = phone;
    if (!paymentPhone && payment_method_id) {
      const pmRow = await db.query(
        'SELECT phone FROM payment_methods WHERE id = $1 AND user_id = $2',
        [payment_method_id, userId]
      );
      paymentPhone = pmRow.rows[0]?.phone || null;
    }

    // ── MOBILE MONEY (async) ──────────────────────────────────────────────────
    if (method === 'mtn_mobile_money' || method === 'orange_money') {
      if (!paymentPhone) {
        return res.status(400).json({ success: false, message: 'Phone number required for mobile money' });
      }

      let initResult;
      try {
        initResult = method === 'mtn_mobile_money'
          ? await processMtnMobileMoney(paymentPhone, amount, 'XAF')
          : await processOrangeMoney(paymentPhone, amount, 'XAF');
      } catch (providerErr) {
        console.error(`[${method}] Init error:`, providerErr.message);
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
         VALUES ($1, $2, $3, 'XAF', $4, 'pending', $5, $6)
         RETURNING id, status, provider_ref`,
        [ride_id, userId, amount, method, initResult.reference_id, JSON.stringify(metadata)]
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
    const userResult = await db.query(
      'SELECT wallet_balance FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    let paymentResult;

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
        paymentResult = await processWave(paymentPhone, amount, 'XAF');
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
        paymentResult = await processStripe(amount, 'XAF', stripeToken);
        break;
      }

      case 'wallet':
        if (user.wallet_balance < amount) {
          return res.status(400).json({
            success: false,
            message: `Insufficient wallet balance. You have ${user.wallet_balance} XAF, need ${amount} XAF.`,
          });
        }
        await db.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
          [amount, userId]
        );
        paymentResult = {
          success: true,
          transaction_id: `WALLET-${Date.now()}`,
          provider_ref: 'WALLET',
          message: 'Wallet payment successful',
        };
        break;

      default:
        paymentResult = { success: false, message: 'Unsupported payment method' };
    }

    const paymentStatus = paymentResult.success ? 'completed' : 'failed';

    const payment = await db.query(
      `INSERT INTO payments
         (ride_id, user_id, amount, currency, method, status, transaction_id, provider_ref, failure_reason, metadata)
       VALUES ($1, $2, $3, 'XAF', $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        ride_id, userId, amount, method, paymentStatus,
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
    console.error('[ChargeRide Error]', err);
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
      console.error(`[checkPaymentStatus] Provider poll failed:`, pollErr.message);
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
    console.error('[checkPaymentStatus Error]', err);
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
      const crypto = require('crypto');
      const rawBody = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const provided = signature.replace(/^sha256=/, '');
      try {
        const expectedBuf = Buffer.from(expected, 'hex');
        const providedBuf = Buffer.from(provided.padEnd(expected.length * 2, '0').slice(0, expected.length * 2), 'hex');
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

    const { rows } = await db.query(
      "SELECT id FROM payments WHERE provider_ref = $1 AND status = 'pending' LIMIT 1",
      [referenceId]
    );

    if (rows.length === 0) {
      return res.sendStatus(200); // already resolved or unknown
    }

    if (status === 'SUCCESSFUL') {
      const txnId = body.financialTransactionId || referenceId;
      await resolvePendingPayment(rows[0].id, 'completed', txnId, null);
    } else if (status === 'FAILED') {
      await resolvePendingPayment(rows[0].id, 'failed', null, body.reason || 'MTN declined');
    }

    console.log(`[Webhook/MTN] ref=${referenceId} status=${status}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook/MTN Error]', err.message);
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
      const crypto = require('crypto');
      const rawBody = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const provided = signature.replace(/^sha256=/, '');
      try {
        const expectedBuf = Buffer.from(expected, 'hex');
        const providedBuf = Buffer.from(provided.padEnd(expected.length * 2, '0').slice(0, expected.length * 2), 'hex');
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

    const { rows } = await db.query(
      "SELECT id FROM payments WHERE provider_ref = $1 AND status = 'pending' LIMIT 1",
      [orderId]
    );

    if (rows.length === 0) {
      return res.sendStatus(200);
    }

    if (status === 'SUCCESS' || status === 'SUCCESSFUL') {
      await resolvePendingPayment(rows[0].id, 'completed', body.txnid || orderId, null);
    } else if (status === 'FAILED' || status === 'FAIL') {
      await resolvePendingPayment(rows[0].id, 'failed', null, body.message || 'Orange declined');
    }

    console.log(`[Webhook/Orange] order=${orderId} status=${status}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook/Orange Error]', err.message);
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
      [userId, safeLimit, parseInt(offset)]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM payments WHERE user_id = $1',
      [userId]
    );

    const totalSpentResult = await db.query(
      "SELECT SUM(amount) AS total FROM payments WHERE user_id = $1 AND status = 'completed'",
      [userId]
    );

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
    console.error('[GetPaymentHistory Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get payment history' });
  }
};

/**
 * POST /payments/refund/:id
 */
const refundPayment = async (req, res) => {
  try {
    const userId    = req.user.id;
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

    if (payment.method === 'wallet') {
      await db.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [payment.amount, userId]
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
      message: `Refund of ${payment.amount.toLocaleString()} XAF processed`,
      data: { payment_id: paymentId, amount: payment.amount, method: payment.method },
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
        // Subscriptions via mobile money use the same async flow but we simplify here
        // (production should use the full async flow)
        paymentResult = await processMtnMobileMoney(phone, planData.price, 'XAF')
          .then((r) => ({ success: r.status === 'pending', ...r }));
        break;
      case 'orange_money':
        paymentResult = await processOrangeMoney(phone, planData.price, 'XAF')
          .then((r) => ({ success: r.status === 'pending', ...r }));
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
    console.error('[GetSubscriptionStatus Error]', err);
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
    console.error('[CreateStripePaymentIntent Error]', err.message);
    res.status(500).json({ success: false, message: `Failed to create payment intent: ${err.message}` });
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
    console.error('[StripeWebhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // req.body is a raw Buffer (express.raw middleware applied in server.js)
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[StripeWebhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
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
      console.warn('[StripeWebhook] payment_intent.succeeded: no matching payment row for PI', pi.id);
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

module.exports = {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultMethod,
  deletePaymentMethod,
  chargeRide,
  checkPaymentStatus,
  createStripePaymentIntent,
  webhookMtn,
  webhookOrange,
  webhookStripe,
  getPaymentHistory,
  refundPayment,
  getWalletBalance,
  processSubscription,
  getSubscriptionStatus,
};
