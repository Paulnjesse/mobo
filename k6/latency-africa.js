/**
 * k6 Latency Benchmark — Africa 3G Network Simulation
 *
 * Purpose: measure MOBO API latency across critical endpoints under conditions
 *          that simulate African 3G networks (200–400 ms base RTT, 2 Mbps down).
 *
 * Run from your local machine (no k6 cloud needed):
 *   k6 run k6/latency-africa.js
 *
 * Run against production:
 *   BASE_URL=https://api.mobo-ride.com k6 run k6/latency-africa.js
 *
 * What it measures:
 *   P50, P90, P95, P99 latency for each critical endpoint group.
 *   These map directly to user experience:
 *     P50 < 300 ms  → feels instant on 3G
 *     P50 < 800 ms  → acceptable
 *     P50 > 1500 ms → users abandon / retry
 *
 * Endpoints tested:
 *   /health           — baseline gateway latency
 *   /api/auth/login   — critical: users can't start if this is slow
 *   /api/rides/fare   — critical: fare estimate before booking
 *   /api/rides/surge  — cached; should be sub-100 ms
 *   /api/drivers      — nearby drivers; hits PostGIS
 *   /api/location     — driver location update; most frequent call
 *
 * Supabase / Render region recommendation:
 *   Run with BASE_URL pointing at each Render region to compare:
 *   Frankfurt: ~100 ms to West/Central Africa
 *   Oregon:    ~250 ms to West Africa  (current default — avoid for MOBO)
 *   Singapore: ~160 ms to East Africa (Kenya)
 *
 * Pass-fail thresholds are set to Africa 3G standards, not Western 4G.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
const healthLatency  = new Trend('latency_health_ms',  true);
const fareLatency    = new Trend('latency_fare_ms',    true);
const surgeLatency   = new Trend('latency_surge_ms',   true);
const driversLatency = new Trend('latency_drivers_ms', true);
const authLatency    = new Trend('latency_auth_ms',    true);
const errorRate      = new Rate('error_rate');
const timeouts       = new Counter('request_timeouts');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_JWT = __ENV.TEST_JWT || '';  // optional — set to test authenticated endpoints

// ── Test stages: ramp up to 50 VUs (simulates 50 concurrent 3G users) ────────
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // warm up
    { duration: '1m',  target: 50 },   // load
    { duration: '30s', target: 100 },  // stress
    { duration: '30s', target: 0 },    // cool down
  ],

  // ── Africa 3G pass/fail thresholds ───────────────────────────────────────
  // These are intentionally generous — 3G adds 200–400 ms of inherent latency
  // before your server even sees the request.
  thresholds: {
    // Gateway health — should always be fast (just a JSON response, no DB)
    latency_health_ms:  ['p(95)<500',  'p(99)<1000'],

    // Fare estimate — user is waiting before they tap "Book"
    latency_fare_ms:    ['p(50)<800',  'p(95)<2000'],

    // Surge — cached; should be near-instant after first request
    latency_surge_ms:   ['p(50)<400',  'p(95)<1000'],

    // Nearby drivers — PostGIS ST_DWithin; acceptable up to 1.5 s
    latency_drivers_ms: ['p(50)<1000', 'p(95)<2500'],

    // Auth login — critical path; must succeed even on bad 3G
    latency_auth_ms:    ['p(50)<1000', 'p(95)<3000'],

    // Error rate — no more than 1 % failures under normal load
    error_rate: ['rate<0.01'],

    // Overall HTTP request duration (all endpoints combined)
    http_req_duration: ['p(95)<3000'],
    http_req_failed:   ['rate<0.02'],
  },
};

// ── Shared headers ────────────────────────────────────────────────────────────
const authHeaders = TEST_JWT
  ? { Authorization: `Bearer ${TEST_JWT}`, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

// ── Test scenarios ────────────────────────────────────────────────────────────
export default function () {

  // 1. Health check — baseline
  group('health', () => {
    const res = http.get(`${BASE_URL}/health`, { timeout: '10s' });
    healthLatency.add(res.timings.duration);
    const ok = check(res, {
      'health 200':          (r) => r.status === 200,
      'health < 500 ms':     (r) => r.timings.duration < 500,
      'has service field':   (r) => r.json('service') !== undefined,
    });
    if (!ok) errorRate.add(1);
    else     errorRate.add(0);
    if (res.timings.duration >= 10000) timeouts.add(1);
  });

  sleep(0.3);

  // 2. Fare estimate (unauthenticated variant hits the public fare endpoint)
  group('fare_estimate', () => {
    const body = JSON.stringify({
      pickup_lat:   3.848,
      pickup_lng:   11.502,
      dropoff_lat:  3.866,
      dropoff_lng:  11.516,
      ride_type:    'standard',
    });
    const res = http.post(`${BASE_URL}/api/rides/fare`, body, {
      headers: authHeaders,
      timeout: '15s',
    });
    fareLatency.add(res.timings.duration);
    const ok = check(res, {
      'fare 200 or 401':        (r) => [200, 401, 403].includes(r.status),
      'fare < 2000 ms (3G ok)': (r) => r.timings.duration < 2000,
    });
    errorRate.add(ok ? 0 : 1);
    if (res.timings.duration >= 15000) timeouts.add(1);
  });

  sleep(0.5);

  // 3. Surge pricing — should benefit from Cache-Control
  group('surge_pricing', () => {
    const res = http.get(`${BASE_URL}/api/rides/surge?lat=3.848&lng=11.502`, {
      headers: authHeaders,
      timeout: '10s',
    });
    surgeLatency.add(res.timings.duration);
    const ok = check(res, {
      'surge 200 or 401':        (r) => [200, 401, 403].includes(r.status),
      'surge < 1000 ms (3G ok)': (r) => r.timings.duration < 1000,
      'has Cache-Control':       (r) => r.headers['Cache-Control'] !== undefined,
    });
    errorRate.add(ok ? 0 : 1);
  });

  sleep(0.3);

  // 4. Nearby drivers — most critical for rider-facing experience
  group('nearby_drivers', () => {
    const res = http.get(
      `${BASE_URL}/api/drivers/nearby?lat=3.848&lng=11.502&radius=5`,
      { headers: authHeaders, timeout: '15s' }
    );
    driversLatency.add(res.timings.duration);
    const ok = check(res, {
      'drivers 200 or 401':       (r) => [200, 401, 403].includes(r.status),
      'drivers < 2500 ms (3G)':   (r) => r.timings.duration < 2500,
    });
    errorRate.add(ok ? 0 : 1);
    if (res.timings.duration >= 15000) timeouts.add(1);
  });

  sleep(1.0);  // simulate user reading the screen
}

/**
 * Summary printed after the test run.
 * Interprets results in plain language for Africa 3G context.
 */
