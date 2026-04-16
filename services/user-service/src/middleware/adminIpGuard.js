const logger = require('../utils/logger');
/**
 * Admin IP Allowlist Guard
 *
 * Restricts admin API endpoints to known IP addresses.
 * Configured via ADMIN_ALLOWED_IPS env var (comma-separated CIDRs or exact IPs).
 *
 * If ADMIN_ALLOWED_IPS is not set, all IPs are allowed with a warning.
 * In production this MUST be set to your office/VPN IP ranges.
 *
 * Example:
 *   ADMIN_ALLOWED_IPS=197.234.219.0/24,102.244.0.0/16,127.0.0.1
 *
 * Usage:
 *   router.use('/admin', adminIpGuard, requireAdmin, ...routes)
 */
'use strict';

const { writePaymentAudit } = require('../utils/auditHelpers').catch?.() || {};

// Parse allowed IP list from env — supports exact IPs and simple /24 CIDR notation
function parseAllowedIps() {
  const raw = process.env.ADMIN_ALLOWED_IPS;
  if (!raw || raw.trim() === '') return null; // null = allow all (dev mode)

  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Convert IPv4 to integer for range comparison.
 */
function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Check if an IP matches a CIDR or exact IP entry.
 */
function ipMatchesEntry(ip, entry) {
  if (!entry.includes('/')) return ip === entry;

  const [network, bits] = entry.split('/');
  const mask   = ~((1 << (32 - parseInt(bits, 10))) - 1) >>> 0;
  const netInt = ipToInt(network) & mask;
  const ipInt  = ipToInt(ip)      & mask;
  return netInt === ipInt;
}

function isAllowed(ip, allowList) {
  if (!allowList) return true; // no restriction configured
  // Strip IPv6-mapped IPv4 prefix (::ffff:192.168.x.x)
  const cleanIp = ip.replace(/^::ffff:/, '');
  return allowList.some(entry => ipMatchesEntry(cleanIp, entry));
}

const ALLOWED_IPS = parseAllowedIps();

if (process.env.NODE_ENV === 'production' && !ALLOWED_IPS) {
  logger.warn(
    '[adminIpGuard] WARNING: ADMIN_ALLOWED_IPS is not set. ' +
    'Admin endpoints are accessible from any IP. ' +
    'Set ADMIN_ALLOWED_IPS to your VPN/office IP ranges in production.'
  );
}

/**
 * Express middleware — blocks non-allowlisted IPs on admin routes.
 */
function adminIpGuard(req, res, next) {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

  if (!isAllowed(clientIp, ALLOWED_IPS)) {
    logger.error('[adminIpGuard] BLOCKED admin request from IP:', clientIp, {
      path:   req.path,
      method: req.method,
      ua:     req.get('user-agent'),
    });

    // Return the same 404 as non-existent routes — don't leak that admin exists
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  next();
}

module.exports = adminIpGuard;
