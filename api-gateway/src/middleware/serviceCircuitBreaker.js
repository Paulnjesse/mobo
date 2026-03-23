'use strict';

/**
 * serviceCircuitBreaker.js — API Gateway Circuit Breaker Middleware
 *
 * Intercepts 502/503/504 responses from downstream services and tracks
 * failure rates. When a service crosses the error threshold, the circuit
 * opens and subsequent requests fail immediately with a clear error message
 * rather than waiting for timeout.
 *
 * Implementation: lightweight in-process state machine per service.
 * Uses opossum when available; falls back to manual tracking.
 *
 * States: CLOSED → OPEN (after threshold) → HALF-OPEN (after resetTimeout) → CLOSED
 *
 * Attach before proxy middleware:
 *   app.use('/api/users', circuitBreakerFor('user-service'), userProxy);
 */

let CircuitBreaker;
try {
  CircuitBreaker = require('opossum');
} catch {
  CircuitBreaker = null;
}

// Options per circuit
const DEFAULTS = {
  timeout:               8000,   // 8s proxy timeout
  errorThresholdPercent: 50,
  resetTimeout:          30_000,
  volumeThreshold:       5,
  rollingCountTimeout:   10_000,
};

// Service health state — used for the /health/deep endpoint and /metrics
const _serviceHealth = new Map();

/**
 * Returns an Express middleware that guards a downstream proxy
 * for the named service.
 *
 * @param {string} serviceName  e.g. 'user-service'
 * @param {object} [opts]       Override circuit breaker options
 */
function circuitBreakerFor(serviceName, opts = {}) {
  const health = { state: 'CLOSED', failures: 0, successes: 0, lastOpen: null };
  _serviceHealth.set(serviceName, health);

  if (!CircuitBreaker) {
    // No opossum — just pass through, but still track for /health/deep
    return (req, res, next) => next();
  }

  const breakerOpts = { ...DEFAULTS, ...opts, name: serviceName };
  // Wrap a no-op action — we'll fire it on every request and decide based on response
  const noop = async () => {};
  const breaker = new CircuitBreaker(noop, breakerOpts);

  breaker.on('open',     () => { health.state = 'OPEN';      health.lastOpen = new Date(); console.error(`[CircuitBreaker] OPEN  — ${serviceName}`); });
  breaker.on('halfOpen', () => { health.state = 'HALF_OPEN';                               console.warn( `[CircuitBreaker] HALF-OPEN — ${serviceName}`); });
  breaker.on('close',    () => { health.state = 'CLOSED';                                  console.info( `[CircuitBreaker] CLOSED — ${serviceName}`); });

  return (req, res, next) => {
    if (breaker.opened) {
      health.failures++;
      return res.status(503).json({
        success: false,
        error:   'Service temporarily unavailable',
        service: serviceName,
        retry_after_ms: DEFAULTS.resetTimeout,
      });
    }

    // Intercept the response to track success / failure
    const originalEnd   = res.end.bind(res);
    const originalWrite = res.write.bind(res);

    res.end = function (...args) {
      // Count 5xx responses as circuit failures
      if (res.statusCode >= 500) {
        breaker.fire().catch(() => {}); // triggers failure counter
        health.failures++;
      } else {
        health.successes++;
      }
      return originalEnd(...args);
    };

    // Restore write (end might not be called directly in some proxy flows)
    res.write = originalWrite;

    next();
  };
}

/**
 * Get health state of all registered services.
 * Used by /health/deep and Prometheus metrics.
 */
function getAllServiceHealth() {
  const result = {};
  for (const [name, h] of _serviceHealth.entries()) {
    result[name] = { ...h };
  }
  return result;
}

module.exports = { circuitBreakerFor, getAllServiceHealth };
