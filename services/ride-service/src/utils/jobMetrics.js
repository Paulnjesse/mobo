'use strict';
/**
 * jobMetrics.js — Prometheus gauges for polling-job consumer lag
 *
 * Why: MOBO doesn't run Kafka/RabbitMQ — it uses polling jobs instead.
 * This module emits the same observable signals a real consumer-lag metric
 * would provide so Grafana / Prometheus alerts still fire on job stalls.
 *
 * Exported gauges
 * ───────────────
 * job_last_run_timestamp_seconds   — Unix epoch of last successful run (per job)
 * job_lag_seconds                  — Seconds since last successful run (per job)
 * job_pending_items_total          — Count of unprocessed items found in last run
 *
 * Usage in a job:
 *   const { recordJobRun, recordJobPending } = require('../utils/jobMetrics');
 *   recordJobRun('escalation_job');          // call after each poll completes
 *   recordJobPending('escalation_job', n);   // call with pending count
 */

let promClient;
try {
  promClient = require('prom-client');
} catch {
  promClient = null;
}

// Graceful no-op registry when prom-client isn't available (e.g. unit tests)
const registry = promClient ? new promClient.Registry() : null;

let lastRunGauge      = null;
let lagGauge          = null;
let pendingGauge      = null;
let queryDurationGauge = null;
let slowQueryCounter  = null;

const SLOW_QUERY_THRESHOLD_S = 5; // queries longer than 5 s are "slow"

if (registry) {
  lastRunGauge = new promClient.Gauge({
    name:       'job_last_run_timestamp_seconds',
    help:       'Unix timestamp (seconds) of the last successful polling-job run',
    labelNames: ['job'],
    registers:  [registry],
  });

  lagGauge = new promClient.Gauge({
    name:       'job_lag_seconds',
    help:       'Seconds elapsed since the last successful polling-job run (consumer lag proxy)',
    labelNames: ['job'],
    registers:  [registry],
  });

  pendingGauge = new promClient.Gauge({
    name:       'job_pending_items_total',
    help:       'Number of unprocessed items found during the last polling-job run',
    labelNames: ['job'],
    registers:  [registry],
  });

  queryDurationGauge = new promClient.Gauge({
    name:       'job_last_query_duration_seconds',
    help:       'Duration (seconds) of the most recent DB poll query executed by a job',
    labelNames: ['job'],
    registers:  [registry],
  });

  slowQueryCounter = new promClient.Counter({
    name:       'job_slow_queries_total',
    help:       `Total DB queries that took longer than ${SLOW_QUERY_THRESHOLD_S} s inside a polling job`,
    labelNames: ['job'],
    registers:  [registry],
  });
}

/** Track last-run timestamps so lagGauge can be refreshed on scrape. */
const _lastRunMs = new Map();

/**
 * Call at the end of each successful poll tick.
 * @param {string} jobName  e.g. 'escalation_job'
 */
function recordJobRun(jobName) {
  const nowMs = Date.now();
  _lastRunMs.set(jobName, nowMs);
  if (lastRunGauge) lastRunGauge.labels(jobName).set(nowMs / 1000);
  if (lagGauge)     lagGauge.labels(jobName).set(0);
}

/**
 * Call with the count of items the job found waiting to be processed.
 * @param {string} jobName
 * @param {number} count
 */
function recordJobPending(jobName, count) {
  if (pendingGauge) pendingGauge.labels(jobName).set(count);
}

/**
 * Refresh lag gauges — call from a scrape-time hook or on a tight interval.
 * In practice, having `recordJobRun` set lag=0 and a separate 5-second ticker
 * update the lag is sufficient for Prometheus scrape intervals of 15 s.
 */
function refreshLagGauges() {
  if (!lagGauge) return;
  const nowMs = Date.now();
  for (const [jobName, lastMs] of _lastRunMs.entries()) {
    lagGauge.labels(jobName).set((nowMs - lastMs) / 1000);
  }
}

// Refresh lag every 5 seconds so Prometheus always sees a current value
/* istanbul ignore next */
if (registry) {
  setInterval(refreshLagGauges, 5_000).unref();
}

/**
 * Get the prom-client Registry for this module.
 * Merge into the server's main registry: mainRegistry.merge(jobMetricsRegistry())
 * @returns {import('prom-client').Registry | null}
 */
function jobMetricsRegistry() {
  return registry;
}

/**
 * Wrap a DB query call and automatically record its duration.
 * Usage:
 *   const rows = await recordQuery('escalation_job', () => db.query(...));
 *
 * @param {string}   jobName  e.g. 'escalation_job'
 * @param {Function} fn       Async function that executes the query
 * @returns {*} Whatever fn returns
 */
async function recordQuery(jobName, fn) {
  const startMs = Date.now();
  try {
    return await fn();
  } finally {
    const durationS = (Date.now() - startMs) / 1000;
    if (queryDurationGauge) queryDurationGauge.labels(jobName).set(durationS);
    if (slowQueryCounter && durationS >= SLOW_QUERY_THRESHOLD_S) {
      slowQueryCounter.labels(jobName).inc();
    }
  }
}

module.exports = { recordJobRun, recordJobPending, recordQuery, jobMetricsRegistry };
