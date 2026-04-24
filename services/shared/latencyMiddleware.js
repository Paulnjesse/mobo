'use strict';
/**
 * latencyMiddleware.js — HTTP request latency instrumentation
 *
 * Provides two things:
 *   1. `httpLatencyMiddleware(register, serviceName)` — Express middleware that
 *      records every request in a prom-client Histogram and emits an
 *      X-Response-Time header (milliseconds) for client-side tracing.
 *
 *   2. `createLatencyHistogram(register, serviceName)` — factory used by each
 *      service's server.js to register the histogram in its local registry.
 *
 * Metric name: `http_request_duration_seconds`
 * Labels:      method, route (normalised path), status_code
 *
 * Why normalise the route?
 *   Without normalisation, `/rides/uuid-a`, `/rides/uuid-b`, … produce a
 *   separate time-series per ride ID — cardinality explosion that crashes
 *   Prometheus.  We replace UUID and numeric segments with `{id}`.
 *
 * Latency targets (SLO):
 *   p50 ≤  80 ms   (match Uber/Lyft fast-path)
 *   p95 ≤ 200 ms
 *   p99 ≤ 500 ms
 *   p99.9 ≤ 1 000 ms
 */

const onHeaders = require('on-headers');

// UUID regex + bare numeric IDs
const UUID_RE    = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_RE = /\/\d+(?=\/|$)/g;

/**
 * Normalise an Express route path for Prometheus label safety.
 * e.g. /rides/abc-123/status  →  /rides/{id}/status
 */
function normalisePath(req) {
  // Prefer the matched Express route pattern (e.g. /rides/:id/status)
  // which is already parameterised; fall back to raw URL normalisation.
  const base = req.route?.path || req.path || req.url || '/unknown';
  return base
    .replace(UUID_RE,    '{id}')
    .replace(NUMERIC_RE, '/{id}')
    .replace(/\?.*$/, '');   // strip query string
}

/**
 * Create and register the HTTP latency histogram for a service.
 *
 * @param {import('prom-client').Registry} register — the service's local registry
 * @param {string} serviceName — used in the help string only (not a label)
 * @returns {import('prom-client').Histogram}
 */
function createLatencyHistogram(register, serviceName) {
  const promClient = require('prom-client');

  // Buckets cover sub-millisecond to 10-second range.
  // Fine-grained below 500 ms where SLO violations matter most.
  const buckets = [
    0.005, 0.01, 0.025, 0.05, 0.075,
    0.1, 0.15, 0.2, 0.3, 0.5,
    0.75, 1, 2, 5, 10,
  ];

  return new promClient.Histogram({
    name:    'http_request_duration_seconds',
    help:    `HTTP request duration in seconds — ${serviceName}`,
    labelNames: ['method', 'route', 'status_code'],
    buckets,
    registers: [register],
  });
}

/**
 * Express middleware factory.
 *
 * @param {import('prom-client').Histogram} histogram
 * @returns {import('express').RequestHandler}
 */
function httpLatencyMiddleware(histogram) {
  return function latency(req, res, next) {
    if (req.path === '/health' || req.path === '/metrics') return next();

    const startNs = process.hrtime.bigint();

    // onHeaders fires just before headers are sent — route is already resolved
    onHeaders(res, function () {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      const durationS  = durationMs / 1000;

      // X-Response-Time header — visible in browser devtools and Nginx logs
      this.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);

      // Record in Prometheus histogram
      const route = normalisePath(req);
      histogram.labels(req.method, route, String(res.statusCode)).observe(durationS);
    });

    next();
  };
}

module.exports = { createLatencyHistogram, httpLatencyMiddleware };
