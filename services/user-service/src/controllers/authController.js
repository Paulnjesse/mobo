const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { randomInt } = require('crypto');
const db = require('../config/database');
const smsService = require('../services/sms');
const emailService = require('../services/email');
const { encrypt, hashForLookup } = require('../../../shared/fieldEncryption');
const redis = require('../../../shared/redis');

const { signToken, decodeIgnoreExpiry } = require('../../../shared/jwtUtil');
const audit = require('../../../shared/auditLog');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// OTP rate limiting: max 3 requests per phone per hour
const MAX_OTP_REQUESTS_PER_HOUR = 3;
// OTP attempt tracking: lock after 5 wrong attempts
const MAX_OTP_ATTEMPTS = 5;

// Apple JWKS cache — keys rotate rarely; refresh every hour
const appleJwksCache = { keys: null, fetchedAt: 0 };

/**
 * Constant-time OTP comparison — prevents timing attacks where an attacker
 * measures response latency to guess OTP digits one-by-one.
 */
function safeCompareOtp(provided, stored) {
  if (!provided || !stored) return false;
  try {
    const a = Buffer.from(String(provided));
    const b = Buffer.from(String(stored));
    if (a.length !== b.length) return false;
    return require('crypto').timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Generate a 6-digit OTP
 */
function generateOtp() {
  return randomInt(100000, 1000000).toString();
}

/**
 * Check how many OTP sends have happened for this phone in the last hour
 */
async function getOtpSendCount(phone) {
  try {
    const result = await db.query(
      `SELECT COUNT(*) FROM notifications
       WHERE data->>'phone' = $1
         AND type = 'otp_sent'
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      [phone]
    );
    return parseInt(result.rows[0].count || '0', 10);
  } catch (err) {
    logger.warn('[AuthController] OTP rate limit check failed:', err.message);
    return 0;
  }
}

/**
 * Log an OTP send attempt to the notifications table
 */
async function logOtpSend(userId, phone) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, data)
       VALUES ($1, 'OTP Sent', 'Verification OTP was sent', 'otp_sent', $2)`,
      [userId || null, JSON.stringify({ phone })]
    );
  } catch (err) {
    logger.warn('[AuthController] OTP log failed:', err.message);
  }
}

/**
 * Increment OTP attempt counter; lock account after MAX_OTP_ATTEMPTS
 */
async function incrementOtpAttempts(userId) {
  try {
    const result = await db.query(
      `UPDATE users
       SET otp_attempts = COALESCE(otp_attempts, 0) + 1
       WHERE id = $1
       RETURNING otp_attempts`,
      [userId]
    );
    const attempts = result.rows[0]?.otp_attempts || 0;

    if (attempts >= MAX_OTP_ATTEMPTS) {
      await db.query(
        `UPDATE users SET is_suspended = true WHERE id = $1`,
        [userId]
      );
      logger.warn(`[AuthController] Account ${userId} suspended after ${attempts} failed OTP attempts`);
    }

    return attempts;
  } catch (err) {
    logger.warn('[AuthController] OTP attempt increment failed:', err.message);
    return 0;
  }
}

/**
 * Reset OTP attempt counter on successful verification
 */
async function resetOtpAttempts(userId) {
  try {
    await db.query(
      `UPDATE users SET otp_attempts = 0 WHERE id = $1`,
      [userId]
    );
  } catch (err) {
    logger.warn('[AuthController] OTP attempt reset failed:', err.message);
  }
}

// ============================================================
// CONTROLLER FUNCTIONS
// ============================================================

/**
 * POST /auth/signup
 * Accepts role: 'rider' | 'driver' | 'fleet_owner'
 * Common fields: full_name, phone, email, password, country, city, language
 * Driver extra: license_number, license_expiry, vehicle_make, vehicle_model,
 *               vehicle_year, vehicle_plate, vehicle_color, vehicle_type
 * Fleet owner extra: company_name (fleet name)
 */
const signup = async (req, res) => {
  try {
    const {
      full_name, phone, email, password,
      role = 'rider', country = 'Cameroon',
      country_code: rawCountryCode,           // ISO alpha-2 preferred; derived from country if absent
      city, language = 'fr', date_of_birth, gender,
      // Driver-specific
      license_number, license_expiry,
      vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_type,
      // Fleet owner-specific
      company_name,
    } = req.body;

    // Resolve country_code — accept explicit ISO code or derive from full name
    const { resolveCountryCode } = require('../../../shared/currencyUtil');
    const country_code = resolveCountryCode(rawCountryCode || country);

    // 1. Validate required common fields
    if (!full_name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'full_name, phone, and password are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    const validRoles = ['rider', 'driver', 'fleet_owner'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be rider, driver, or fleet_owner' });
    }

    // Validate driver-specific required fields
    if (role === 'driver') {
      if (!license_number || !license_expiry) {
        return res.status(400).json({
          success: false,
          message: 'Driver registration requires: license_number, license_expiry'
        });
      }
    }

    // Validate fleet owner required fields
    if (role === 'fleet_owner') {
      if (!company_name) {
        return res.status(400).json({
          success: false,
          message: 'Fleet owner registration requires: company_name'
        });
      }
    }

    // 2. Check phone uniqueness
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

    // OTP rate limit check
    const recentSends = await getOtpSendCount(phone);
    if (recentSends >= MAX_OTP_REQUESTS_PER_HOUR) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please wait an hour before trying again.'
      });
    }

    // 3. Hash password — 12 rounds meets OWASP minimum for bcrypt in production
    const password_hash = await bcrypt.hash(password, 12);
    const otp_code = generateOtp();
    const otp_expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const id = uuidv4();

    // Determine registration_step based on role
    const registration_step = role === 'fleet_owner' ? 'add_vehicles' : 'complete';
    const registration_completed = role === 'fleet_owner' ? false : true;

    // 4. Create user record with role
    const result = await db.query(
      `INSERT INTO users (
        id, full_name, phone, email, password_hash, role,
        country, country_code, city, language, date_of_birth, gender,
        otp_code, otp_expiry, is_verified, loyalty_points, otp_attempts,
        registration_step, registration_completed
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,50,0,$15,$16)
      RETURNING id, full_name, phone, email, role, country, country_code, city, language,
                is_verified, loyalty_points, registration_step, registration_completed, created_at`,
      [id, full_name, phone, email || null, password_hash, role,
       country, country_code, city || null, language, date_of_birth || null, gender || null,
       otp_code, otp_expiry, registration_step, registration_completed]
    );

    const user = result.rows[0];

    // 5. Store field-level encrypted PII (non-blocking — don't fail signup on encryption error)
    try {
      const encUpdates = [
        db.query(
          `UPDATE users SET phone_encrypted=$1, phone_hash=$2 WHERE id=$3`,
          [encrypt(phone), hashForLookup(phone), id]
        ),
      ];
      if (date_of_birth) {
        encUpdates.push(db.query(
          `UPDATE users SET dob_encrypted=$1 WHERE id=$2`,
          [encrypt(date_of_birth), id]
        ));
      }
      await Promise.all(encUpdates);
    } catch (encErr) {
      logger.error('[signup] Field encryption failed (non-fatal):', encErr.message);
    }

    // 8. Award signup loyalty points transaction
    await db.query(
      `INSERT INTO loyalty_transactions (user_id, points, action, description)
       VALUES ($1, 50, 'signup_bonus', 'Welcome to MOBO — 50 bonus points!')`,
      [id]
    );

    let roleData = null;

    // 5. If driver: create drivers record (is_approved=false)
    if (role === 'driver' && license_number && license_expiry) {
      try {
        const driverResult = await db.query(
          `INSERT INTO drivers (user_id, license_number, license_expiry, is_approved, is_online)
           VALUES ($1, $2, $3, false, false)
           RETURNING id, license_number, license_expiry, is_approved`,
          [id, license_number, license_expiry]
        );
        const driverRecord = driverResult.rows[0];

        // Create vehicle if vehicle details provided
        if (vehicle_make && vehicle_model && vehicle_year && vehicle_plate) {
          try {
            const vehicleResult = await db.query(
              `INSERT INTO vehicles (driver_id, make, model, year, plate, color, vehicle_type, seats, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 4, true)
               RETURNING id, make, model, year, plate, color, vehicle_type`,
              [driverRecord.id, vehicle_make, vehicle_model,
               parseInt(vehicle_year, 10), vehicle_plate.toUpperCase(),
               vehicle_color || null, vehicle_type || 'standard']
            );
            const vehicle = vehicleResult.rows[0];

            // Link vehicle to driver
            await db.query(
              `UPDATE drivers SET vehicle_id = $1 WHERE id = $2`,
              [vehicle.id, driverRecord.id]
            );

            roleData = { driver: { ...driverRecord, vehicle } };
          } catch (vErr) {
            logger.warn('[Signup] Vehicle creation failed (plate may be duplicate):', vErr.message);
            roleData = { driver: driverRecord };
          }
        } else {
          roleData = { driver: driverRecord };
        }
      } catch (dErr) {
        logger.warn('[Signup] Driver record creation failed:', dErr.message);
      }
    }

    // 6. If fleet_owner: create first fleet record
    if (role === 'fleet_owner') {
      try {
        const fleetResult = await db.query(
          `INSERT INTO fleets (owner_id, name, city, country, fleet_number, is_active, is_approved)
           VALUES ($1, $2, $3, $4, 1, false, false)
           RETURNING id, name, fleet_number, is_active, is_approved`,
          [id, company_name, city || null, country]
        );
        roleData = { fleet: fleetResult.rows[0] };
      } catch (fErr) {
        logger.warn('[Signup] Fleet creation failed:', fErr.message);
      }
    }

    // 7. Generate OTP, send SMS
    const smsResult = await smsService.sendOTP(phone, otp_code, language);

    // Send email OTP as backup if email is provided
    let emailResult = null;
    if (email) {
      emailResult = await emailService.sendVerificationEmail(email, otp_code, full_name, language);
    }

    // Log the OTP send attempt
    await logOtpSend(id, phone);

    // 9. Return user + role-specific data
    res.status(201).json({
      success: true,
      message: 'Account created! Please verify your phone number with the OTP sent.',
      data: {
        user,
        ...roleData,
        otp_sent: true,
        sms_sent: smsResult.success,
        email_sent: emailResult ? emailResult.success : false,
        note: process.env.NODE_ENV === 'test' ? `TEST OTP: ${otp_code}` : undefined
      }
    });
  } catch (err) {
    logger.error('[Signup Error]', err);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
};

