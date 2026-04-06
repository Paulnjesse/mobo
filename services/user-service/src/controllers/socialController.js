const pool = require('../config/database');

// ============================================================
// REFERRAL SYSTEM
// ============================================================

const getReferralInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await pool.query(
      'SELECT referral_code, referral_credits FROM users WHERE id = $1', [userId]
    );
    if (!user.rows[0]) return res.status(404).json({ error: 'User not found' });

    const referrals = await pool.query(
      `SELECT r.*, u.full_name as referred_name, u.created_at as joined_at
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    res.json({
      referral_code: user.rows[0].referral_code,
      referral_credits: user.rows[0].referral_credits,
      referrals: referrals.rows,
      referrer_reward: 1000, // XAF per qualified referral
      referee_reward: 500
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const MAX_REFERRALS_PER_REFERRER_PER_DAY = 10;
const ACCOUNT_AGE_MAX_DAYS = 7; // new account must apply code within 7 days

const applyReferralCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    // Referred account must be new (prevent old-account shill farms)
    const accountAge = await pool.query(
      'SELECT created_at FROM users WHERE id = $1',
      [userId]
    );
    if (!accountAge.rows[0]) return res.status(404).json({ error: 'User not found' });
    const ageMs = Date.now() - new Date(accountAge.rows[0].created_at).getTime();
    if (ageMs > ACCOUNT_AGE_MAX_DAYS * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Referral codes can only be applied to new accounts within 7 days of registration' });
    }

    // Find referrer
    const referrer = await pool.query('SELECT id FROM users WHERE referral_code = $1', [code]);
    if (!referrer.rows[0]) return res.status(404).json({ error: 'Invalid referral code' });
    if (String(referrer.rows[0].id) === String(userId)) return res.status(400).json({ error: 'Cannot use your own referral code' });

    // Check if already used a referral
    const existing = await pool.query('SELECT id FROM referrals WHERE referred_id = $1', [userId]);
    if (existing.rows[0]) return res.status(400).json({ error: 'Referral code already applied' });

    // Velocity check: cap referrer to MAX_REFERRALS_PER_REFERRER_PER_DAY per day
    const velocityCheck = await pool.query(
      `SELECT COUNT(*) FROM referrals
       WHERE referrer_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
      [referrer.rows[0].id]
    );
    if (parseInt(velocityCheck.rows[0].count) >= MAX_REFERRALS_PER_REFERRER_PER_DAY) {
      return res.status(429).json({ error: 'Referral limit reached for this code today' });
    }

    // Apply
    await pool.query(
      `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)`,
      [referrer.rows[0].id, userId]
    );
    await pool.query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrer.rows[0].id, userId]);

    // Give referee immediate credit
    await pool.query(
      'UPDATE users SET referral_credits = referral_credits + 500, wallet_balance = wallet_balance + 500 WHERE id = $1',
      [userId]
    );

    res.json({ success: true, credit_received: 500, message: '500 XAF credit added to your wallet' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const qualifyReferral = async (referredId) => {
  // Called after referred user completes first ride
  try {
    const referral = await pool.query(
      `SELECT * FROM referrals WHERE referred_id = $1 AND status = 'pending'`, [referredId]
    );
    if (!referral.rows[0]) return;

    await pool.query(
      `UPDATE referrals SET status = 'paid', qualified_at = NOW(), paid_at = NOW() WHERE id = $1`,
      [referral.rows[0].id]
    );

    // Pay referrer
    await pool.query(
      `UPDATE users SET referral_credits = referral_credits + 1000, wallet_balance = wallet_balance + 1000
       WHERE id = $1`,
      [referral.rows[0].referrer_id]
    );
  } catch (err) {
    console.error('qualifyReferral error:', err.message);
  }
};

// ============================================================
// FAMILY ACCOUNTS
// ============================================================

const createFamilyAccount = async (req, res) => {
  try {
    const ownerId = req.headers['x-user-id'];
    const { name, monthly_limit } = req.body;

    // Check not already in a family
    const existing = await pool.query(
      'SELECT * FROM family_accounts WHERE owner_id = $1 AND is_active = true', [ownerId]
    );
    if (existing.rows[0]) return res.status(400).json({ error: 'You already have a family account' });

    const result = await pool.query(
      `INSERT INTO family_accounts (owner_id, name, monthly_limit) VALUES ($1, $2, $3) RETURNING *`,
      [ownerId, name || 'My Family', monthly_limit]
    );

    const family = result.rows[0];

    // Add owner as member
    await pool.query(
      `INSERT INTO family_members (family_account_id, user_id, role, can_see_rides)
       VALUES ($1, $2, 'owner', true)`,
      [family.id, ownerId]
    );
    await pool.query('UPDATE users SET family_account_id = $1 WHERE id = $2', [family.id, ownerId]);

    res.status(201).json({ family });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getFamilyAccount = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];

    const user = await pool.query('SELECT family_account_id FROM users WHERE id = $1', [userId]);
    const familyId = user.rows[0]?.family_account_id;
    if (!familyId) return res.status(404).json({ error: 'No family account' });

    const family = await pool.query('SELECT * FROM family_accounts WHERE id = $1', [familyId]);
    const members = await pool.query(
      `SELECT fm.*, u.full_name, u.phone, u.profile_picture, u.rating
       FROM family_members fm
       JOIN users u ON fm.user_id = u.id
       WHERE fm.family_account_id = $1`,
      [familyId]
    );

    res.json({ family: family.rows[0], members: members.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const inviteFamilyMember = async (req, res) => {
  try {
    const ownerId = req.headers['x-user-id'];
    const { phone, monthly_spend_limit, can_see_rides } = req.body;

    // Find family
    const family = await pool.query(
      'SELECT * FROM family_accounts WHERE owner_id = $1 AND is_active = true', [ownerId]
    );
    if (!family.rows[0]) return res.status(404).json({ error: 'No family account found' });

    // Check member count
    const memberCount = await pool.query(
      'SELECT COUNT(*) FROM family_members WHERE family_account_id = $1', [family.rows[0].id]
    );
    if (parseInt(memberCount.rows[0].count) >= family.rows[0].max_members) {
      return res.status(400).json({ error: `Family account is full (max ${family.rows[0].max_members} members)` });
    }

    // Find user by phone
    const invitee = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (!invitee.rows[0]) return res.status(404).json({ error: 'No user found with that phone number' });
    if (invitee.rows[0].id === ownerId) return res.status(400).json({ error: 'Cannot add yourself' });

    // Add member
    await pool.query(
      `INSERT INTO family_members (family_account_id, user_id, role, monthly_spend_limit, can_see_rides)
       VALUES ($1, $2, 'member', $3, $4)
       ON CONFLICT (family_account_id, user_id) DO NOTHING`,
      [family.rows[0].id, invitee.rows[0].id, monthly_spend_limit, can_see_rides || false]
    );
    await pool.query('UPDATE users SET family_account_id = $1 WHERE id = $2', [family.rows[0].id, invitee.rows[0].id]);

    res.json({ success: true, message: 'Member added to family account' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const removeFamilyMember = async (req, res) => {
  try {
    const ownerId = req.headers['x-user-id'];
    const { user_id } = req.params;

    const family = await pool.query('SELECT * FROM family_accounts WHERE owner_id = $1', [ownerId]);
    if (!family.rows[0]) return res.status(403).json({ error: 'Not a family account owner' });

    await pool.query(
      'DELETE FROM family_members WHERE family_account_id = $1 AND user_id = $2',
      [family.rows[0].id, user_id]
    );
    await pool.query('UPDATE users SET family_account_id = NULL WHERE id = $1', [user_id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateFamilyMember = async (req, res) => {
  try {
    const ownerId = req.headers['x-user-id'];
    const { user_id } = req.params;
    const { monthly_spend_limit, can_see_rides } = req.body;

    const family = await pool.query('SELECT * FROM family_accounts WHERE owner_id = $1', [ownerId]);
    if (!family.rows[0]) return res.status(403).json({ error: 'Not a family account owner' });

    await pool.query(
      `UPDATE family_members SET monthly_spend_limit = $1, can_see_rides = $2
       WHERE family_account_id = $3 AND user_id = $4`,
      [monthly_spend_limit, can_see_rides, family.rows[0].id, user_id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// BUSINESS PROFILE
// ============================================================

const getBusinessProfile = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      'SELECT business_profile_active, business_name, corporate_account_id, corporate_role FROM users WHERE id = $1',
      [userId]
    );
    res.json({ business: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const toggleBusinessProfile = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { active, business_name } = req.body;

    await pool.query(
      'UPDATE users SET business_profile_active = $1, business_name = $2 WHERE id = $3',
      [active, business_name, userId]
    );

    res.json({ success: true, business_profile_active: active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// WOMEN+ CONNECT
// ============================================================

const updateGenderPreference = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { gender_preference } = req.body; // 'any' | 'women_nonbinary'

    await pool.query(
      'UPDATE users SET gender_preference = $1 WHERE id = $2',
      [gender_preference, userId]
    );

    res.json({ success: true, gender_preference });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getReferralInfo, applyReferralCode, qualifyReferral,
  createFamilyAccount, getFamilyAccount, inviteFamilyMember,
  removeFamilyMember, updateFamilyMember,
  getBusinessProfile, toggleBusinessProfile,
  updateGenderPreference
};
