const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { validateImageMagicBytes } = require('../utils/validateImageBuffer');

/**
 * maskPhone — returns a privacy-safe version of a phone number.
 * Shows the country code prefix and last 4 digits; masks the middle.
 * e.g. "+237600000001" → "+237 ****0001"
 *      "+2348123456789" → "+234 ****6789"
 * Returns null/undefined unchanged; strings shorter than 8 chars are not masked.
 */
function maskPhone(phone) {
  if (!phone) return phone;
  const s = String(phone).replace(/\s/g, '');
  if (s.length < 8) return s;
  // Preserve leading + and up to 4 digits of country code, mask middle, show last 4
  const prefixMatch = s.match(/^(\+\d{1,4})/);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  const rest   = s.slice(prefix.length);
  const tail   = rest.slice(-4);
  return `${prefix} ****${tail}`;
}

/**
 * GET /users/profile
 * REFACTORED: Now uses the robust Global Error Handling architecture
 * instead of raw try/catch blocks.
 */
const getProfile = asyncHandler(async (req, res, next) => {
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
    return next(new AppError('User not found', 404));
  }

  const user = result.rows[0];
  // Mask phone in API response — full phone is only needed internally
  user.phone = maskPhone(user.phone);

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
    teenAccounts = teenResult.rows.map(t => ({ ...t, phone: maskPhone(t.phone) }));
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
});


/**
 * PUT /users/profile
 * REFACTORED: Uses asyncHandler for consistency with getProfile.
 */
const updateProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { full_name, city, language, gender, date_of_birth, profile_picture, preferences } = req.body;

  const validLanguages = ['en', 'fr', 'sw'];
  if (language && !validLanguages.includes(language)) {
    return next(new AppError('Language must be en, fr, or sw', 400));
  }

  // Update base user profile
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
    return next(new AppError('User not found', 404));
  }

  // If driver preferences were passed, update the driver record
  if (preferences && req.user.role === 'driver') {
    if (preferences.minRiderRating !== undefined) {
      await db.query(
        `UPDATE drivers SET min_rider_rating = $1 WHERE user_id = $2`,
        [preferences.minRiderRating, userId]
      );
    }
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user: result.rows[0] }
  });
});

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
    logger.error('[CreateTeenAccount Error]', err);
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
    logger.error('[GetTeenAccounts Error]', err);
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
    logger.error('[UpdateLanguage Error]', err);
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

    logger.info(`[DeleteAccount] User ${userId} deleted. Reason: ${reason || 'not provided'}`);

    res.json({ success: true, message: 'Account deleted. We are sad to see you go.' });
  } catch (err) {
    logger.error('[DeleteAccount Error]', err);
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
    logger.error('[GetNotifications Error]', err);
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
    logger.error('[MarkNotificationRead Error]', err);
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
    logger.error('[GetLoyaltyInfo Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get loyalty info' });
  }
};

/**
 * POST /users/corporate
 * body: { company_name, billing_email, monthly_budget }
 * Create a corporate account and set the requesting user as admin.
 */
const createCorporateAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { company_name, billing_email, monthly_budget = 0 } = req.body;

    if (!company_name || !billing_email) {
      return res.status(400).json({
        success: false,
        message: 'company_name and billing_email are required'
      });
    }

    // Check user doesn't already have a corporate account
    const existingCheck = await db.query(
      'SELECT id FROM corporate_accounts WHERE admin_user_id = $1 AND is_active = true',
      [userId]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active corporate account'
      });
    }

    const { v4: uuidv4 } = require('uuid');
    const corpId = uuidv4();

    const result = await db.query(
      `INSERT INTO corporate_accounts
         (id, company_name, admin_user_id, billing_email, monthly_budget, currency)
       VALUES ($1, $2, $3, $4, $5, 'XAF')
       RETURNING *`,
      [corpId, company_name, userId, billing_email, parseInt(monthly_budget)]
    );

    const corp = result.rows[0];

    // Link user as admin
    await db.query(
      `UPDATE users SET corporate_account_id = $1, corporate_role = 'admin' WHERE id = $2`,
      [corpId, userId]
    );

    // Add user as admin member
    await db.query(
      `INSERT INTO corporate_members (corporate_account_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (corporate_account_id, user_id) DO NOTHING`,
      [corpId, userId]
    );

    res.status(201).json({
      success: true,
      message: 'Corporate account created successfully',
      data: { corporate_account: corp }
    });
  } catch (err) {
    logger.error('[CreateCorporateAccount Error]', err);
    res.status(500).json({ success: false, message: 'Failed to create corporate account' });
  }
};

