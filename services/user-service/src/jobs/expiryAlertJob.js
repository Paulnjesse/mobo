/**
 * expiryAlertJob.js
 * Runs daily at 09:00 (Africa/Douala = UTC+1, so 08:00 UTC).
 * Finds drivers with license or insurance expiring in 30, 7, or 1 day.
 * Sends push notification via Expo Push API.
 */

const ALERT_DAYS = [30, 7, 1];

async function checkExpiryAlerts(db) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const days of ALERT_DAYS) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + days);
    const targetStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // License expiry
    const licenseResult = await db.query(
      `SELECT u.id, u.full_name, u.expo_push_token,
              d.license_expiry, d.license_number
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE DATE(d.license_expiry) = $1
         AND u.is_active = true
         AND u.expo_push_token IS NOT NULL`,
      [targetStr]
    );

    for (const driver of licenseResult.rows) {
      await sendExpoNotification(
        driver.expo_push_token,
        days === 1 ? '⚠️ License Expires TOMORROW' : `⚠️ License Expires in ${days} Days`,
        `Your driver's license (${driver.license_number}) expires on ${new Date(driver.license_expiry).toLocaleDateString()}. Renew now to keep driving.`,
        { type: 'license_expiry', days_remaining: days }
      );

      // Log in notifications table
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'doc_expiry', $2, $3, $4)`,
        [
          driver.id,
          `License expires in ${days} day${days === 1 ? '' : 's'}`,
          `Your driver's license expires on ${new Date(driver.license_expiry).toLocaleDateString()}. Please renew it.`,
          JSON.stringify({ doc_type: 'license', days_remaining: days, expiry: driver.license_expiry })
        ]
      );
    }

    // Insurance expiry
    const insuranceResult = await db.query(
      `SELECT u.id, u.full_name, u.expo_push_token,
              v.insurance_expiry, v.plate
       FROM vehicles v
       JOIN drivers d ON d.id = v.driver_id
       JOIN users u ON u.id = d.user_id
       WHERE DATE(v.insurance_expiry) = $1
         AND v.is_active = true
         AND u.is_active = true
         AND u.expo_push_token IS NOT NULL`,
      [targetStr]
    );

    for (const driver of insuranceResult.rows) {
      await sendExpoNotification(
        driver.expo_push_token,
        days === 1 ? '⚠️ Insurance Expires TOMORROW' : `⚠️ Insurance Expires in ${days} Days`,
        `Your vehicle insurance (plate: ${driver.plate}) expires on ${new Date(driver.insurance_expiry).toLocaleDateString()}. Renew to stay on the road.`,
        { type: 'insurance_expiry', days_remaining: days }
      );

      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'doc_expiry', $2, $3, $4)`,
        [
          driver.id,
          `Insurance expires in ${days} day${days === 1 ? '' : 's'}`,
          `Your vehicle insurance (plate: ${driver.plate}) expires on ${new Date(driver.insurance_expiry).toLocaleDateString()}.`,
          JSON.stringify({ doc_type: 'insurance', days_remaining: days, expiry: driver.insurance_expiry })
        ]
      );
    }

    console.log(`[ExpiryAlertJob] Processed ${days}-day alerts: ${licenseResult.rows.length} license, ${insuranceResult.rows.length} insurance`);
  }
}

async function sendExpoNotification(pushToken, title, body, data) {
  try {
    const https = require('https');
    const payload = JSON.stringify({
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high'
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'exp.host',
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.warn('[ExpiryAlertJob] Push notification failed:', err.message);
  }
}

function startExpiryAlertJob(db) {
  // Use node-cron if available, else use a simple daily interval
  try {
    const cron = require('node-cron');
    // Run at 08:00 UTC daily (09:00 Douala time UTC+1)
    cron.schedule('0 8 * * *', () => {
      console.log('[ExpiryAlertJob] Running daily expiry check...');
      checkExpiryAlerts(db).catch(err => console.error('[ExpiryAlertJob] Error:', err.message));
    });
    console.log('[ExpiryAlertJob] Scheduled for 08:00 UTC daily');
  } catch (e) {
    // Fallback: check every 24 hours
    console.log('[ExpiryAlertJob] node-cron not available, using 24h interval fallback');
    setInterval(() => {
      checkExpiryAlerts(db).catch(err => console.error('[ExpiryAlertJob] Error:', err.message));
    }, 24 * 60 * 60 * 1000);
  }

  // Run once on startup to catch any missed alerts
  checkExpiryAlerts(db).catch(err => console.error('[ExpiryAlertJob] Startup check error:', err.message));
}

module.exports = { startExpiryAlertJob, checkExpiryAlerts };
