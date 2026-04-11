'use strict';

/**
 * adminDataController.js
 *
 * Handles:
 *  - Admin file upload / document management (encrypted storage)
 *  - Data access log retrieval
 *  - Admin notification retrieval + mark-read
 *  - Fleet/car/user detail management (write-permission users)
 *
 * All uploaded files are AES-256-GCM encrypted before storage.
 * All document downloads are logged in data_access_logs.
 */

const crypto = require('crypto');
const db     = require('../config/database');

const ENCRYPT_KEY_HEX = process.env.FIELD_ENCRYPTION_KEY || '0'.repeat(64); // 32 bytes = 64 hex chars
const KEY = Buffer.from(ENCRYPT_KEY_HEX, 'hex');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]);

const ALLOWED_DOC_TYPES = new Set([
  'national_id', 'driver_license', 'vehicle_photo', 'insurance',
  'profile_photo', 'vehicle_registration', 'other',
]);

// ── Encryption helpers ────────────────────────────────────────────────────────

function encryptBuffer(buf) {
  const iv         = crypto.randomBytes(12);
  const cipher     = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  // Pack: iv(12) + authTag(16) + ciphertext
  const packed     = Buffer.concat([iv, authTag, encrypted]);
  return { data: packed.toString('base64'), iv: iv.toString('base64') };
}

function decryptBase64(base64data) {
  const packed   = Buffer.from(base64data, 'base64');
  const iv       = packed.subarray(0, 12);
  const authTag  = packed.subarray(12, 28);
  const cipher   = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cipher), decipher.final()]);
}

function encryptText(text) {
  const iv        = crypto.randomBytes(12);
  const cipher    = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  const packed    = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

function decryptText(base64data) {
  try {
    const packed   = Buffer.from(base64data, 'base64');
    const iv       = packed.subarray(0, 12);
    const authTag  = packed.subarray(12, 28);
    const cipher   = packed.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
  } catch {
    return null; // decryption failed — return null instead of crashing
  }
}

// ── Document Upload ───────────────────────────────────────────────────────────

/**
 * POST /admin/admin-data/users/:userId/documents
 * Upload a document for a user or driver. Body: multipart/form-data OR JSON base64.
 *
 * Multer (memory storage) is applied at the route level.
 * Falls back to req.body.file_base64 for JSON-based uploads.
 */
exports.uploadDocument = async (req, res) => {
  try {
    const { userId } = req.params;
    const { doc_type = 'other', file_name } = req.body;

    if (!ALLOWED_DOC_TYPES.has(doc_type)) {
      return res.status(400).json({ success: false, message: `Invalid doc_type. Allowed: ${[...ALLOWED_DOC_TYPES].join(', ')}` });
    }

    let fileBuffer;
    let mimeType;
    let fileName;

    if (req.file) {
      // multipart upload via multer
      if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Unsupported file type. Only images and PDFs are allowed.' });
      }
      fileBuffer = req.file.buffer;
      mimeType   = req.file.mimetype;
      fileName   = file_name || req.file.originalname;
    } else if (req.body.file_base64) {
      // JSON base64 upload
      const raw  = req.body.file_base64;
      const match = raw.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType   = match[1];
        fileBuffer = Buffer.from(match[2], 'base64');
      } else {
        fileBuffer = Buffer.from(raw, 'base64');
        mimeType   = req.body.mime_type || 'application/octet-stream';
      }
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return res.status(400).json({ success: false, message: 'Unsupported file type.' });
      }
      fileName = file_name || `${doc_type}_${Date.now()}`;
    } else {
      return res.status(400).json({ success: false, message: 'No file provided. Send multipart/form-data or file_base64 field.' });
    }

    if (fileBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File size exceeds 10 MB limit.' });
    }

    // Encrypt the file before storage
    const { data: encryptedData, iv } = encryptBuffer(fileBuffer);

    const { rows } = await db.query(
      `INSERT INTO user_documents
         (user_id, doc_type, file_name, mime_type, encrypted_data,
          encryption_iv, file_size_kb, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, doc_type, file_name, mime_type, file_size_kb, created_at`,
      [
        userId, doc_type, fileName, mimeType,
        encryptedData, iv,
        Math.round(fileBuffer.length / 1024),
        req.user.id,
      ]
    );

    // Log the upload
    await db.query(
      `INSERT INTO data_access_logs
         (accessed_by, accessor_email, accessor_role, resource_type,
          resource_id, action, ip_address, user_agent)
       VALUES ($1,$2,$3,'document',$4,'file_upload',$5,$6)`,
      [req.user.id, req.user.email, req.user.admin_role || req.user.role,
       rows[0].id, req.ip, req.get('user-agent')]
    ).catch(() => {});

    // Notify super-admins
    await db.query(
      `INSERT INTO admin_notifications (recipient_id, type, title, message, metadata)
       VALUES (NULL, 'file_upload', $1, $2, $3)`,
      [
        `Document uploaded: ${doc_type} for user ${userId}`,
        `${req.user.email} uploaded a ${doc_type} document (${Math.round(fileBuffer.length / 1024)} KB)`,
        JSON.stringify({ user_id: userId, doc_id: rows[0].id, doc_type, uploaded_by: req.user.id }),
      ]
    ).catch(() => {});

    res.status(201).json({ success: true, document: rows[0] });
  } catch (err) {
    console.error('[AdminData] uploadDocument:', err);
    res.status(500).json({ success: false, message: 'Failed to upload document' });
  }
};