/**
 * GET /users/corporate
 * Get corporate account details, members list, and current month spend.
 */
const getCorporateAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find corporate account for this user
    const userResult = await db.query(
      'SELECT corporate_account_id, corporate_role FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0] || !userResult.rows[0].corporate_account_id) {
      return res.status(404).json({ success: false, message: 'No corporate account found' });
    }

    const { corporate_account_id } = userResult.rows[0];

    const corpResult = await db.query(
      'SELECT * FROM corporate_accounts WHERE id = $1 AND is_active = true',
      [corporate_account_id]
    );

    if (corpResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Corporate account not found or inactive' });
    }

    const corp = corpResult.rows[0];

    // Fetch members
    const membersResult = await db.query(
      `SELECT cm.id, cm.user_id, cm.role, cm.spending_limit, cm.is_active, cm.joined_at,
              u.full_name, u.phone, u.email, u.total_rides, u.rating
       FROM corporate_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.corporate_account_id = $1
       ORDER BY cm.joined_at ASC`,
      [corporate_account_id]
    );

    // Current month spend
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const spendResult = await db.query(
      `SELECT COALESCE(SUM(r.final_fare), 0) AS current_spend
       FROM rides r
       JOIN users u ON r.rider_id = u.id
       WHERE u.corporate_account_id = $1
         AND r.status = 'completed'
         AND r.created_at >= $2`,
      [corporate_account_id, monthStart]
    );

    const currentSpend = parseInt(spendResult.rows[0].current_spend);

    res.json({
      success: true,
      data: {
        corporate_account: corp,
        members: membersResult.rows,
        member_count: membersResult.rows.length,
        current_month_spend: currentSpend,
        budget_remaining: Math.max(corp.monthly_budget - currentSpend, 0),
        currency: 'XAF'
      }
    });
  } catch (err) {
    logger.error('[GetCorporateAccount Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get corporate account' });
  }
};

/**
 * POST /users/corporate/members
 * body: { user_phone_or_email, role, spending_limit }
 * Add a user to the corporate account.
 */