/**
 * POST /auth/register-driver
 * Called after OTP verification for drivers to complete their profile.
 * Creates driver record + vehicle record and links to user account.
 * Sets registration_step = 'complete'.
 */
const registerDriver = async (req, res) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      license_number, license_expiry, license_doc_url,
      national_id, national_id_doc_url,
      vehicle_make, vehicle_model, vehicle_year, vehicle_plate,
      vehicle_color, vehicle_type, seats, is_wheelchair_accessible,
      insurance_doc_url, insurance_expiry, photos,
      home_latitude, home_longitude, home_address
    } = req.body;

    if (!license_number || !license_expiry) {
      return res.status(400).json({
        success: false,
        message: 'license_number and license_expiry are required'
      });
    }

    // Check user exists and is a driver
    const userResult = await db.query(
      'SELECT id, role FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];
    if (user.role !== 'driver') {
      return res.status(400).json({ success: false, message: 'User is not registered as a driver' });
    }

    // Check if driver record already exists
    const existingDriver = await db.query(
      'SELECT id FROM drivers WHERE user_id = $1',
      [userId]
    );

    // Build home_location geometry if coords provided
    const hasHome = home_latitude != null && home_longitude != null;
    // Parse once; used as bound parameters — never interpolated into SQL
    const homeLat = hasHome ? parseFloat(home_latitude) : null;
    const homeLon = hasHome ? parseFloat(home_longitude) : null;

    let driverRecord;
    if (existingDriver.rows.length > 0) {
      // Update existing driver record
      // When hasHome: $7=home_address, $8=homeLon, $9=homeLat (PostGIS MakePoint takes lon,lat)
      const updateResult = await db.query(
        `UPDATE drivers SET
           license_number = $1, license_expiry = $2, license_doc_url = $3,
           national_id = $4, national_id_doc_url = $5
           ${hasHome ? ', home_latitude = $9, home_longitude = $8, home_address = $7, home_location = ST_SetSRID(ST_MakePoint($8, $9), 4326)' : ''}
         WHERE user_id = $6
         RETURNING id, license_number, license_expiry, is_approved, home_latitude, home_longitude, home_address`,
        hasHome
          ? [license_number, license_expiry, license_doc_url || null, national_id || null, national_id_doc_url || null, userId, home_address || null, homeLon, homeLat]
          : [license_number, license_expiry, license_doc_url || null, national_id || null, national_id_doc_url || null, userId]
      );
      driverRecord = updateResult.rows[0];
    } else {
      // Create new driver record
      // When hasHome: $7=home_address, $8=homeLon, $9=homeLat (PostGIS MakePoint takes lon,lat)
      const driverResult = await db.query(
        `INSERT INTO drivers (user_id, license_number, license_expiry, license_doc_url, national_id, national_id_doc_url, is_approved, is_online
           ${hasHome ? ', home_latitude, home_longitude, home_address, home_location' : ''})
         VALUES ($1, $2, $3, $4, $5, $6, false, false
           ${hasHome ? ', $9, $8, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)' : ''})
         RETURNING id, license_number, license_expiry, is_approved, home_latitude, home_longitude, home_address`,
        hasHome
          ? [userId, license_number, license_expiry, license_doc_url || null, national_id || null, national_id_doc_url || null, home_address || null, homeLon, homeLat]
          : [userId, license_number, license_expiry, license_doc_url || null, national_id || null, national_id_doc_url || null]
      );
      driverRecord = driverResult.rows[0];
    }

    let vehicle = null;
    if (vehicle_make && vehicle_model && vehicle_year && vehicle_plate) {
      try {
        const vehicleResult = await db.query(
          `INSERT INTO vehicles (driver_id, make, model, year, plate, color, vehicle_type, seats, is_wheelchair_accessible, insurance_doc_url, insurance_expiry, photos, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
           ON CONFLICT (plate) DO UPDATE SET
             make = EXCLUDED.make, model = EXCLUDED.model, year = EXCLUDED.year,
             color = EXCLUDED.color, vehicle_type = EXCLUDED.vehicle_type, seats = EXCLUDED.seats
           RETURNING id, make, model, year, plate, color, vehicle_type, seats`,
          [driverRecord.id, vehicle_make, vehicle_model,
           parseInt(vehicle_year, 10), vehicle_plate.toUpperCase(),
           vehicle_color || null, vehicle_type || 'standard',
           seats || 4, is_wheelchair_accessible || false,
           insurance_doc_url || null, insurance_expiry || null,
           JSON.stringify(photos || [])]
        );
        vehicle = vehicleResult.rows[0];

        await db.query(
          `UPDATE drivers SET vehicle_id = $1 WHERE id = $2`,
          [vehicle.id, driverRecord.id]
        );
      } catch (vErr) {
        logger.warn('[RegisterDriver] Vehicle creation failed:', vErr.message);
      }
    }

    // Mark registration as complete
    await db.query(
      `UPDATE users SET registration_step = 'complete', registration_completed = true WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Driver profile completed. Your application will be reviewed within 24 hours.',
      data: {
        driver: { ...driverRecord, vehicle }
      }
    });
  } catch (err) {
    logger.error('[RegisterDriver Error]', err);
    res.status(500).json({ success: false, message: 'Failed to complete driver registration' });
  }
};

/**
 * POST /auth/register-fleet-owner
 * Called after OTP verification for fleet owners.
 * Creates fleet record and sets registration_step = 'add_vehicles'.
 * Returns fleet_id for vehicle addition step.
 */
const registerFleetOwner = async (req, res) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      company_name, description, city, country = 'Cameroon',
      business_reg_number
    } = req.body;

    if (!company_name) {
      return res.status(400).json({ success: false, message: 'company_name is required' });
    }

    // Check user exists and is a fleet_owner
    const userResult = await db.query(
      'SELECT id, role, city, country FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];
    if (user.role !== 'fleet_owner') {
      return res.status(400).json({ success: false, message: 'User is not registered as a fleet owner' });
    }

    // Check if fleet already exists for this owner
    const existingFleet = await db.query(
      'SELECT id, fleet_number FROM fleets WHERE owner_id = $1 ORDER BY fleet_number ASC',
      [userId]
    );

    let fleet;
    if (existingFleet.rows.length > 0) {
      // Return existing first fleet
      const fleetDetail = await db.query(
        `SELECT f.*, (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id) as vehicle_count
         FROM fleets f WHERE f.id = $1`,
        [existingFleet.rows[0].id]
      );
      fleet = fleetDetail.rows[0];
    } else {
      // Create first fleet record
      const fleetResult = await db.query(
        `INSERT INTO fleets (owner_id, name, description, city, country, fleet_number, is_active, is_approved)
         VALUES ($1, $2, $3, $4, $5, 1, false, false)
         RETURNING id, name, description, city, country, fleet_number, is_active, is_approved, created_at`,
        [userId, company_name, description || null, city || user.city || null, country]
      );
      fleet = { ...fleetResult.rows[0], vehicle_count: 0 };
    }

    // Update registration step
    await db.query(
      `UPDATE users SET registration_step = 'add_vehicles', registration_completed = false WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Fleet account created! Now add your first fleet of 5-15 vehicles.',
      data: {
        fleet,
        next_step: 'add_vehicles',
        min_vehicles: 5,
        max_vehicles: 15
      }
    });
  } catch (err) {
    logger.error('[RegisterFleetOwner Error]', err);
    res.status(500).json({ success: false, message: 'Failed to complete fleet owner registration' });
  }
};