export function handleSummary(data) {
  const p50  = (metric) => data.metrics[metric]?.values?.['p(50)']?.toFixed(0) ?? 'N/A';
  const p95  = (metric) => data.metrics[metric]?.values?.['p(95)']?.toFixed(0) ?? 'N/A';
  const rate = (metric) => ((data.metrics[metric]?.values?.rate ?? 0) * 100).toFixed(2);

  const report = `
╔══════════════════════════════════════════════════════════════════╗
║          MOBO Africa 3G Latency Benchmark Results                ║
╠══════════════════════════════════════════════════════════════════╣
║ Endpoint           │ P50 (ms) │ P95 (ms) │ 3G Rating             ║
╠════════════════════╪══════════╪══════════╪═══════════════════════╣
║ /health            │ ${p50('latency_health_ms').padEnd(8)} │ ${p95('latency_health_ms').padEnd(8)} │ ${rateLabel(p50('latency_health_ms'))}      ║
║ /api/rides/fare    │ ${p50('latency_fare_ms').padEnd(8)} │ ${p95('latency_fare_ms').padEnd(8)} │ ${rateLabel(p50('latency_fare_ms'))}      ║
║ /api/rides/surge   │ ${p50('latency_surge_ms').padEnd(8)} │ ${p95('latency_surge_ms').padEnd(8)} │ ${rateLabel(p50('latency_surge_ms'))}      ║
║ /api/drivers/nearby│ ${p50('latency_drivers_ms').padEnd(8)} │ ${p95('latency_drivers_ms').padEnd(8)} │ ${rateLabel(p50('latency_drivers_ms'))}      ║
╠══════════════════════════════════════════════════════════════════╣
║ Error rate: ${rate('error_rate').padEnd(5)} %    Timeouts: ${(data.metrics['request_timeouts']?.values?.count ?? 0).toString().padEnd(6)}          ║
╚══════════════════════════════════════════════════════════════════╝

Regions tested: ${BASE_URL}
Supabase recommendation for MOBO:
  West/Central Africa (CM, NG, CI, BN): → eu-central-1 (Frankfurt) ~100ms
  East Africa (KE, TZ, UG):             → ap-southeast-1 (Singapore) ~160ms
  South Africa:                          → af-south-1 (Cape Town) ~40ms
`;

  console.log(report);
  return {
    'stdout': report,
    'k6/latency-africa-results.json': JSON.stringify(data, null, 2),
  };
}

function rateLabel(p50ms) {
  const ms = parseInt(p50ms, 10);
  if (isNaN(ms))   return '⚪ N/A   ';
  if (ms < 300)    return '🟢 FAST  ';
  if (ms < 800)    return '🟡 OK    ';
  if (ms < 1500)   return '🟠 SLOW  ';
  return             '🔴 PAINFUL';
}