const addCorporateMember = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const { user_phone_or_email, role = 'employee', spending_limit = 0 } = req.body;

    if (!user_phone_or_email) {
      return res.status(400).json({ success: false, message: 'user_phone_or_email is required' });
    }

    const validRoles = ['admin', 'manager', 'employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be admin, manager, or employee' });
    }

    // Verify requester is admin of a corporate account
    const adminResult = await db.query(
      `SELECT ca.id AS corp_id FROM corporate_accounts ca
       WHERE ca.admin_user_id = $1 AND ca.is_active = true`,
      [adminUserId]
    );

    if (adminResult.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Only corporate admins can add members' });
    }

    const corpId = adminResult.rows[0].corp_id;

    // Find target user by phone or email
    const targetResult = await db.query(
      'SELECT id, full_name, phone, email FROM users WHERE phone = $1 OR email = $1',
      [user_phone_or_email]
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found with that phone/email' });
    }

    const targetUser = targetResult.rows[0];

    // Check if already a member
    const existingMember = await db.query(
      'SELECT id FROM corporate_members WHERE corporate_account_id = $1 AND user_id = $2',
      [corpId, targetUser.id]
    );

    if (existingMember.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'User is already a member of this corporate account' });
    }

    const memberResult = await db.query(
      `INSERT INTO corporate_members (corporate_account_id, user_id, role, spending_limit)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [corpId, targetUser.id, role, parseInt(spending_limit)]
    );

    // Update user's corporate link
    await db.query(
      'UPDATE users SET corporate_account_id = $1, corporate_role = $2 WHERE id = $3',
      [corpId, role, targetUser.id]
    );

    res.status(201).json({
      success: true,
      message: `${targetUser.full_name} added to corporate account`,
      data: {
        member: memberResult.rows[0],
        user: { id: targetUser.id, full_name: targetUser.full_name, phone: targetUser.phone }
      }
    });
  } catch (err) {
    logger.error('[AddCorporateMember Error]', err);
    res.status(500).json({ success: false, message: 'Failed to add corporate member' });
  }
};

/**
 * DELETE /users/corporate/members/:userId
 * Remove a member from the corporate account.
 */
const removeCorporateMember = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const { userId: targetUserId } = req.params;

    // Verify requester is admin
    const adminResult = await db.query(
      'SELECT id AS corp_id FROM corporate_accounts WHERE admin_user_id = $1 AND is_active = true',
      [adminUserId]
    );

    if (adminResult.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Only corporate admins can remove members' });
    }

    const corpId = adminResult.rows[0].corp_id;

    // Cannot remove self (admin)
    if (targetUserId === adminUserId) {
      return res.status(400).json({ success: false, message: 'Cannot remove yourself from your own corporate account' });
    }

    const deleteResult = await db.query(
      'DELETE FROM corporate_members WHERE corporate_account_id = $1 AND user_id = $2 RETURNING id',
      [corpId, targetUserId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found in this corporate account' });
    }

    // Clear user's corporate link
    await db.query(
      `UPDATE users SET corporate_account_id = NULL, corporate_role = 'employee' WHERE id = $1`,
      [targetUserId]
    );

    res.json({ success: true, message: 'Member removed from corporate account' });
  } catch (err) {
    logger.error('[RemoveCorporateMember Error]', err);
    res.status(500).json({ success: false, message: 'Failed to remove corporate member' });
  }
};

/**
 * GET /users/corporate/rides
 * List all rides by corporate members this month with costs.
 */
const getCorporateRides = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    // Find user's corporate account
    const userResult = await db.query(
      'SELECT corporate_account_id, corporate_role FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0] || !userResult.rows[0].corporate_account_id) {
      return res.status(404).json({ success: false, message: 'No corporate account found' });
    }

    const { corporate_account_id } = userResult.rows[0];

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const ridesResult = await db.query(
      `SELECT
         r.id, r.ride_type, r.status,
         r.pickup_address, r.dropoff_address,
         r.distance_km, r.duration_minutes,
         r.estimated_fare, r.final_fare,
         r.payment_method, r.payment_status,
         r.created_at, r.completed_at,
         u.id AS rider_id, u.full_name AS rider_name, u.phone AS rider_phone,
         cm.role AS member_role
       FROM rides r
       JOIN users u ON r.rider_id = u.id
       JOIN corporate_members cm ON cm.user_id = u.id AND cm.corporate_account_id = $1
       WHERE u.corporate_account_id = $1
         AND r.created_at >= $2
       ORDER BY r.created_at DESC
       LIMIT $3 OFFSET $4`,
      [corporate_account_id, monthStart, parseInt(limit), parseInt(offset)]
    );

    const totalSpendResult = await db.query(
      `SELECT COALESCE(SUM(r.final_fare), 0) AS total_spend
       FROM rides r
       JOIN users u ON r.rider_id = u.id
       WHERE u.corporate_account_id = $1
         AND r.status = 'completed'
         AND r.created_at >= $2`,
      [corporate_account_id, monthStart]
    );

    res.json({
      success: true,
      data: {
        rides: ridesResult.rows,
        count: ridesResult.rows.length,
        total_spend_this_month: parseInt(totalSpendResult.rows[0].total_spend),
        currency: 'XAF'
      }
    });
  } catch (err) {
    logger.error('[GetCorporateRides Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get corporate rides' });
  }
};

/**
 * GET /users/subscription
 * Return current user's subscription plan, expiry, and benefits.
 */
const getSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await db.query(
      'SELECT subscription_plan, subscription_expiry FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { subscription_plan, subscription_expiry } = userResult.rows[0];

    // Fetch active subscription record
    const subResult = await db.query(
      `SELECT id, plan, price, currency, started_at, expires_at, is_active
       FROM subscriptions
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    const activeSubscription = subResult.rows[0] || null;

    const PLAN_BENEFITS = {
      none: {
        name: 'No Subscription',
        price: 0,
        discount_percent: 0,
        description: 'Standard fares apply',
        features: []
      },
      basic: {
        name: 'MOBO Basic',
        price: 5000,
        discount_percent: 10,
        description: '10% off all rides, 5,000 XAF/month',
        features: [
          '10% discount on all rides',
          'Priority customer support',
          'Monthly ride summary report'
        ]
      },
      premium: {
        name: 'MOBO Premium',
        price: 10000,
        discount_percent: 20,
        description: '20% off all rides, 10,000 XAF/month',
        features: [
          '20% discount on all rides',
          'Priority driver matching',
          'Free cancellation (up to 3/month)',
          'Dedicated support line',
          'Monthly ride summary report',
          'Early access to new features'
        ]
      }
    };

    const plan = subscription_plan || 'none';
    const benefits = PLAN_BENEFITS[plan] || PLAN_BENEFITS.none;

    res.json({
      success: true,
      data: {
        current_plan: plan,
        subscription_expiry,
        is_active: activeSubscription !== null,
        active_subscription: activeSubscription,
        benefits,
        available_plans: [
          PLAN_BENEFITS.basic,
          PLAN_BENEFITS.premium
        ],
        currency: 'XAF'
      }
    });
  } catch (err) {
    logger.error('[GetSubscription Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get subscription info' });
  }
};

