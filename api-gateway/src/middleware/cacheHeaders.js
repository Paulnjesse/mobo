'use strict';
/**
 * cacheHeaders.js — HTTP Cache-Control middleware for Africa bandwidth optimisation
 *
 * Why this matters on 3G:
 *   A typical MOBO session makes these repeated GET calls:
 *   - Surge zones         — changes at most every few minutes
 *   - Restaurant list     — changes hourly at most
 *   - Ride type list      — never changes at runtime
 *   - Nearby drivers      — must be real-time (no cache)
 *
 *   Without caching, every screen refresh re-downloads the same data over a
 *   200–400 ms 3G link.  With short-lived cache-control headers, the mobile
 *   OS or app HTTP client serves the response from memory:
 *   - 0 ms response time
 *   - 0 bytes over the air
 *   - 0 DB queries
 *
 * Strategy:
 *   Use `Cache-Control: public, max-age=N, stale-while-revalidate=M` so:
 *   - The client uses the cached response for up to max-age seconds
 *   - Between max-age and max-age+stale-while-revalidate it serves stale
 *     while refreshing in the background (zero visible latency)
 *
 * This middleware ONLY sets cache headers — actual caching happens in the
 * mobile app's HTTP client (React Native / Axios).  We never cache
 * user-specific or mutating responses.
 */

const RULES = [
  // Surge zones: changes every 2–5 minutes at peak; 60 s fresh is safe
  { pattern: /\/api\/v?1?\/?(rides\/)?surge/,          maxAge: 60,   swr: 120 },

  // Ride type list + fare rates: static at runtime
  { pattern: /\/api\/v?1?\/?(rides\/)?types/,          maxAge: 3600, swr: 7200 },

  // Restaurant list: changes when admin edits; 5-minute cache
  { pattern: /\/api\/v?1?\/food\/restaurants$/,         maxAge: 300,  swr: 600 },

  // Individual restaurant + menu: same
  { pattern: /\/api\/v?1?\/food\/restaurants\/[^/]+$/, maxAge: 300,  swr: 600 },

  // Safety zones: admin-updated; 10-minute cache
  { pattern: /\/api\/v?1?\/(safety-zones|safety)/,     maxAge: 600,  swr: 1200 },

  // Promo / active promos: changes rarely
  { pattern: /\/api\/v?1?\/rides\/promos\/active/,      maxAge: 120,  swr: 240 },

  // Health check: short cache to reduce monitoring noise
  { pattern: /\/health$/,                               maxAge: 10,   swr: 30 },
];

/**
 * Express middleware — attaches Cache-Control + ETag-friendly headers for
 * GET/HEAD requests that match known cacheable patterns.
 *
 * All other requests and all authenticated mutations (POST/PATCH/DELETE)
 * receive `Cache-Control: no-store` to prevent stale data.
 */
function cacheHeaders(req, res, next) {
  // Only cache GET and HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }

  for (const rule of RULES) {
    if (rule.pattern.test(req.path)) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${rule.maxAge}, stale-while-revalidate=${rule.swr}`
      );
      return next();
    }
  }

  // Default for authenticated/dynamic GET endpoints
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}

module.exports = { cacheHeaders };
