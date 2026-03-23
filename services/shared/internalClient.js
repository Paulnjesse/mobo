'use strict';

/**
 * internalClient.js — Canonical inter-service HTTP client
 *
 * Combines:
 *   1. mTLS (services/shared/mtlsClient.js) — client certificate auth
 *   2. Circuit breaker (services/shared/circuitBreaker.js) — fail-fast resilience
 *
 * Usage (in any service that needs to call another):
 *
 *   const { callService } = require('../../shared/internalClient');
 *
 *   // GET with fallback
 *   const profile = await callService('user-service.getProfile', () =>
 *     internalAxios.get(`${USER_SERVICE_URL}/users/${userId}/profile`),
 *     { fallback: () => null }
 *   );
 *
 *   // POST with no fallback (let it throw when circuit is open)
 *   await callService('payment-service.chargeRide', () =>
 *     internalAxios.post(`${PAYMENT_SERVICE_URL}/payments/charge`, body)
 *   );
 */

const { internalAxios, isMtlsActive } = require('./mtlsClient');
const { callWithBreaker, getBreakerStatus } = require('./circuitBreaker');

/**
 * Make a service-to-service call with circuit breaking + mTLS.
 *
 * @param {string}   name         - Circuit breaker name: 'service-name.operationName'
 * @param {Function} axiosFn      - () => Promise — use `internalAxios` for mTLS
 * @param {object}   [opts]
 * @param {Function} [opts.fallback]    - Called when circuit is OPEN or request fails
 * @param {object}   [opts.breaker]     - Override circuit breaker options
 * @returns {Promise<any>}
 */
async function callService(name, axiosFn, opts = {}) {
  return callWithBreaker(name, axiosFn, opts);
}

module.exports = { callService, internalAxios, isMtlsActive, getBreakerStatus };