/**
 * POST /users/profile/photo
 * body: multipart/form-data  field: photo  (image file)
 *    OR application/json     field: image_base64, mime_type
 *
 * Stores the image as a base64 data-URI in profile_picture.
 * In production swap storage to S3/Cloudinary and return an HTTPS URL.
 */
const uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    let photoDataUri = null;

    let rawBuffer = null;

    if (req.file) {
      // multer uploaded file (multipart/form-data)
      rawBuffer = req.file.buffer;
    } else if (req.body?.image_base64) {
      // JSON body with pre-encoded base64
      const raw = req.body.image_base64.replace(/^data:[^;]+;base64,/, '');
      rawBuffer = Buffer.from(raw, 'base64');
    } else {
      return next(new AppError('No image provided. Send a file upload (field: photo) or image_base64 in JSON body.', 400));
    }

    // ── Magic byte validation — prevents MIME spoofing ────────────────────
    // Check actual file bytes, not the client-supplied Content-Type header.
    if (!validateImageMagicBytes(rawBuffer)) {
      return next(new AppError('File content does not match a supported image format (JPEG, PNG, GIF, WebP, HEIC).', 400));
    }

    // ── Size guard — 5 MB binary limit ────────────────────────────────────
    const MAX_BYTES = 5 * 1024 * 1024;
    if (rawBuffer.length > MAX_BYTES) {
      return next(new AppError('Image too large. Maximum 5 MB.', 413));
    }

    // Determine MIME type from magic bytes (do not trust client header)
    const mime = req.file?.mimetype?.startsWith('image/') ? req.file.mimetype : 'image/jpeg';
    const b64 = rawBuffer.toString('base64');
    photoDataUri = `data:${mime};base64,${b64}`;

    const result = await db.query(
      `UPDATE users SET profile_picture = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, profile_picture, updated_at`,
      [photoDataUri, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile photo updated',
      data: {
        profile_picture: result.rows[0].profile_picture,
        updated_at: result.rows[0].updated_at,
      },
    });
  } catch (err) {
    logger.error('[UploadProfilePhoto Error]', err);
    res.status(500).json({ success: false, message: 'Failed to upload profile photo' });
  }
};

