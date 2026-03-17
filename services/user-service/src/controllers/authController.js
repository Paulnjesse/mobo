const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'mobo_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a 6-digit OTP
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP via Twilio SMS (graceful fallback if no credentials)
 */
async function sendOtpSms(phone, otp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber ||
      accountSid === 'ACxxxx' || authToken === 'xxxx') {
    console.log(`[MOBO OTP] Mock SMS to ${phone}: Your MOBO code is ${otp}`);
    return { success: true, mock: true };
  }

  try {
    const twilio = require('twilio')(accountSid, authToken);
    const message = await twilio.messages.create({
      body: `Your MOBO verification code is: ${otp}. Valid for 10 minutes. Never share this code.`,
      from: fromNumber,
      to: phone
    });
    return { success: true, sid: message.sid };
  } catch (err) {
    console.error('[MOBO OTP] Twilio error:', err.message);
    console.log(`[MOBO OTP] Fallback — OTP for ${phone}: ${otp}`);
    return { success: true, mock: true, error: err.message };
  }
}

/**
 * POST /auth/signup
 */
const signup = async (req, res) => {
  try {
    const {
      full_name, phone, email, password,
      role = 'rider', country = 'Cameroon',
      city, language = 'fr', date_of_birth, gender
    } = req.body;

    if (!full_name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'full_name, phone, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const validRoles = ['rider', 'driver'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    // Check phone uniqueness
    const existingPhone = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Phone number already registered' });
    }

    // Check email uniqueness if provided
    if (email) {
      const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    const otp_code = generateOtp();
    const otp_expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO users (
        id, full_name, phone, email, password_hash, role,
        country, city, language, date_of_birth, gender,
        otp_code, otp_expiry, is_verified, loyalty_points
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,50)
      RETURNING id, full_name, phone, email, role, country, city, language,
                is_verified, loyalty_points, created_at`,
      [id, full_name, phone, email || null, password_hash, role,
       country, city || null, language, date_of_birth || null, gender || null,
       otp_code, otp_expiry]
    );

    const user = result.rows[0];

    // Award signup loyalty points transaction
    await db.query(
      `INSERT INTO loyalty_transactions (user_id, points, action, description)
       VALUES ($1, 50, 'signup_bonus', 'Welcome to MOBO — 50 bonus points!')`,
      [id]
    );

    // Send OTP
    await sendOtpSms(phone, otp_code);

    res.status(201).json({
      success: true,
      message: 'Account created! Please verify your phone number with the OTP sent.',
      data: {
        user,
        otp_sent: true,
        note: process.env.NODE_ENV === 'development' ? `DEV OTP: ${otp_code}` : undefined
      }
    });
  } catch (err) {
    console.error('[Signup Error]', err);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
};

/**
 * POST /auth/login
 */
const login = async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    if (!password || (!phone && !email)) {
      return res.status(400).json({
        success: false,
        message: 'Phone or email and password are required'
      });
    }

    const query = phone
      ? 'SELECT * FROM users WHERE phone = $1'
      : 'SELECT * FROM users WHERE email = $1';
    const param = phone || email;

    const result = await db.query(query, [param]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.is_suspended) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Contact support.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Get driver info if applicable
    let driverInfo = null;
    if (user.role === 'driver') {
      const driverResult = await db.query(
        `SELECT d.*, v.make, v.model, v.vehicle_type, v.plate, v.color
         FROM drivers d
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         WHERE d.user_id = $1`,
        [user.id]
      );
      driverInfo = driverResult.rows[0] || null;
    }

    const tokenPayload = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      full_name: user.full_name
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          full_name: user.full_name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          country: user.country,
          city: user.city,
          language: user.language,
          is_verified: user.is_verified,
          rating: user.rating,
          total_rides: user.total_rides,
          loyalty_points: user.loyalty_points,
          wallet_balance: user.wallet_balance,
          subscription_plan: user.subscription_plan,
          profile_picture: user.profile_picture
        },
        driver: driverInfo
      }
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

/**
 * POST /auth/verify
 */
const verify = async (req, res) => {
  try {
    const { phone, otp_code } = req.body;

    if (!phone || !otp_code) {
      return res.status(400).json({ success: false, message: 'phone and otp_code are required' });
    }

    const result = await db.query(
      'SELECT id, otp_code, otp_expiry, is_verified FROM users WHERE phone = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.json({ success: true, message: 'Account already verified' });
    }

    if (!user.otp_code || user.otp_code !== otp_code) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code' });
    }

    if (new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    await db.query(
      `UPDATE users SET is_verified = true, otp_code = NULL, otp_expiry = NULL
       WHERE id = $1`,
      [user.id]
    );

    res.json({ success: true, message: 'Phone verified successfully. Welcome to MOBO!' });
  } catch (err) {
    console.error('[Verify Error]', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

/**
 * POST /auth/resend-otp
 */
const resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }

    const result = await db.query('SELECT id, is_verified FROM users WHERE phone = $1', [phone]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.json({ success: true, message: 'Account already verified' });
    }

    const otp_code = generateOtp();
    const otp_expiry = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'UPDATE users SET otp_code = $1, otp_expiry = $2 WHERE id = $3',
      [otp_code, otp_expiry, user.id]
    );

    await sendOtpSms(phone, otp_code);

    res.json({
      success: true,
      message: 'New OTP sent',
      note: process.env.NODE_ENV === 'development' ? `DEV OTP: ${otp_code}` : undefined
    });
  } catch (err) {
    console.error('[ResendOtp Error]', err);
    res.status(500).json({ success: false, message: 'Failed to resend OTP' });
  }
};

/**
 * POST /auth/logout
 * JWT is stateless; client drops the token.
 * This endpoint provides a clean API contract.
 */
const logout = async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully. See you soon on MOBO!' });
};

/**
 * POST /auth/refresh-token
 */
const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // Check if token is less than 30 days old (don't allow indefinite refresh)
    const issuedAt = decoded.iat * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - issuedAt > thirtyDays) {
      return res.status(401).json({ success: false, message: 'Token too old, please login again' });
    }

    const result = await db.query(
      'SELECT id, phone, email, role, full_name, is_active, is_suspended FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.is_active || user.is_suspended) {
      return res.status(403).json({ success: false, message: 'Account not active' });
    }

    const newToken = jwt.sign(
      { id: user.id, phone: user.phone, email: user.email, role: user.role, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ success: true, data: { token: newToken } });
  } catch (err) {
    console.error('[RefreshToken Error]', err);
    res.status(500).json({ success: false, message: 'Token refresh failed' });
  }
};

module.exports = { signup, login, verify, resendOtp, logout, refreshToken };
