const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * GET /users/profile
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT
        u.id, u.full_name, u.phone, u.email, u.role,
        u.profile_picture, u.date_of_birth, u.gender,
        u.country, u.city, u.language,
        u.is_verified, u.is_active,
        u.rating, u.total_rides, u.loyalty_points, u.wallet_balance,
        u.subscription_plan, u.subscription_expiry,
        u.is_teen_account, u.parent_id,
        u.created_at, u.updated_at
       FROM users u
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    // Fetch driver info if applicable
    let driverInfo = null;
    if (user.role === 'driver') {
      const driverResult = await db.query(
        `SELECT
          d.id, d.license_number, d.license_expiry, d.is_approved, d.is_online,
          d.total_earnings, d.acceptance_rate, d.cancellation_rate,
          v.id AS vehicle_id, v.make, v.model, v.year, v.plate,
          v.color, v.vehicle_type, v.seats, v.is_wheelchair_accessible, v.is_active
         FROM drivers d
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         WHERE d.user_id = $1`,
        [userId]
      );
      driverInfo = driverResult.rows[0] || null;
    }

    // Fetch teen accounts if parent
    let teenAccounts = [];
    if (!user.is_teen_account) {
      const teenResult = await db.query(
        `SELECT id, full_name, phone, email, total_rides, created_at
         FROM users WHERE parent_id = $1 AND is_teen_account = true`,
        [userId]
      );
      teenAccounts = teenResult.rows;
    }

    // Fetch active subscription
    const subResult = await db.query(
      `SELECT id, plan, price, currency, started_at, expires_at
       FROM subscriptions
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const activeSubscription = subResult.rows[0] || null;

    res.json({
      success: true,
      data: {
        user,
        driver: driverInfo,
        teen_accounts: teenAccounts,
        active_subscription: activeSubscription
      }
    });
  } catch (err) {
    console.error('[GetProfile Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
};

/**
 * PUT /users/profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, city, language, gender, date_of_birth, profile_picture } = req.body;

    const validLanguages = ['en', 'fr', 'sw'];
    if (language && !validLanguages.includes(language)) {
      return res.status(400).json({ success: false, message: 'Language must be en, fr, or sw' });
    }

    const result = await db.query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        city = COALESCE($2, city),
        language = COALESCE($3, language),
        gender = COALESCE($4, gender),
        date_of_birth = COALESCE($5, date_of_birth),
        profile_picture = COALESCE($6, profile_picture)
       WHERE id = $7
       RETURNING id, full_name, phone, email, city, language, gender,
                 date_of_birth, profile_picture, updated_at`,
      [full_name || null, city || null, language || null,
       gender || null, date_of_birth || null, profile_picture || null, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: result.rows[0] }
    });
  } catch (err) {
    console.error('[UpdateProfile Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

/**
 * POST /users/teen-account
 * Create a teen account linked to the parent
 */
const createTeenAccount = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { full_name, phone, password, date_of_birth } = req.body;

    if (!full_name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'full_name, phone, and password are required for teen account'
      });
    }

    // Verify parent exists and is a real account
    const parentResult = await db.query(
      'SELECT id, is_teen_account, country, language FROM users WHERE id = $1',
      [parentId]
    );

    if (parentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Parent account not found' });
    }

    if (parentResult.rows[0].is_teen_account) {
      return res.status(400).json({
        success: false,
        message: 'Teen accounts cannot create sub-accounts'
      });
    }

    // Check existing teen accounts (max 3)
    const countResult = await db.query(
      'SELECT COUNT(*) FROM users WHERE parent_id = $1 AND is_teen_account = true',
      [parentId]
    );

    if (parseInt(countResult.rows[0].count) >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum of 3 teen accounts per parent'
      });
    }

    // Check phone uniqueness
    const existingPhone = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Phone number already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const parent = parentResult.rows[0];

    const result = await db.query(
      `INSERT INTO users (
        id, full_name, phone, password_hash, role,
        country, language, is_teen_account, parent_id,
        is_verified, loyalty_points
      ) VALUES ($1,$2,$3,$4,'rider',$5,$6,true,$7,true,50)
      RETURNING id, full_name, phone, role, is_teen_account, parent_id, created_at`,
      [id, full_name, phone, password_hash, parent.country,
       parent.language, parentId,
       date_of_birth || null]
    );

    // Notify parent
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, data)
       VALUES ($1, $2, $3, 'teen_account', $4)`,
      [parentId,
       'Teen account created',
       `A new teen account for ${full_name} has been created successfully.`,
       JSON.stringify({ teen_id: id, teen_name: full_name })]
    );

    // Signup bonus for teen
    await db.query(
      `INSERT INTO loyalty_transactions (user_id, points, action, description)
       VALUES ($1, 50, 'signup_bonus', 'Teen account welcome bonus')`,
      [id]
    );

    res.status(201).json({
      success: true,
      message: 'Teen account created successfully',
      data: { teen_account: result.rows[0] }
    });
  } catch (err) {
    console.error('[CreateTeenAccount Error]', err);
    res.status(500).json({ success: false, message: 'Failed to create teen account' });
  }
};

/**
 * GET /users/teen-accounts
 */
const getTeenAccounts = async (req, res) => {
  try {
    const parentId = req.user.id;

    const result = await db.query(
      `SELECT id, full_name, phone, email, total_rides, rating, loyalty_points,
              is_active, created_at
       FROM users
       WHERE parent_id = $1 AND is_teen_account = true
       ORDER BY created_at ASC`,
      [parentId]
    );

    res.json({
      success: true,
      data: { teen_accounts: result.rows, count: result.rows.length }
    });
  } catch (err) {
    console.error('[GetTeenAccounts Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get teen accounts' });
  }
};

/**
 * PUT /users/language
 */
const updateLanguage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { language } = req.body;

    const validLanguages = ['en', 'fr', 'sw'];
    if (!language || !validLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Language must be one of: en, fr, sw'
      });
    }

    await db.query('UPDATE users SET language = $1 WHERE id = $2', [language, userId]);

    const labels = { en: 'English', fr: 'Français', sw: 'Kiswahili' };

    res.json({
      success: true,
      message: `Language updated to ${labels[language]}`,
      data: { language }
    });
  } catch (err) {
    console.error('[UpdateLanguage Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update language' });
  }
};

/**
 * DELETE /users/account
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password, reason } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password required to delete account' });
    }

    const result = await db.query(
      'SELECT id, password_hash, role FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    // Check for active rides
    const activeRideResult = await db.query(
      `SELECT id FROM rides
       WHERE (rider_id = $1 OR driver_id IN (SELECT id FROM drivers WHERE user_id = $1))
       AND status NOT IN ('completed', 'cancelled')`,
      [userId]
    );

    if (activeRideResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with active rides. Please complete or cancel them first.'
      });
    }

    // Soft delete — deactivate and anonymize
    await db.query(
      `UPDATE users SET
        is_active = false,
        full_name = 'Deleted User',
        phone = $1,
        email = NULL,
        profile_picture = NULL,
        otp_code = NULL
       WHERE id = $2`,
      [`DELETED_${Date.now()}_${userId.substring(0, 8)}`, userId]
    );

    console.log(`[DeleteAccount] User ${userId} deleted. Reason: ${reason || 'not provided'}`);

    res.json({ success: true, message: 'Account deleted. We are sad to see you go.' });
  } catch (err) {
    console.error('[DeleteAccount Error]', err);
    res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
};

/**
 * GET /users/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT id, title, message, type, is_read, data, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unread_count: parseInt(countResult.rows[0].count)
      }
    });
  } catch (err) {
    console.error('[GetNotifications Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get notifications' });
  }
};

/**
 * PUT /users/notifications/:id/read
 */
const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    console.error('[MarkNotificationRead Error]', err);
    res.status(500).json({ success: false, message: 'Failed to mark notification' });
  }
};

/**
 * GET /users/loyalty
 */
const getLoyaltyInfo = async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await db.query(
      'SELECT loyalty_points, wallet_balance FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const transactions = await db.query(
      `SELECT points, action, description, created_at
       FROM loyalty_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    const user = userResult.rows[0];

    res.json({
      success: true,
      data: {
        loyalty_points: user.loyalty_points,
        wallet_balance: user.wallet_balance,
        // 100 points = 500 XAF
        points_value_xaf: user.loyalty_points * 5,
        transactions: transactions.rows
      }
    });
  } catch (err) {
    console.error('[GetLoyaltyInfo Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get loyalty info' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  createTeenAccount,
  getTeenAccounts,
  updateLanguage,
  deleteAccount,
  getNotifications,
  markNotificationRead,
  getLoyaltyInfo
};
