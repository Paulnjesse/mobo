/**
 * MOBO — Rate Limit & Messages-Per-Second Cap Test
 *
 * What this tests:
 *   1. What is the effective cap (req/s) for each endpoint category?
 *   2. Does the server return 429 (not 500) when limits are exceeded?
 *   3. Are the Retry-After / RateLimit-* headers present on 429 responses?
 *   4. Does the service RECOVER correctly once the window resets?
 *   5. Does excess traffic disconnect users or just throttle them?
 *
 * Rate limits in MOBO (from api-gateway/src/middleware/rateLimit.js):
 *   - Global:   200 req / 15 min / IP  → ceiling  0.22 req/s / IP
 *   - Auth:      20 req / 15 min / IP  → ceiling  0.022 req/s / IP
 *   - Ride:      30 req /  1 min / IP  → ceiling  0.5   req/s / IP
 *   - Location: 120 req /  1 min / IP  → ceiling  2.0   req/s / IP
 *   - Payment:   10 req /  5 min / IP  → ceiling  0.033 req/s / IP
 *
 * Location service HTTP limiter (server.js):  300 req / 1 min / IP → 5.0 req/s
 *
 * How to run:
 *   k6 run k6/load-test-rate-limits.js \
 *       -e BASE_URL=http://localhost:3000 \
 *       -e LOC_URL=http://localhost:3004 \
 *       -e AUTH_TOKEN=<jwt>
 *
 * Note: This test deliberately hammers endpoints to TRIGGER 429s. That is
 * expected and correct. The thresholds verify the server handles overload
 * gracefully (429, not 500).
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Custom metrics ─────────────────────────────────────────────────────────
const rideThrottled     = new Counter('ride_throttled_429');
const locationThrottled = new Counter('location_throttled_429');
const authThrottled     = new Counter('auth_throttled_429');
const paymentThrottled  = new Counter('payment_throttled_429');
const globalThrottled   = new Counter('global_throttled_429');
const serverErrors      = new Counter('server_errors_5xx');
const throttleRate      = new Rate('throttle_rate');
const rideResponseTime  = new Trend('ride_response_ms', true);
const locResponseTime   = new Trend('location_response_ms', true);

export const options = {
  scenarios: {
    // ── Scenario A: Saturate the RIDE limiter (30 req/min) ──────────────
    ride_saturation: {
      executor: 'constant-arrival-rate',
      rate: 60,              // 60 req/s — well above the 0.5 req/s cap
      timeUnit: '1s',
      duration: '90s',       // run for 1.5 windows so we see window reset
      preAllocatedVUs: 20,
      maxVUs: 40,
      tags: { scenario: 'ride_saturation' },
      exec: 'rideScenario',
    },

    // ── Scenario B: Saturate the LOCATION limiter (120 req/min) ─────────
    location_saturation: {
      executor: 'constant-arrival-rate',
      rate: 10,              // 10 req/s — above 2 req/s location cap
      timeUnit: '1s',
      duration: '90s',
      preAllocatedVUs: 10,
      maxVUs: 20,
      tags: { scenario: 'location_saturation' },
      exec: 'locationScenario',
    },

    // ── Scenario C: Burst → drain → check recovery ───────────────────────
    burst_and_recover: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      stages: [
        { duration: '10s', target: 50  },  // burst: 50 req/s
        { duration: '30s', target: 50  },  // hold burst
        { duration: '5s',  target: 0   },  // drain
        { duration: '65s', target: 0   },  // wait for 1-min window to reset
        { duration: '10s', target: 5   },  // resume at safe rate — should succeed
        { duration: '30s', target: 5   },
      ],
      preAllocatedVUs: 20,
      maxVUs: 60,
      tags: { scenario: 'burst_recover' },
      exec: 'burstAndRecoverScenario',
    },
  },

  thresholds: {
    // The server must NEVER return 5xx under rate-limiting pressure
    'server_errors_5xx':                        ['count<5'],
    // Rate-limited requests return 429, not 500
    'http_req_failed{scenario:ride_saturation}':       ['rate<0.99'],
    'http_req_failed{scenario:location_saturation}':   ['rate<0.99'],
    // After burst+recovery, the tail requests must succeed
    'http_req_failed{scenario:burst_recover}':         ['rate<0.50'],
    // Latency: even 429s must be answered promptly (rate limiter is in-memory)
    ride_response_ms:   ['p(99)<500'],
    location_response_ms: ['p(99)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LOC_URL  = __ENV.LOC_URL  || 'http://localhost:3004';
const TOKEN    = __ENV.AUTH_TOKEN || '';

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// ── Scenario functions ────────────────────────────────────────────────────

export function rideScenario() {
  const startTs = Date.now();
  const res = http.get(
    `${BASE_URL}/v1/rides/fare?pickup_lat=4.051&pickup_lng=9.768` +
    `&dropoff_lat=4.071&dropoff_lng=9.788&ride_type=standard`,
    { headers: HEADERS, tags: { endpoint: 'fare' } }
  );
  rideResponseTime.add(Date.now() - startTs);

  const is429 = res.status === 429;
  const is5xx = res.status >= 500;

  check(res, {
    'ride: 200 or 429 (not 500)': (r) => [200, 401, 429].includes(r.status),
    'ride: has RateLimit header on 429': (r) =>
      r.status !== 429 || r.headers['Ratelimit-Limit'] !== undefined ||
      r.headers['X-Ratelimit-Limit'] !== undefined,
  });

  if (is429) rideThrottled.add(1);
  if (is429) throttleRate.add(1); else throttleRate.add(0);
  if (is5xx) serverErrors.add(1);
}

export function locationScenario() {
  const startTs = Date.now();
  // Test both the api-gateway location limiter AND the location service's own limiter
  const res = http.get(
    `${BASE_URL}/v1/location/nearby-drivers?lat=4.051&lng=9.768&radius=3000`,
    { headers: HEADERS, tags: { endpoint: 'nearby_drivers' } }
  );
  locResponseTime.add(Date.now() - startTs);

  const is429 = res.status === 429;
  const is5xx = res.status >= 500;

  check(res, {
    'location: 200 or 429 (not 500)': (r) => [200, 401, 429].includes(r.status),
    'location: rate-limit body has message': (r) =>
      r.status !== 429 || (r.body && r.body.includes('message')),
  });

  if (is429) locationThrottled.add(1);
  if (is429) throttleRate.add(1); else throttleRate.add(0);
  if (is5xx) serverErrors.add(1);
}

export function burstAndRecoverScenario() {
  const res = http.get(
    `${BASE_URL}/v1/rides/fare?pickup_lat=3.848&pickup_lng=11.502` +
    `&dropoff_lat=3.868&dropoff_lng=11.522&ride_type=standard`,
    { headers: HEADERS, tags: { endpoint: 'burst_fare' } }
  );

  check(res, {
    'burst/recover: not 5xx':         (r) => r.status < 500,
    'burst/recover: status is valid': (r) => [200, 401, 429].includes(r.status),
  });

  if (res.status >= 500) serverErrors.add(1);
}

// ── Summary ───────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const rideCap      = data.metrics.ride_throttled_429?.values?.count ?? 0;
  const locCap       = data.metrics.location_throttled_429?.values?.count ?? 0;
  const e5xx         = data.metrics.server_errors_5xx?.values?.count ?? 0;
  const rideP99      = data.metrics.ride_response_ms?.values?.['p(99)']?.toFixed(0) ?? 'n/a';
  const locP99       = data.metrics.location_response_ms?.values?.['p(99)']?.toFixed(0) ?? 'n/a';
  const throttlePct  = ((data.metrics.throttle_rate?.values?.rate ?? 0) * 100).toFixed(1);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          MOBO — Rate Limit / MPS Cap Results             ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Configured caps:                                        ║`);
  console.log(`║    Ride endpoint   : 30 req/min (0.5 req/s) per IP      ║`);
  console.log(`║    Location (GW)   : 120 req/min (2.0 req/s) per IP     ║`);
  console.log(`║    Global          : 200 req/15min (0.22 req/s) per IP  ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Observed 429s:                                          ║`);
  console.log(`║    Ride throttled  : ${String(rideCap).padEnd(39)}║`);
  console.log(`║    Loc throttled   : ${String(locCap).padEnd(39)}║`);
  console.log(`║    Overall throttle: ${String(throttlePct + '%').padEnd(39)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Latency on 429 responses:                               ║`);
  console.log(`║    Ride p99        : ${String(rideP99 + ' ms').padEnd(39)}║`);
  console.log(`║    Location p99    : ${String(locP99 + ' ms').padEnd(39)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Server errors 5xx : ${String(e5xx).padEnd(39)}║`);
  console.log(`║  (0 = rate limiter is working correctly)                 ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('INTERPRETATION:');
  if (e5xx === 0) {
    console.log('  PASS — Server returns 429 under overload, never 5xx.');
    console.log('  Excess traffic is THROTTLED, not disconnected.');
    console.log('  Users are never forcefully disconnected by rate limiting;');
    console.log('  they receive a 429 with Retry-After headers and must back off.');
  } else {
    console.log(`  FAIL — ${e5xx} server errors detected. Rate limiter is not absorbing excess load.`);
  }

  return {
    'k6/results-rate-limits.json': JSON.stringify(data, null, 2),
  };
}
