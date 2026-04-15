'use strict';
/**
 * networkResilience.js — Shared retry + timeout utilities for Africa 3G conditions
 *
 * Why this exists:
 *   Average mobile latency in West/Central Africa on 3G is 200–400 ms per round trip.
 *   Packet loss rates of 2–5% are common. Without retry logic:
 *   - A single dropped packet on a 3-hop call (client → gateway → service → DB)
 *     fails the entire request with a confusing 502.
 *   - ML service calls (fraud checks) fail silently and permanently.
 *
 * Usage:
 *   const { withRetry, axiosAfrica, sleep } = require('../../../shared/networkResilience');
 *
 *   // Wrap any async function
 *   const result = await withRetry(() => axios.post(url, body), { maxAttempts: 3 });
 *
 *   // Or use the pre-configured axios instance
 *   const res = await axiosAfrica.post('/score/gps', payload);
 */

const axios = require('axios');
const logger = require('./logger');

// ── Tunables ──────────────────────────────────────────────────────────────────
// These match observed Africa 3G characteristics (200–400 ms base latency,
// 2–5 % packet loss, occasional multi-second stalls during handoff).
const DEFAULTS = {
  maxAttempts:  3,
  baseDelayMs:  600,   // first retry after 600 ms
  maxDelayMs:   8000,  // cap at 8 s — don't make users wait longer
  jitterFactor: 0.25,  // ±25 % random jitter to prevent thundering-herd
};

// HTTP status codes that are worth retrying (transient errors)
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Exponential back-off with full jitter.
 * Formula: min(baseDelay * 2^(attempt-1), maxDelay) * (1 ± jitter)
 */
function backoffMs(attempt, opts = {}) {
  const base   = opts.baseDelayMs  ?? DEFAULTS.baseDelayMs;
  const maxMs  = opts.maxDelayMs   ?? DEFAULTS.maxDelayMs;
  const jitter = opts.jitterFactor ?? DEFAULTS.jitterFactor;
  const exp    = Math.min(base * Math.pow(2, attempt - 1), maxMs);
  const rand   = 1 + (Math.random() * 2 - 1) * jitter; // 1 ± jitter
  return Math.round(exp * rand);
}

/**
 * Retry wrapper for any async function.
 *
 * @template T
 * @param {() => Promise<T>} fn  — the async operation to retry
 * @param {object} [opts]
 * @param {number}  [opts.maxAttempts=3]   — total attempts (including first try)
 * @param {number}  [opts.baseDelayMs=600] — initial back-off delay in ms
 * @param {number}  [opts.maxDelayMs=8000] — maximum back-off delay in ms
 * @param {string}  [opts.label='']        — log label for debugging
 * @param {(err: any, attempt: number) => boolean} [opts.shouldRetry]
 *   — custom predicate; return false to abort retries early
 * @returns {Promise<T>}
 */
async function withRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts;
  const label       = opts.label ?? 'withRetry';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxAttempts;

      // Custom predicate can abort early (e.g. don't retry auth errors)
      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) {
        throw err;
      }

      // Non-retryable HTTP status — fail immediately
      const status = err?.response?.status;
      if (status && !RETRYABLE_STATUS.has(status) && status < 500) {
        throw err;
      }

      if (isLast) {
        logger.warn(`[${label}] All ${maxAttempts} attempts failed`, {
          err: err.message,
          status,
        });
        throw err;
      }

      const delay = backoffMs(attempt, opts);
      logger.warn(`[${label}] Attempt ${attempt}/${maxAttempts} failed — retrying in ${delay}ms`, {
        err: err.message,
        status,
      });
      await sleep(delay);
    }
  }
}

// ── Pre-configured axios instance for Africa-optimised inter-service calls ────
//
// Timeouts are generous because:
//   - A 3G RTT is 200–400 ms, meaning even a "fast" DB query (5 ms) looks like
//     200+ ms from the client.
//   - The ML service (fraud scoring) runs a scikit-learn model synchronously;
//     cold-start can take 2–3 s after a Render spin-down.
//
// The interceptor adds automatic retry for transient failures so callers don't
// need to wrap every axios call manually.

const axiosAfrica = axios.create({
  timeout: 12000,   // 12 s — covers slow 3G + ML model latency
  headers: {
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection':       'keep-alive',
  },
});

// Response interceptor: retry on transient errors
axiosAfrica.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config  = err.config;
    const status  = err?.response?.status;

    // Attach retry counter to the request config
    config._retryCount = (config._retryCount ?? 0) + 1;

    const shouldRetry =
      config._retryCount <= 2 &&
      (err.code === 'ECONNRESET' ||
       err.code === 'ECONNREFUSED' ||
       err.code === 'ETIMEDOUT'  ||
       err.code === 'ENOTFOUND'  ||
       (status && RETRYABLE_STATUS.has(status)));

    if (!shouldRetry) return Promise.reject(err);

    const delay = backoffMs(config._retryCount, { baseDelayMs: 800 });
    logger.warn(`[axiosAfrica] Retry ${config._retryCount}/2 for ${config.url} in ${delay}ms`, {
      code: err.code, status,
    });
    await sleep(delay);
    return axiosAfrica(config);
  }
);

module.exports = { withRetry, axiosAfrica, sleep, backoffMs };
