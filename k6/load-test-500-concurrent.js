/**
 * MOBO — 500 Concurrent Connection Load Test
 *
 * What this tests:
 *   - Can the API Gateway + downstream services sustain 500 simultaneous HTTP
 *     connections without crashing, shedding connections, or exhausting the
 *     PostgreSQL connection pool (max = 20 per service)?
 *   - Does the global rate limiter (200 req / 15 min / IP) correctly gate the
 *     flood and return 429 instead of 5xx?
 *   - What is the median and p99 latency at 500 VUs versus the baseline (20 VUs)?
 *
 * How to run:
 *   k6 run k6/load-test-500-concurrent.js \
 *       -e BASE_URL=http://localhost:3000 \
 *       -e AUTH_TOKEN=<jwt>
 *
 * Pass --out influxdb=http://localhost:8086/k6 to stream results to Grafana.
 *
 * Expected behaviour (single-instance, no Redis):
 *   - Requests above 200/15 min/IP → 429  (global limiter)
 *   - DB pool (max 20) forces queuing inside Node.js — expect p99 spike ~2–5s
 *   - No 502/503/504 = service is alive; 429 flood = rate limiters are working
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Custom metrics ─────────────────────────────────────────────────────────
const rateLimitedReqs  = new Counter('rate_limited_429');
const serverErrors     = new Counter('server_errors_5xx');
const successRate      = new Rate('success_rate');
const fareLatency      = new Trend('fare_estimate_latency', true);
const driversLatency   = new Trend('nearby_drivers_latency', true);
const healthLatency    = new Trend('health_check_latency', true);

// ── Test configuration ─────────────────────────────────────────────────────
export const options = {
  stages: [
    // Warm-up — establish baseline
    { duration: '30s',  target: 50  },
    { duration: '30s',  target: 100 },
    // Ramp to target
    { duration: '60s',  target: 250 },
    { duration: '60s',  target: 500 },
    // Sustain — hold peak for 2 minutes
    { duration: '120s', target: 500 },
    // Gradual ramp-down — check recovery
    { duration: '60s',  target: 100 },
    { duration: '30s',  target: 0   },
  ],
  thresholds: {
    // Service is up and responding
    http_req_failed:          ['rate<0.15'],   // allow up to 15% 429s — expected at 500 VUs
    server_errors_5xx:        ['count<10'],    // zero crashes allowed (< 10 total 5xx)
    // Latency — looser under extreme load, tightened for warm-up phase
    http_req_duration:        ['p(95)<3000'],  // p95 under 3 s at 500 VUs
    fare_estimate_latency:    ['p(95)<2000'],
    nearby_drivers_latency:   ['p(95)<2000'],
    health_check_latency:     ['p(99)<200'],   // health must always be fast
    // Business metric
    success_rate:             ['rate>0.70'],   // at least 70% of requests succeed
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN    = __ENV.AUTH_TOKEN || '';

// African city coordinates used in all geo queries
// Douala (Cameroon) — largest target city
const CITIES = [
  { name: 'Douala',    lat: 4.0511,  lng: 9.7679  },
  { name: 'Yaoundé',   lat: 3.8480,  lng: 11.5021 },
  { name: 'Lagos',     lat: 6.5244,  lng: 3.3792  },
  { name: 'Nairobi',   lat: -1.2921, lng: 36.8219 },
  { name: 'Abidjan',   lat: 5.3600,  lng: -4.0083 },
];

function randomCity() {
  return CITIES[Math.floor(Math.random() * CITIES.length)];
}

// ── Main scenario ──────────────────────────────────────────────────────────
export default function () {
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'X-Request-ID': `k6-${__VU}-${__ITER}`,
  };
  const city = randomCity();

  // 1. Health check — must always respond quickly regardless of load
  group('Health Checks', () => {
    const startTs = Date.now();
    const res = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health' } });
    healthLatency.add(Date.now() - startTs);
    const ok = check(res, { 'health 200': (r) => r.status === 200 });
    successRate.add(ok);
    if (res.status >= 500) serverErrors.add(1);
  });

  sleep(0.1);

  // 2. Fare estimate — no auth required, hits ride-service via gateway
  group('Fare Estimate', () => {
    const startTs = Date.now();
    const res = http.get(
      `${BASE_URL}/v1/rides/fare?pickup_lat=${city.lat}&pickup_lng=${city.lng}` +
      `&dropoff_lat=${city.lat + 0.02}&dropoff_lng=${city.lng + 0.02}&ride_type=standard`,
      { headers, tags: { endpoint: 'fare' } }
    );
    fareLatency.add(Date.now() - startTs);

    const ok = check(res, {
      'fare 200 or 401':    (r) => [200, 401].includes(r.status),
      'fare not 5xx':       (r) => r.status < 500,
      'fare not crashed':   (r) => r.status !== 503,
    });
    successRate.add(ok);
    if (res.status === 429) rateLimitedReqs.add(1);
    if (res.status >= 500)  serverErrors.add(1);
  });

  sleep(0.2);

  // 3. Nearby drivers — geospatial PostGIS query, most expensive DB call
  group('Nearby Drivers (PostGIS)', () => {
    const startTs = Date.now();
    const res = http.get(
      `${BASE_URL}/v1/location/nearby-drivers?lat=${city.lat}&lng=${city.lng}&radius=5000`,
      { headers, tags: { endpoint: 'nearby_drivers' } }
    );
    driversLatency.add(Date.now() - startTs);

    const ok = check(res, {
      'drivers 200 or 401':  (r) => [200, 401].includes(r.status),
      'drivers not 5xx':     (r) => r.status < 500,
    });
    successRate.add(ok);
    if (res.status === 429) rateLimitedReqs.add(1);
    if (res.status >= 500)  serverErrors.add(1);
  });

  sleep(0.3);

  // 4. Ride history — authenticated, hits DB
  group('Authenticated Ride History', () => {
    if (!TOKEN) return; // skip if no token provided
    const res = http.get(`${BASE_URL}/v1/rides`, { headers, tags: { endpoint: 'rides' } });
    const ok = check(res, {
      'rides 200 or 401': (r) => [200, 401].includes(r.status),
      'rides not 5xx':    (r) => r.status < 500,
    });
    successRate.add(ok);
    if (res.status === 429) rateLimitedReqs.add(1);
    if (res.status >= 500)  serverErrors.add(1);
  });

  sleep(0.5);
}

// ── Lifecycle hooks ────────────────────────────────────────────────────────
export function handleSummary(data) {
  const rps = data.metrics.http_reqs?.values?.rate?.toFixed(1) ?? 'n/a';
  const p95 = data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(0) ?? 'n/a';
  const p99 = data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(0) ?? 'n/a';
  const rl  = data.metrics.rate_limited_429?.values?.count ?? 0;
  const e5  = data.metrics.server_errors_5xx?.values?.count ?? 0;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       MOBO — 500-Concurrent Connection Results           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Peak VUs          : 500                                 ║`);
  console.log(`║  Throughput        : ${String(rps + ' req/s').padEnd(40)}║`);
  console.log(`║  Latency p95       : ${String(p95 + ' ms').padEnd(40)}║`);
  console.log(`║  Latency p99       : ${String(p99 + ' ms').padEnd(40)}║`);
  console.log(`║  Rate-limited 429s : ${String(rl).padEnd(40)}║`);
  console.log(`║  Server errors 5xx : ${String(e5).padEnd(40)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  return {
    'k6/results-500-concurrent.json': JSON.stringify(data, null, 2),
  };
}