/**
 * GET /admin/admin-data/users/:userId/documents
 * List all documents for a user (metadata only, no encrypted data).
 */
exports.listDocuments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await db.query(
      `SELECT d.id, d.doc_type, d.file_name, d.mime_type, d.file_size_kb,
              d.verified, d.verified_at, d.created_at, d.deleted_at,
              uploader.full_name AS uploaded_by_name,
              verifier.full_name AS verified_by_name
       FROM user_documents d
       LEFT JOIN users uploader ON uploader.id = d.uploaded_by
       LEFT JOIN users verifier ON verifier.id = d.verified_by
       WHERE d.user_id = $1 AND d.deleted_at IS NULL
       ORDER BY d.created_at DESC`,
      [userId]
    );
    res.json({ success: true, documents: rows });
  } catch (err) {
    console.error('[AdminData] listDocuments:', err);
    res.status(500).json({ success: false, message: 'Failed to list documents' });
  }
};

/**
 * GET /admin/admin-data/documents/:docId/download
 * Decrypt and serve a document. Logs the access.
 */
exports.downloadDocument = async (req, res) => {
  try {
    const { docId } = req.params;
    const { rows } = await db.query(
      `SELECT d.*, u.full_name AS owner_name FROM user_documents d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [docId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found' });
    const doc = rows[0];

    // Decrypt
    let decrypted;
    try {
      decrypted = decryptBase64(doc.encrypted_data);
    } catch (e) {
      console.error('[AdminData] Decryption failed:', e.message);
      return res.status(500).json({ success: false, message: 'Failed to decrypt document' });
    }

    // Log access
    await db.query(
      `INSERT INTO data_access_logs
         (accessed_by, accessor_email, accessor_role, resource_type,
          resource_id, resource_owner, action, ip_address, user_agent)
       VALUES ($1,$2,$3,'document',$4,$5,'download',$6,$7)`,
      [req.user.id, req.user.email, req.user.admin_role || req.user.role,
       docId, doc.owner_name, req.ip, req.get('user-agent')]
    ).catch(() => {});

    // Update last_accessed
    await db.query(
      `UPDATE users SET last_accessed_by = $1, last_accessed_at = NOW() WHERE id = $2`,
      [req.user.id, doc.user_id]
    ).catch(() => {});

    // Notify
    await db.query(
      `INSERT INTO admin_notifications (recipient_id, type, title, message, metadata)
       VALUES (NULL, 'data_access', $1, $2, $3)`,
      [
        `Document Downloaded: ${doc.doc_type}`,
        `${req.user.email} downloaded a ${doc.doc_type} document for ${doc.owner_name}`,
        JSON.stringify({ doc_id: docId, user_id: doc.user_id, doc_type: doc.doc_type }),
      ]
    ).catch(() => {});

    // Serve decrypted file
    res.set({
      'Content-Type':        doc.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.file_name}"`,
      'Content-Length':      decrypted.length,
      'Cache-Control':       'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(decrypted);
  } catch (err) {
    console.error('[AdminData] downloadDocument:', err);
    res.status(500).json({ success: false, message: 'Failed to download document' });
  }
};

/**
 * PATCH /admin/admin-data/documents/:docId/verify
 * Mark a document as verified.
 */
exports.verifyDocument = async (req, res) => {
  try {
    const { docId } = req.params;
    await db.query(
      `UPDATE user_documents SET verified = true, verified_by = $1, verified_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL`,
      [req.user.id, docId]
    );
    res.json({ success: true, message: 'Document verified' });
  } catch (err) {
    console.error('[AdminData] verifyDocument:', err);
    res.status(500).json({ success: false, message: 'Failed to verify document' });
  }
};

/**
 * DELETE /admin/admin-data/documents/:docId
 * Soft-archive a document (sets deleted_at).
 */
exports.archiveDocument = async (req, res) => {
  try {
    const { docId } = req.params;
    await db.query(
      `UPDATE user_documents SET deleted_at = NOW() WHERE id = $1`,
      [docId]
    );
    res.json({ success: true, message: 'Document archived' });
  } catch (err) {
    console.error('[AdminData] archiveDocument:', err);
    res.status(500).json({ success: false, message: 'Failed to archive document' });
  }
};

// ── Data Access Log ───────────────────────────────────────────────────────────

/**
 * GET /admin/admin-data/access-logs
 * Returns paginated access log. Query params: page, limit, resource_type, accessor_id.
 */
exports.getAccessLogs = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit  = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = (page - 1) * limit;

    const filters = []; const params = [];
    let i = 1;
    if (req.query.resource_type) { filters.push(`resource_type = $${i++}`); params.push(req.query.resource_type); }
    if (req.query.accessor_id)   { filters.push(`accessed_by = $${i++}`);   params.push(req.query.accessor_id); }
    if (req.query.resource_id)   { filters.push(`resource_id = $${i++}`);   params.push(req.query.resource_id); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    params.push(limit, offset);

    const [logsRes, countRes] = await Promise.all([
      db.query(
        `SELECT id, accessed_by, accessor_email, accessor_role,
                resource_type, resource_id, resource_owner,
                action, fields_accessed, ip_address, created_at
         FROM data_access_logs
         ${where}
         ORDER BY created_at DESC
         LIMIT $${i} OFFSET $${i+1}`,
        params
      ),
      db.query(
        `SELECT COUNT(*)::int AS total FROM data_access_logs ${where}`,
        params.slice(0, -2)
      ),
    ]);

    res.json({
      success: true,
      logs: logsRes.rows,
      total: countRes.rows[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error('[AdminData] getAccessLogs:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve access logs' });
  }
};

// ── Admin Notifications ───────────────────────────────────────────────────────

/**
 * GET /admin/admin-data/notifications
 * Returns unread (and recent read) notifications for the current admin.
 * Includes broadcast notifications (recipient_id IS NULL).
 */
exports.getNotifications = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, type, title, message, metadata, is_read, created_at
       FROM admin_notifications
       WHERE (recipient_id = $1 OR recipient_id IS NULL)
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    const unreadCount = rows.filter(n => !n.is_read).length;
    res.json({ success: true, notifications: rows, unread_count: unreadCount });
  } catch (err) {
    console.error('[AdminData] getNotifications:', err);
    res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
};

/**
 * PATCH /admin/admin-data/notifications/:id/read
 * Mark a notification as read.
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      `UPDATE admin_notifications SET is_read = true
       WHERE id = $1 AND (recipient_id = $2 OR recipient_id IS NULL)`,
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[AdminData] markNotificationRead:', err);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

/**
 * PATCH /admin/admin-data/notifications/read-all
 * Mark all notifications as read for the current user.
 */
exports.markAllRead = async (req, res) => {
  try {
    await db.query(
      `UPDATE admin_notifications SET is_read = true
       WHERE (recipient_id = $1 OR recipient_id IS NULL) AND is_read = false`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[AdminData] markAllRead:', err);
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
};

// ── Encrypt / Reveal PII fields ───────────────────────────────────────────────

/**
 * POST /admin/admin-data/users/:userId/reveal
 * Decrypt and return sensitive PII fields for the given user.
 * Logged as 'reveal_field' in data_access_logs.
 * Body: { fields: ['phone', 'email', 'national_id'] }
 */
exports.revealUserFields = async (req, res) => {
  try {
    const { userId } = req.params;
    const requested  = req.body.fields || ['phone'];
    const SAFE_FIELDS = new Set(['phone', 'email', 'full_name', 'national_id', 'date_of_birth']);
    const allowedFields = requested.filter(f => SAFE_FIELDS.has(f));
    if (!allowedFields.length) {
      return res.status(400).json({ success: false, message: 'No valid fields requested' });
    }

    const { rows } = await db.query(
      `SELECT phone, email, full_name, date_of_birth,
              phone_encrypted, email_encrypted, full_name_encrypted, national_id_encrypted
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    const u = rows[0];

    const revealed = {};
    for (const field of allowedFields) {
      switch (field) {
        case 'phone':       revealed.phone = u.phone_encrypted ? (decryptText(u.phone_encrypted) || u.phone) : u.phone; break;
        case 'email':       revealed.email = u.email_encrypted ? (decryptText(u.email_encrypted) || u.email) : u.email; break;
        case 'full_name':   revealed.full_name = u.full_name_encrypted ? (decryptText(u.full_name_encrypted) || u.full_name) : u.full_name; break;
        case 'national_id': revealed.national_id = u.national_id_encrypted ? (decryptText(u.national_id_encrypted) || null) : null; break;
        case 'date_of_birth': revealed.date_of_birth = u.date_of_birth; break;
      }
    }

    // Log the reveal
    await db.query(
      `INSERT INTO data_access_logs
         (accessed_by, accessor_email, accessor_role, resource_type,
          resource_id, resource_owner, action, fields_accessed, ip_address, user_agent)
       VALUES ($1,$2,$3,'user',$4,$5,'reveal_field',$6,$7,$8)`,
      [
        req.user.id, req.user.email, req.user.admin_role || req.user.role,
        userId, u.full_name, allowedFields, req.ip, req.get('user-agent'),
      ]
    ).catch(() => {});

    // Notify super-admins
    await db.query(
      `INSERT INTO admin_notifications (recipient_id, type, title, message, metadata)
       VALUES (NULL, 'data_access', $1, $2, $3)`,
      [
        `PII Revealed: ${allowedFields.join(', ')}`,
        `${req.user.email} revealed sensitive fields [${allowedFields.join(', ')}] for user ${u.full_name}`,
        JSON.stringify({ user_id: userId, fields: allowedFields, accessor: req.user.email }),
      ]
    ).catch(() => {});

    res.json({ success: true, data: revealed, accessed_at: new Date().toISOString() });
  } catch (err) {
    console.error('[AdminData] revealUserFields:', err);
    res.status(500).json({ success: false, message: 'Failed to reveal fields' });
  }
};
