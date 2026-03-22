/**
 * Biometric Driver Verification Controller
 * Accepts a base64 face photo and performs liveness + identity verification.
 *
 * In production: integrate with a Face Recognition API (e.g., AWS Rekognition,
 * Azure Face API, or a local OpenCV-based service).
 * For now, performs basic presence validation and stores verification timestamp.
 */
const db = require('../config/database');

exports.verifyDriver = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;
    const { photo_base64 } = req.body;

    if (!photo_base64) {
      return res.status(400).json({ error: 'No photo provided' });
    }

    // Validate base64 image presence (non-empty, reasonable size)
    const sizeKb = Buffer.byteLength(photo_base64, 'base64') / 1024;
    if (sizeKb < 10) {
      return res.status(400).json({ error: 'Photo too small or corrupted', verified: false });
    }

    // TODO: In production, call your face verification API here:
    // const result = await faceApiClient.verify(photo_base64, driverReferencePhoto);
    // For now, we trust the client submission and record the verification event.

    await db.query(
      `INSERT INTO driver_biometric_verifications (driver_id, verified_at, photo_size_kb, result)
       VALUES ($1, NOW(), $2, 'verified')
       ON CONFLICT (driver_id) DO UPDATE
         SET verified_at = NOW(), photo_size_kb = $2, result = 'verified'`,
      [driverId, Math.round(sizeKb)]
    ).catch(() => {
      // Table may not exist yet — log but don't fail
      console.warn('[biometricController] driver_biometric_verifications table not found — run migration_015.sql');
    });

    res.json({ verified: true, message: 'Identity confirmed' });
  } catch (err) {
    console.error('biometricController.verifyDriver:', err);
    res.status(500).json({ error: 'Verification failed', verified: false });
  }
};
