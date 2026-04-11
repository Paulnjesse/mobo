'use strict';

const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePermission }          = require('../middleware/rbac');
const ctrl                           = require('../controllers/adminDataController');

router.use(authenticate, requireAdmin);

// multer: memory storage, 10 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
    cb(null, ok.includes(file.mimetype));
  },
});

// ── Documents ─────────────────────────────────────────────────────────────────
const canWrite = requirePermission('users:write');
const canRead  = requirePermission('users:read');

router.post('/users/:userId/documents',
  canWrite, upload.single('file'), ctrl.uploadDocument);

router.get('/users/:userId/documents',
  canRead, ctrl.listDocuments);

router.get('/documents/:docId/download',
  canRead, ctrl.downloadDocument);

router.patch('/documents/:docId/verify',
  canWrite, ctrl.verifyDocument);

router.delete('/documents/:docId',
  requirePermission('users:archive'), ctrl.archiveDocument);

// ── PII reveal ────────────────────────────────────────────────────────────────
router.post('/users/:userId/reveal',
  canRead, ctrl.revealUserFields);

// ── Access logs (admin:audit_logs permission) ─────────────────────────────────
router.get('/access-logs',
  requirePermission('admin:audit_logs'), ctrl.getAccessLogs);

// ── Notifications ─────────────────────────────────────────────────────────────
// Any admin can read their own notifications
router.get('/notifications',         ctrl.getNotifications);
router.patch('/notifications/read-all', ctrl.markAllRead);
router.patch('/notifications/:id/read', ctrl.markNotificationRead);

module.exports = router;