/**
 * POST /auth/login
 */
const login = async (req, res) => {
  try {
    const { identifier, phone: rawPhone, email: rawEmail, password } = req.body;
    // Accept `identifier` (phone or email) as well as separate `phone`/`email` fields
    const phone = rawPhone || (!rawEmail && identifier && !identifier.includes('@') ? identifier : undefined);
    const email = rawEmail || (identifier && identifier.includes('@') ? identifier : undefined);

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

    if (!user.is_verified) {
      return res.status(401).json({
        success: false,
        message: 'Account not verified. Please verify your phone number first.'
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await audit.log(db, { actor_id: user.id, actor_role: user.role, action: 'auth.login.fail',
        resource_type: 'user', resource_id: user.id, ip: req.ip,
        user_agent: req.headers['user-agent'], outcome: 'failure', detail: { reason: 'bad_password' } });
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

    // Get fleet info if fleet_owner
    let fleetInfo = null;
    if (user.role === 'fleet_owner') {
      const fleetResult = await db.query(
        `SELECT f.*, (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id) as vehicle_count
         FROM fleets f WHERE f.owner_id = $1 ORDER BY f.fleet_number ASC`,
        [user.id]
      );
      fleetInfo = fleetResult.rows;
    }

    // Bind token to device if the client supplies one
    const deviceId = req.headers['x-device-id'] || req.body.device_id || null;
    const tokenPayload = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      country_code: user.country_code || 'CM',  // ISO alpha-2 — drives currency in all downstream services
      ...(deviceId ? { device_id: deviceId } : {}),
    };

    // 2FA enforcement:
    //   - Admin accounts: 2FA is MANDATORY. If not yet configured, login is blocked.
    //   - Non-admin accounts: 2FA is optional; only required if totp_enabled.
    const freshUser = await db.query('SELECT totp_enabled FROM users WHERE id = $1', [user.id]);
    const totpEnabled = freshUser.rows[0]?.totp_enabled;

    if (user.role === 'admin' && !totpEnabled) {
      // Admin account exists but 2FA not set up — hard block.
      // Admin must set up 2FA via /auth/2fa/setup before they can log in.
      return res.status(403).json({
        success: false,
        requires_2fa_setup: true,
        message: 'Admin accounts require Two-Factor Authentication. ' +
                 'Please set up 2FA via your account settings before logging in.',
      });
    }

    if (totpEnabled) {
      // Return pre-auth challenge — JWT is issued by validate2FA after TOTP verified
      return res.json({
        success: true,
        requires_2fa: true,
        user_id: user.id,
        message: 'Enter your 6-digit authenticator code to continue',
      });
    }

    const token = signToken(tokenPayload, { expiresIn: JWT_EXPIRES_IN });

    await audit.log(db, { actor_id: user.id, actor_role: user.role, action: 'auth.login',
      resource_type: 'user', resource_id: user.id, ip: req.ip,
      user_agent: req.headers['user-agent'], outcome: 'success' });

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
          profile_picture: user.profile_picture,
          registration_step: user.registration_step,
          registration_completed: user.registration_completed
        },
        driver: driverInfo,
        fleets: fleetInfo
      }
    });
  } catch (err) {
    logger.error('[Login Error]', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

/**
 * POST /auth/verify
 * Verifies the OTP code.
 * Tracks attempts; locks account after MAX_OTP_ATTEMPTS wrong attempts.
 */
const verify = async (req, res) => {
  try {
    const { phone: rawPhone, identifier, otp_code } = req.body;
    const phone = rawPhone || identifier;

    if (!phone || !otp_code) {
      return res.status(400).json({ success: false, message: 'phone and otp_code are required' });
    }

    const result = await db.query(
      `SELECT id, otp_code, otp_expiry, is_verified, is_suspended, language, full_name, email,
              phone, otp_attempts, role, registration_step
       FROM users WHERE phone = $1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.json({ success: true, message: 'Account already verified', role: user.role });
    }

    if (user.is_suspended) {
      return res.status(403).json({
        success: false,
        message: 'Account suspended due to too many failed OTP attempts. Contact support.'
      });
    }

    if (!user.otp_code || !safeCompareOtp(otp_code, user.otp_code)) {
      const attempts = await incrementOtpAttempts(user.id);
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - attempts);
      return res.status(400).json({
        success: false,
        message: `Invalid OTP code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
      });
    }

    if (new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    await db.query(
      `UPDATE users SET is_verified = true, otp_code = NULL, otp_expiry = NULL, otp_attempts = 0
       WHERE id = $1`,
      [user.id]
    );

    await resetOtpAttempts(user.id);

    // Send welcome email if available
    if (user.email) {
      emailService
        .sendWelcomeEmail(user.email, user.full_name, user.language || 'en')
        .catch((err) => logger.warn('[AuthController] Welcome email failed:', err.message));
    }

    // Issue JWT so the user is immediately logged in after verification
    const tokenPayload = { id: user.id, phone: user.phone || phone, role: user.role, full_name: user.full_name };
    const token = signToken(tokenPayload, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      message: 'Phone verified successfully. Welcome to MOBO!',
      data: { token },
      role: user.role,
      registration_step: user.registration_step
    });
  } catch (err) {
    logger.error('[Verify Error]', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

/**
 * POST /auth/resend-otp
 * Rate limited: max 3 OTP requests per phone per hour.
 */
const resendOtp = async (req, res) => {
  try {
    const { phone: rawPhone, identifier } = req.body;
    const phone = rawPhone || identifier;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }

    const result = await db.query(
      'SELECT id, is_verified, language, full_name, email FROM users WHERE phone = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.json({ success: true, message: 'Account already verified' });
    }

    const recentSends = await getOtpSendCount(phone);
    if (recentSends >= MAX_OTP_REQUESTS_PER_HOUR) {
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. You can request at most ${MAX_OTP_REQUESTS_PER_HOUR} OTPs per hour. Please try again later.`
      });
    }

    const otp_code = generateOtp();
    const otp_expiry = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'UPDATE users SET otp_code = $1, otp_expiry = $2, otp_attempts = 0 WHERE id = $3',
      [otp_code, otp_expiry, user.id]
    );

    const userLanguage = user.language || 'en';
    const smsResult = await smsService.sendOTP(phone, otp_code, userLanguage);

    let emailResult = null;
    if (user.email) {
      emailResult = await emailService.sendVerificationEmail(
        user.email, otp_code, user.full_name, userLanguage
      );
    }

    await logOtpSend(user.id, phone);

    res.json({
      success: true,
      message: 'New OTP sent',
      sms_sent: smsResult.success,
      email_sent: emailResult ? emailResult.success : false,
      note: process.env.NODE_ENV === 'test' ? `TEST OTP: ${otp_code}` : undefined
    });
  } catch (err) {
    logger.error('[ResendOtp Error]', err);
    res.status(500).json({ success: false, message: 'Failed to resend OTP' });
  }
};

/**
 * POST /auth/logout
 * JWT is stateless; client drops the token.
 */
const logout = async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully. See you soon on MOBO!' });
};

/**
 * POST /auth/refresh-token
 */
const refreshToken = async (req, res) => {
  try {
    // Accept token from Authorization header OR from request body { refreshToken }
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.body?.refreshToken) {
      token = req.body.refreshToken;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = decodeIgnoreExpiry(token);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

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

    const newToken = signToken(
      { id: user.id, phone: user.phone, email: user.email, role: user.role, full_name: user.full_name },
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return token at both levels for compatibility: response.data.token AND response.data.data.token
    res.json({ success: true, token: newToken, data: { token: newToken } });
  } catch (err) {
    logger.error('[RefreshToken Error]', err);
    res.status(500).json({ success: false, message: 'Token refresh failed' });
  }
};

/**
 * POST /auth/driver/home-location
 * Set or update a driver's home location (GPS coordinates + reverse-geocoded address).
 * Called from the post-registration onboarding screen — optional, can be skipped.
 */
const setHomeLocation = async (req, res) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { latitude, longitude, address } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    const result = await db.query(
      `UPDATE drivers
       SET home_latitude  = $1,
           home_longitude = $2,
           home_address   = $3,
           home_location  = ST_SetSRID(ST_MakePoint($2, $1), 4326)
       WHERE user_id = $4
       RETURNING id, home_latitude, home_longitude, home_address`,
      [lat, lng, address || null, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }

    res.json({
      success: true,
      message: 'Home location saved',
      data: result.rows[0]
    });
  } catch (err) {
    logger.error('[SetHomeLocation Error]', err);
    res.status(500).json({ success: false, message: 'Failed to save home location' });
  }
};

// ── Password-reset OTP constants ─────────────────────────────────────────────
const MAX_RESET_ATTEMPTS = 5;

/**
 * POST /auth/forgot-password
 * Accepts { identifier } — either an email address or phone number.
 * Generates a 6-digit OTP, stores it in reset_otp / reset_otp_expiry,
 * and sends it via email (and SMS when the identifier is a phone number).
 */
const forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required',
      });
    }

    const id = identifier.trim();
    const isEmail = id.includes('@');

    // Look up user by email or phone
    const query  = isEmail ? 'SELECT * FROM users WHERE email = $1' : 'SELECT * FROM users WHERE phone = $1';
    const result = await db.query(query, [id]);

    // Always return a success-looking response to prevent user enumeration
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: isEmail
          ? 'If that email is registered, a reset code has been sent.'
          : 'If that phone number is registered, a reset code has been sent.',
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is inactive.' });
    }

    const reset_otp    = generateOtp();
    const reset_expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.query(
      `UPDATE users
       SET reset_otp = $1, reset_otp_expiry = $2, reset_otp_attempts = 0
       WHERE id = $3`,
      [reset_otp, reset_expiry, user.id]
    );

    let emailSent = false;
    let smsSent   = false;

    // Send email OTP if user has an email address
    if (user.email) {
      const emailRes = await emailService.sendPasswordResetOtp(
        user.email, reset_otp, user.full_name, user.language || 'en'
      );
      emailSent = emailRes.success;
    }

    // Send SMS OTP if the identifier was a phone number (or always if phone exists)
    if (user.phone) {
      const smsRes = await smsService.sendOTP(user.phone, reset_otp, user.language || 'en');
      smsSent = smsRes.success;
    }

    const channel = emailSent && smsSent
      ? 'email and SMS'
      : emailSent
      ? 'email'
      : smsSent
      ? 'SMS'
      : 'registered contact';

    return res.json({
      success: true,
      message: `A 6-digit reset code has been sent to your ${channel}. It expires in 10 minutes.`,
      email_sent: emailSent,
      sms_sent:   smsSent,
      // Only expose OTP in test mode (never development/staging/production)
      note: process.env.NODE_ENV === 'test' ? `TEST OTP: ${reset_otp}` : undefined,
    });
  } catch (err) {
    logger.error('[ForgotPassword Error]', err);
    res.status(500).json({ success: false, message: 'Failed to send reset code' });
  }
};

/**
 * POST /auth/reset-password
 * Accepts { identifier, otp_code, new_password }.
 * Validates the OTP, then updates the password hash.
 */
const resetPassword = async (req, res) => {
  try {
    const { identifier, otp_code, new_password } = req.body;

    if (!identifier || !otp_code || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'identifier, otp_code, and new_password are required',
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters',
      });
    }

    const id      = identifier.trim();
    const isEmail = id.includes('@');
    const query   = isEmail
      ? 'SELECT * FROM users WHERE email = $1'
      : 'SELECT * FROM users WHERE phone = $1';

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const user = result.rows[0];

    if (!user.reset_otp) {
      return res.status(400).json({
        success: false,
        message: 'No reset code was requested. Please request a new one.',
      });
    }

    // Lock after too many wrong attempts
    if ((user.reset_otp_attempts || 0) >= MAX_RESET_ATTEMPTS) {
      // Clear the OTP so the user must request a new one
      await db.query(
        'UPDATE users SET reset_otp = NULL, reset_otp_expiry = NULL, reset_otp_attempts = 0 WHERE id = $1',
        [user.id]
      );
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new reset code.',
      });
    }

    if (!safeCompareOtp(otp_code, user.reset_otp)) {
      await db.query(
        'UPDATE users SET reset_otp_attempts = COALESCE(reset_otp_attempts, 0) + 1 WHERE id = $1',
        [user.id]
      );
      const remaining = Math.max(0, MAX_RESET_ATTEMPTS - (user.reset_otp_attempts + 1));
      return res.status(400).json({
        success: false,
        message: `Invalid reset code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      });
    }

    if (new Date() > new Date(user.reset_otp_expiry)) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired. Please request a new one.',
      });
    }

    // All good — update password and clear reset OTP
    const password_hash = await bcrypt.hash(new_password, 12);

    await db.query(
      `UPDATE users
       SET password_hash = $1,
           reset_otp = NULL, reset_otp_expiry = NULL, reset_otp_attempts = 0
       WHERE id = $2`,
      [password_hash, user.id]
    );

    // Send confirmation email (fire-and-forget)
    if (user.email) {
      emailService
        .sendPasswordChangedEmail(user.email, user.full_name, user.language || 'en')
        .catch((err) => logger.warn('[ResetPassword] Confirmation email failed:', err.message));
    }

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (err) {
    logger.error('[ResetPassword Error]', err);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

/**
 * POST /auth/social
 * Social sign-in / sign-up via Google or Apple.
 * Body: { provider: 'google'|'apple', token, email?, name?, role? }
 *
 * Flow:
 *  1. Verify the ID token with the provider's token-info endpoint
 *  2. Find existing user by provider_id OR email
 *  3. If none exists, create account automatically (rider by default)
 *  4. Return JWT — no OTP required for social login
 */
const socialLogin = async (req, res) => {
  try {
    const { provider, token: providerToken, email: bodyEmail, name: bodyName, role = 'rider' } = req.body;

    if (!provider || !providerToken) {
      return res.status(400).json({ success: false, message: 'provider and token are required' });
    }
    if (!['google', 'apple', 'facebook'].includes(provider)) {
      return res.status(400).json({ success: false, message: 'provider must be google, apple, or facebook' });
    }

    // ── Token replay protection ───────────────────────────────────────────────
    // Hash the provider token so we never store the raw credential in Redis.
    // TTL = 10 minutes (generous window for network delays; tokens expire sooner).
    // If the same token is submitted twice within the window, reject it.
    try {
      const tokenHash = crypto.createHash('sha256').update(`${provider}:${providerToken}`).digest('hex');
      const replayKey = `social_token_used:${tokenHash}`;
      const redisClient = redis.getClient ? redis.getClient() : redis;
      if (redisClient && typeof redisClient.set === 'function') {
        const alreadyUsed = await redisClient.set(replayKey, '1', { NX: true, EX: 600 });
        if (alreadyUsed === null) {
          // NX returned null → key already existed → token was already used
          return res.status(401).json({ success: false, message: 'Token has already been used. Please sign in again.' });
        }
      }
    } catch (replayErr) {
      // Non-fatal: Redis unavailable → skip replay check but log it
      const logger = require('../../../shared/logger');
      logger.warn({ err: replayErr }, '[SocialLogin] Redis replay check failed — proceeding without it');
    }

    let providerId = null;
    let verifiedEmail = bodyEmail || null;
    let verifiedName  = bodyName  || null;

    // ── Verify token with provider ──────────────────────────────────────────
    if (provider === 'google') {
      try {
        const { data } = await require('axios').get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${providerToken}`,
          { timeout: 10000 }
        );
        // Verify audience matches our client ID(s)
        const googleClientIds = [
          process.env.GOOGLE_CLIENT_ID_IOS,
          process.env.GOOGLE_CLIENT_ID_ANDROID,
          process.env.GOOGLE_CLIENT_ID_WEB,
        ].filter(Boolean);

        if (googleClientIds.length > 0 && !googleClientIds.includes(data.aud)) {
          return res.status(401).json({ success: false, message: 'Invalid Google token audience' });
        }

        providerId     = data.sub;
        verifiedEmail  = data.email || verifiedEmail;
        verifiedName   = data.name  || verifiedName;
      } catch (gErr) {
        logger.error('[SocialLogin] Google token verify failed:', gErr.message);
        return res.status(401).json({ success: false, message: 'Google token verification failed' });
      }
    } else if (provider === 'facebook') {
      // Facebook access tokens verified via Graph API
      try {
        const { data } = await require('axios').get(
          `https://graph.facebook.com/me?fields=id,name,email&access_token=${providerToken}`,
          { timeout: 10000 }
        );
        if (!data.id) throw new Error('No user ID returned from Facebook');

        const fbAppId = process.env.FACEBOOK_APP_ID;
        if (fbAppId) {
          // Optionally verify token belongs to our app via debug_token endpoint
          const { data: debug } = await require('axios').get(
            `https://graph.facebook.com/debug_token?input_token=${providerToken}&access_token=${fbAppId}|${process.env.FACEBOOK_APP_SECRET}`,
            { timeout: 10000 }
          ).catch(() => ({ data: { data: { is_valid: true } } })); // non-fatal if debug fails
          if (debug?.data?.is_valid === false) {
            return res.status(401).json({ success: false, message: 'Invalid Facebook token' });
          }
        }

        providerId    = data.id;
        verifiedEmail = data.email || verifiedEmail;
        verifiedName  = data.name  || verifiedName;
      } catch (fbErr) {
        logger.error('[SocialLogin] Facebook token verify failed:', fbErr.message);
        return res.status(401).json({ success: false, message: 'Facebook token verification failed' });
      }
    } else if (provider === 'apple') {
      // Verify Apple ID token signature against Apple's published JWKS
      try {
        const { createPublicKey } = require('crypto');
        const appleAxios = require('axios');

        const parts = providerToken.split('.');
        if (parts.length !== 3) throw new Error('Invalid Apple JWT format');

        // Decode header to get the key ID (kid) used for signing
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
        if (!header.kid) throw new Error('Apple JWT missing kid header');

        // Fetch Apple's public keys (cached at module level; TTL 1 h)
        const now = Date.now();
        if (!appleJwksCache.keys || now - appleJwksCache.fetchedAt > 3600000) {
          const { data } = await appleAxios.get('https://appleid.apple.com/auth/keys', { timeout: 10000 });
          appleJwksCache.keys = data.keys;
          appleJwksCache.fetchedAt = now;
        }

        const jwk = appleJwksCache.keys.find(k => k.kid === header.kid);
        if (!jwk) throw new Error(`Apple signing key ${header.kid} not found in JWKS`);

        // Convert JWK → KeyObject using Node.js built-in crypto (Node 15+)
        const publicKey = createPublicKey({ key: jwk, format: 'jwk' });

        // Verify signature, expiry, and issuer using jsonwebtoken
        const appleAud = process.env.APPLE_APP_BUNDLE_ID;
        const verifyOpts = {
          algorithms: ['RS256'],
          issuer: 'https://appleid.apple.com',
          ...(appleAud ? { audience: appleAud } : {}),
        };
        const payload = jwt.verify(providerToken, publicKey, verifyOpts);

        providerId    = payload.sub;
        verifiedEmail = payload.email || verifiedEmail;
        // Apple doesn't always include name in token; caller passes it from the first-time consent
      } catch (aErr) {
        logger.error('[SocialLogin] Apple token verification failed:', aErr.message);
        return res.status(401).json({ success: false, message: 'Apple token verification failed' });
      }
    }

    if (!providerId) {
      return res.status(401).json({ success: false, message: 'Could not extract identity from provider token' });
    }

    // ── Find or create user ─────────────────────────────────────────────────
    let user = null;

    // 1. Look up by social account record
    const socialRow = await db.query(
      'SELECT user_id FROM user_social_accounts WHERE provider = $1 AND provider_id = $2',
      [provider, providerId]
    );
    if (socialRow.rows.length > 0) {
      const userRow = await db.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [socialRow.rows[0].user_id]
      );
      user = userRow.rows[0] || null;
    }

    // 2. Look up by email if social record not found
    if (!user && verifiedEmail) {
      const emailRow = await db.query(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [verifiedEmail]
      );
      user = emailRow.rows[0] || null;
    }

    // 3. Create new account
    if (!user) {
      const id       = uuidv4();
      const fullName = verifiedName || (verifiedEmail ? verifiedEmail.split('@')[0] : 'MOBO User');

      const newUserResult = await db.query(
        `INSERT INTO users (
           id, full_name, email, role, country, language,
           is_verified, is_active, loyalty_points, otp_attempts,
           registration_step, registration_completed
         ) VALUES ($1,$2,$3,$4,'Cameroon','fr',true,true,50,0,'complete',true)
         RETURNING *`,
        [id, fullName, verifiedEmail || null, role]
      );
      user = newUserResult.rows[0];

      // Signup loyalty points
      await db.query(
        `INSERT INTO loyalty_transactions (user_id, points, action, description)
         VALUES ($1, 50, 'signup_bonus', 'Welcome to MOBO — 50 bonus points!')`,
        [id]
      ).catch(() => {});
    }

    if (user.is_suspended) {
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Contact support.' });
    }

    // Upsert social account link
    await db.query(
      `INSERT INTO user_social_accounts (user_id, provider, provider_id, email, name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
      [user.id, provider, providerId, verifiedEmail, verifiedName]
    ).catch(() => {});

    // Update google_id / apple_id shortcut columns
    const idColumn = provider === 'google' ? 'google_id' : 'apple_id';
    await db.query(
      `UPDATE users SET ${idColumn} = $1 WHERE id = $2`,
      [providerId, user.id]
    ).catch(() => {});

    // Issue JWT
    const tokenPayload = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      country_code: user.country_code || 'CM',
    };
    const jwtToken = signToken(tokenPayload, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      message: 'Social login successful',
      token: jwtToken,
      data: {
        token: jwtToken,
        user: {
          id:                   user.id,
          full_name:            user.full_name,
          email:                user.email,
          phone:                user.phone,
          role:                 user.role,
          country:              user.country,
          is_verified:          user.is_verified,
          loyalty_points:       user.loyalty_points,
          registration_step:    user.registration_step,
          registration_completed: user.registration_completed,
        },
      },
    });
  } catch (err) {
    logger.error('[SocialLogin Error]', err);
    res.status(500).json({ success: false, message: 'Social login failed' });
  }
};

module.exports = { signup, login, verify, resendOtp, logout, refreshToken, registerDriver, registerFleetOwner, setHomeLocation, forgotPassword, resetPassword, socialLogin };
