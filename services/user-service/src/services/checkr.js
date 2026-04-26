'use strict';
/**
 * checkr.js — Checkr Background Check API integration
 *
 * Flow:
 *   1. Admin triggers BGC for a driver (or auto-triggered on doc submission)
 *   2. createCandidate()    → creates a Checkr candidate record
 *   3. createInvitation()   → generates a hosted URL the driver visits to consent + submit info
 *   4. Driver completes form → Checkr runs checks
 *   5. Checkr webhook fires → handleWebhookEvent() updates drivers.bgc_status
 *
 * In dev/test (CHECKR_API_KEY not configured): returns mock responses so
 * the full flow can be exercised end-to-end without a live Checkr account.
 *
 * Docs: https://docs.checkr.com/
 */

const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const CHECKR_API_URL  = 'https://api.checkr.com/v1';
const CHECKR_API_KEY  = () => process.env.CHECKR_API_KEY;
const CHECKR_PACKAGE  = () => process.env.CHECKR_PACKAGE  || 'driver_pro';
const CHECKR_WEBHOOK_SECRET = () => process.env.CHECKR_WEBHOOK_SECRET;

function isConfigured() {
  const key = CHECKR_API_KEY();
  return !!(key && !key.startsWith('checkr_test_xxxx') && key.length > 10);
}

/** HTTP Basic auth header for Checkr (API key as username, empty password) */
function authHeaders() {
  const encoded = Buffer.from(`${CHECKR_API_KEY()}:`).toString('base64');
  return { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a Checkr candidate for a driver.
 * @returns {{ success: boolean, candidateId?: string, error?: string, mock?: boolean }}
 */
async function createCandidate({ firstName, lastName, email, phone }) {
  if (!isConfigured()) {
    const mockId = `cand_mock_${crypto.randomUUID().slice(0, 8)}`;
    logger.info('[Checkr] Mock: createCandidate', { mockId });
    return { success: true, candidateId: mockId, mock: true };
  }
  try {
    const { data } = await axios.post(`${CHECKR_API_URL}/candidates`, {
      first_name: firstName,
      last_name:  lastName,
      email,
      phone,
    }, { headers: authHeaders(), timeout: 10_000 });
    logger.info('[Checkr] Candidate created', { candidateId: data.id });
    return { success: true, candidateId: data.id };
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    logger.error('[Checkr] createCandidate failed', { detail });
    return { success: false, error: detail };
  }
}

/**
 * Create a hosted invitation link the driver uses to complete the BGC form.
 * @returns {{ success: boolean, invitationId?: string, invitationUrl?: string, error?: string }}
 */
async function createInvitation(candidateId) {
  if (!isConfigured()) {
    const mockUrl = `https://checkr.com/apply/mock-${candidateId}`;
    logger.info('[Checkr] Mock: createInvitation', { candidateId, mockUrl });
    return { success: true, invitationId: `inv_mock_${Date.now()}`, invitationUrl: mockUrl, mock: true };
  }
  try {
    const { data } = await axios.post(`${CHECKR_API_URL}/invitations`, {
      candidate_id: candidateId,
      package:      CHECKR_PACKAGE(),
    }, { headers: authHeaders(), timeout: 10_000 });
    logger.info('[Checkr] Invitation created', { invitationId: data.id });
    return { success: true, invitationId: data.id, invitationUrl: data.invitation_url };
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    logger.error('[Checkr] createInvitation failed', { detail });
    return { success: false, error: detail };
  }
}

/**
 * Full BGC initiation: create candidate → create invitation.
 * Returns invitationUrl for admin to share with driver (or auto-send via SMS/push).
 */
async function initiateBackgroundCheck({ firstName, lastName, email, phone }) {
  const candidateResult = await createCandidate({ firstName, lastName, email, phone });
  if (!candidateResult.success) return candidateResult;

  const inviteResult = await createInvitation(candidateResult.candidateId);
  return {
    success:       inviteResult.success,
    candidateId:   candidateResult.candidateId,
    invitationUrl: inviteResult.invitationUrl,
    invitationId:  inviteResult.invitationId,
    error:         inviteResult.error,
    mock:          candidateResult.mock || inviteResult.mock,
  };
}

/**
 * Fetch the status of a Checkr report by ID.
 * @returns {{ success: boolean, status?: string, result?: string, adjudication?: string }}
 */
async function getReport(reportId) {
  if (!isConfigured()) {
    return { success: true, status: 'clear', result: 'clear', adjudication: 'engaged', mock: true };
  }
  try {
    const { data } = await axios.get(`${CHECKR_API_URL}/reports/${reportId}`, {
      headers: authHeaders(), timeout: 10_000,
    });
    return { success: true, status: data.status, result: data.result, adjudication: data.adjudication };
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    logger.error('[Checkr] getReport failed', { reportId, detail });
    return { success: false, error: detail };
  }
}

/**
 * Verify a Checkr webhook HMAC-SHA256 signature.
 * Checkr sends X-Checkr-Signature header with hex-encoded HMAC.
 *
 * @param {string|Buffer} rawBody   — raw request body (before JSON.parse)
 * @param {string}        signature — value of X-Checkr-Signature header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = CHECKR_WEBHOOK_SECRET();
  if (!secret) return true; // skip verification in dev (no secret configured)
  if (!signature) return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Map a Checkr report result to MOBO's bgc_status.
 *
 * Checkr report results: 'clear' | 'consider' | 'suspended'
 * Checkr adjudication:   'engaged' | 'pre_adverse_action' | 'post_adverse_action'
 */
function mapCheckrResultToStatus(result, adjudication) {
  if (result === 'clear' && adjudication === 'engaged') return 'passed';
  if (result === 'consider' || adjudication?.includes('adverse')) return 'failed';
  return 'in_progress'; // pending / unknown
}

module.exports = {
  isConfigured,
  initiateBackgroundCheck,
  createCandidate,
  createInvitation,
  getReport,
  verifyWebhookSignature,
  mapCheckrResultToStatus,
};
