const logger = require('./logger');
/**
 * MOBO Circuit Breaker — Inter-Service Resilience
 *
 * Wraps all service-to-service HTTP calls with opossum circuit breakers.
 * Prevents cascading failures: if user-service is slow, ride-service
 * stops hammering it and returns a degraded (cached/fallback) response instead.
 *
 * States:
 *   CLOSED   → requests flow normally
 *   OPEN     → requests fail fast (no network call) for `resetTimeout` ms
 *   HALF-OPEN → one probe request allowed; success closes, failure re-opens
 *
 * Install: npm install opossum   (in each service that calls other services)
 */
'use strict';

let CircuitBreaker;
try {
  CircuitBreaker = require('opossum');
} catch {
  // opossum not installed — return pass-through breaker (logs warning once)
  logger.warn('[CircuitBreaker] opossum not installed — circuit breaking disabled. Run: npm install opossum');
  CircuitBreaker = null;
}

// ─── Default options ──────────────────────────────────────────────────────────
const DEFAULTS = {
  timeout:              5000,   // request must complete within 5s
  errorThresholdPercent: 50,    // open circuit if >50% of requests fail
  resetTimeout:         30000,  // try half-open after 30s
  volumeThreshold:      5,      // minimum 5 requests before evaluating threshold
  rollingCountTimeout:  10000,  // rolling window for error % calculation
};

// ─── Breaker registry (one per downstream service) ───────────────────────────
const _breakers = new Map();

/**
 * Get or create a circuit breaker for the given action function.
 *
 * @param {string}   name    - Human-readable name (e.g. 'user-service.getProfile')
 * @param {Function} action  - The async function to protect (must return a Promise)
 * @param {object}   [opts]  - Override default breaker options
 * @returns {CircuitBreaker|PassThrough}
 */
function getBreaker(name, action, opts = {}) {
  if (_breakers.has(name)) return _breakers.get(name);

  if (!CircuitBreaker) {
    // Pass-through shim — behaves like a breaker but never opens
    const shim = { fire: action, fallback: () => shim, on: () => shim };
    _breakers.set(name, shim);
    return shim;
  }

  const breaker = new CircuitBreaker(action, { ...DEFAULTS, ...opts, name });

  // ── Observability ────────────────────────────────────────────────────────────
  breaker.on('open', () => {
    logger.error(`[CircuitBreaker] OPEN — ${name}: downstream unhealthy, failing fast`);
  });

  breaker.on('halfOpen', () => {
    logger.warn(`[CircuitBreaker] HALF-OPEN — ${name}: probing recovery`);
  });

  breaker.on('close', () => {
    console.info(`[CircuitBreaker] CLOSED — ${name}: downstream recovered`);
  });

  breaker.on('fallback', (result) => {
    logger.warn(`[CircuitBreaker] FALLBACK — ${name}:`, result);
  });

  breaker.on('timeout', () => {
    logger.warn(`[CircuitBreaker] TIMEOUT — ${name}: request exceeded ${DEFAULTS.timeout}ms`);
  });

  _breakers.set(name, breaker);
  return breaker;
}

/**
 * Convenience: wrap an axios call with a circuit breaker.
 *
 * Usage:
 *   const result = await callWithBreaker(
 *     'user-service.getProfile',
 *     () => internalAxios.get(`${USER_SERVICE_URL}/users/${userId}/profile`),
 *     { fallback: () => null }   // return null if circuit is open
 *   );
 *
 * @param {string}   name        - Breaker name (unique per downstream endpoint)
 * @param {Function} axiosFn     - () => Promise — the actual HTTP call
 * @param {object}   [opts]
 * @param {Function} [opts.fallback]  - Called when circuit is open or request fails
 * @param {object}   [opts.breaker]   - Override breaker options
 */
async function callWithBreaker(name, axiosFn, opts = {}) {
  const breaker = getBreaker(name, axiosFn, opts.breaker || {});

  if (opts.fallback) {
    breaker.fallback(opts.fallback);
  }

  return breaker.fire();
}

/**
 * Health snapshot of all registered breakers.
 * Useful for /health endpoint to report degraded state.
 */
function getBreakerStatus() {
  const status = {};
  for (const [name, breaker] of _breakers.entries()) {
    if (breaker.stats) {
      status[name] = {
        state:          breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
        failures:       breaker.stats.failures,
        successes:      breaker.stats.successes,
        fallbacks:      breaker.stats.fallbacks,
        rejects:        breaker.stats.rejects,
        latencyMean:    Math.round(breaker.stats.latencyMean || 0),
      };
    }
  }
  return status;
}

module.exports = { getBreaker, callWithBreaker, getBreakerStatus };