/**
 * PUT /users/push-token
 * body: { expo_push_token }
 * Update the user's Expo push notification token.
 */
const updateExpoPushToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { expo_push_token } = req.body;

    if (!expo_push_token) {
      return res.status(400).json({ success: false, message: 'expo_push_token is required' });
    }

    // Basic validation: Expo tokens start with ExponentPushToken[ or exp://
    const isValidFormat =
      typeof expo_push_token === 'string' &&
      expo_push_token.length > 10 &&
      (expo_push_token.startsWith('ExponentPushToken[') ||
       expo_push_token.startsWith('ExpoPushToken['));

    if (!isValidFormat) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Expo push token format. Expected ExponentPushToken[...] or ExpoPushToken[...]'
      });
    }

    await db.query(
      'UPDATE users SET expo_push_token = $1 WHERE id = $2',
      [expo_push_token, userId]
    );

    res.json({
      success: true,
      message: 'Push notification token updated successfully',
      data: { expo_push_token }
    });
  } catch (err) {
    logger.error('[UpdateExpoPushToken Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update push token' });
  }
};

/**
 * POST /users/block/:riderId
 */
const blockRider = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { riderId } = req.params;
    const { reason, comment } = req.body;

    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can block riders' });
    }

    const { v4: uuidv4 } = require('uuid');
    
    await db.query(
      `INSERT INTO blocked_riders (id, driver_id, rider_id, reason, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (driver_id, rider_id) DO NOTHING`,
      [uuidv4(), driverId, riderId, reason || 'other', comment]
    );

    res.json({ success: true, message: 'Rider blocked successfully' });
  } catch (err) {
    logger.error('[BlockRider Error]', err);
    res.status(500).json({ success: false, message: 'Failed to block rider' });
  }
};

/**
 * DELETE /users/block/:riderId
 */
const unblockRider = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { riderId } = req.params;

    await db.query(`DELETE FROM blocked_riders WHERE driver_id = $1 AND rider_id = $2`, [driverId, riderId]);

    res.json({ success: true, message: 'Rider unblocked successfully' });
  } catch (err) {
    logger.error('[UnblockRider Error]', err);
    res.status(500).json({ success: false, message: 'Failed to unblock rider' });
  }
};

/**
 * POST /users/appeal
 */
const submitAppeal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason || reason.length < 20) {
      return res.status(400).json({ success: false, message: 'Please provide a detailed reason (at least 20 chars)' });
    }

    const { v4: uuidv4 } = require('uuid');
    await db.query(
      `INSERT INTO deactivation_appeals (id, user_id, appeal_text, status)
       VALUES ($1, $2, $3, 'pending')`,
      [uuidv4(), userId, reason]
    );

    res.json({ success: true, message: 'Appeal submitted for review' });
  } catch (err) {
    logger.error('[SubmitAppeal Error]', err);
    res.status(500).json({ success: false, message: 'Failed to submit appeal' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadProfilePhoto,
  createTeenAccount,
  getTeenAccounts,
  updateLanguage,
  deleteAccount,
  getNotifications,
  markNotificationRead,
  getLoyaltyInfo,
  createCorporateAccount,
  getCorporateAccount,
  addCorporateMember,
  removeCorporateMember,
  getCorporateRides,
  getSubscription,
  updateExpoPushToken,
  blockRider,
  unblockRider,
  submitAppeal,
};
