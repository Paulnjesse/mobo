/**
 * MOBO — Large City Simulation
 *
 * What this tests:
 *   Simulates MOBO operating at peak urban scale — specifically Douala (Cameroon,
 *   ~3.5 M pop), Lagos (Nigeria, ~15 M), and Nairobi (Kenya, ~5 M).
 *
 *   User mix at city scale:
 *     - 15% drivers    — emit location every 2 s, accept/complete rides
 *     - 70% riders     — search drivers, request rides, rate drivers
 *     - 10% watchers   — open the map and stream nearby-driver updates
 *     -  5% admin      — read dashboards, generate reports
 *
 *   This reveals:
 *   a) PostGIS query performance under thousands of simultaneous radius queries
 *   b) Surge pricing calculation latency when demand/supply ratio spikes
 *   c) Redis / DB connection pool exhaustion at city scale
 *   d) Rate limiter behaviour when thousands of real IPs hit simultaneously
 *      (in production each user has a unique IP; in k6 all VUs share one IP,
 *       so we spread requests across proxy headers to simulate distributed load)
 *   e) Whether the API Gateway can sustain > 1 000 req/s throughput
 *
 * City scenarios:
 *   SMALL  city: 500  active users,  75 drivers  (e.g. Gabon/Cotonou)
 *   MEDIUM city: 2000 active users, 300 drivers  (e.g. Yaoundé / Abidjan)
 *   LARGE  city: 5000 active users, 750 drivers  (e.g. Douala / Nairobi)
 *
 * How to run:
 *   # Small city
 *   k6 run k6/load-test-large-city.js -e CITY=small \
 *       -e BASE_URL=http://localhost:3000 -e AUTH_TOKEN=<jwt>
 *
 *   # Large city (requires beefy machine — uses 5 000 VUs)
 *   k6 run k6/load-test-large-city.js -e CITY=large \
 *       -e BASE_URL=http://localhost:3000 -e AUTH_TOKEN=<jwt>
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom metrics ─────────────────────────────────────────────────────────
const fareRequests      = new Counter('city_fare_requests');
const nearbyRequests    = new Counter('city_nearby_driver_requests');
const rideRequests      = new Counter('city_ride_requests');
const surgeRequests     = new Counter('city_surge_zone_requests');
const rateErrors        = new Counter('city_rate_limit_429');
const serverErrors      = new Counter('city_server_errors_5xx');
const successRate       = new Rate('city_success_rate');
const fareLatency       = new Trend('city_fare_latency_ms', true);
const nearbyLatency     = new Trend('city_nearby_latency_ms', true);
const rideCreateLatency = new Trend('city_ride_create_latency_ms', true);
const activeVUs         = new Gauge('city_active_vus');

// ── City profiles ──────────────────────────────────────────────────────────
const CITY_PROFILES = {
  small: {
    name: 'Small city (500 users)',
    totalVUs: 500,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '60s', target: 300 },
      { duration: '60s', target: 500 },
      { duration: '120s', target: 500 },
      { duration: '30s', target: 0 },
    ],
  },
  medium: {
    name: 'Medium city (2 000 users)',
    totalVUs: 2000,
    stages: [
      { duration: '60s',  target: 500  },
      { duration: '60s',  target: 1000 },
      { duration: '60s',  target: 2000 },
      { duration: '180s', target: 2000 },
      { duration: '60s',  target: 0    },
    ],
  },
  large: {
    name: 'Large city (5 000 users — Douala / Lagos scale)',
    totalVUs: 5000,
    stages: [
      { duration: '60s',  target: 1000 },
      { duration: '60s',  target: 2500 },
      { duration: '60s',  target: 5000 },
      { duration: '300s', target: 5000 }, // 5-min peak
      { duration: '60s',  target: 1000 },
      { duration: '30s',  target: 0    },
    ],
  },
};

const CITY_SIZE = __ENV.CITY || 'small';
const profile   = CITY_PROFILES[CITY_SIZE] || CITY_PROFILES.small;

export const options = {
  stages: profile.stages,
  thresholds: {
    city_server_errors_5xx:     ['count<20'],
    http_req_failed:            ['rate<0.20'],  // up to 20% 429s expected at scale
    city_fare_latency_ms:       ['p(95)<5000'], // fare calcs may be slow at peak
    city_nearby_latency_ms:     ['p(95)<5000'], // PostGIS query under load
    city_ride_create_latency_ms: ['p(95)<8000'],
    city_success_rate:          ['rate>0.70'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN    = __ENV.AUTH_TOKEN || '';

// ── African city coordinate clusters ──────────────────────────────────────
const CITY_BOUNDS = [
  // Douala, Cameroon
  { lat: 4.0511, lng: 9.7679, spread: 0.10 },
  // Yaoundé, Cameroon
  { lat: 3.8480, lng: 11.5021, spread: 0.08 },
  // Lagos, Nigeria
  { lat: 6.5244, lng: 3.3792, spread: 0.15 },
  // Nairobi, Kenya
  { lat: -1.2921, lng: 36.8219, spread: 0.12 },
  // Abidjan, Ivory Coast
  { lat: 5.3600, lng: -4.0083, spread: 0.10 },
  // Libreville, Gabon
  { lat: 0.4162, lng: 9.4673, spread: 0.06 },
  // Cotonou, Benin
  { lat: 6.3703, lng: 2.3912, spread: 0.06 },
];

function randomLocation() {
  const city = CITY_BOUNDS[randomIntBetween(0, CITY_BOUNDS.length - 1)];
  return {
    lat: city.lat + (Math.random() - 0.5) * city.spread,
    lng: city.lng + (Math.random() - 0.5) * city.spread,
    city,
  };
}

// Simulate a unique client IP to reduce rate-limiting collisions
// (In production, each user has a real IP — this approximates that)
function spoofedHeaders(vuId) {
  const a = 10 + (vuId % 200);
  const b = (vuId >> 8) % 256;
  return {
    'Authorization':    `Bearer ${TOKEN}`,
    'Content-Type':     'application/json',
    'X-Forwarded-For':  `192.168.${a}.${b}`,
    'X-Request-ID':     `k6-city-${__VU}-${__ITER}`,
  };
}

// Determine user role based on VU number
function getRole() {
  const bucket = __VU % 100;
  if (bucket < 15) return 'driver';
  if (bucket < 85) return 'rider';
  if (bucket < 95) return 'watcher';
  return 'admin';
}

// ── DRIVER behaviour ──────────────────────────────────────────────────────
function driverBehaviour(headers) {
  const { lat, lng } = randomLocation();

  // POST location update (HTTP fallback path — primary is WebSocket)
  group('Driver: HTTP location update', () => {
    const res = http.post(
      `${BASE_URL}/v1/location/update`,
      JSON.stringify({
        latitude:  lat + (Math.random() - 0.5) * 0.002,
        longitude: lng + (Math.random() - 0.5) * 0.002,
        heading:   randomIntBetween(0, 359),
        speed:     randomIntBetween(10, 60),
        accuracy:  5,
      }),
      { headers, tags: { role: 'driver', action: 'location_update' } }
    );
    const ok = check(res, {
      'driver loc update: not 5xx': (r) => r.status < 500,
    });
    successRate.add(ok);
    if (res.status === 429) rateErrors.add(1);
    if (res.status >= 500)  serverErrors.add(1);
  });

  sleep(2); // drivers update every 2 s

  // Check assigned rides
  group('Driver: check ride assignments', () => {
    const res = http.get(
      `${BASE_URL}/v1/rides?status=accepted`,
      { headers, tags: { role: 'driver', action: 'check_rides' } }
    );
    check(res, { 'driver rides: 200 or 401': (r) => [200, 401].includes(r.status) });
    if (res.status >= 500) serverErrors.add(1);
  });

  sleep(1);
}

// ── RIDER behaviour ───────────────────────────────────────────────────────
function riderBehaviour(headers) {
  const loc = randomLocation();

  // 1. Check nearby drivers
  group('Rider: nearby drivers (PostGIS)', () => {
    const startTs = Date.now();
    const res = http.get(
      `${BASE_URL}/v1/location/nearby-drivers?lat=${loc.lat.toFixed(6)}&lng=${loc.lng.toFixed(6)}&radius=5000`,
      { headers, tags: { role: 'rider', action: 'nearby_drivers' } }
    );
    nearbyLatency.add(Date.now() - startTs);
    nearbyRequests.add(1);

    const ok = check(res, {
      'rider nearby: not 5xx': (r) => r.status < 500,
      'rider nearby: 200 or 401 or 429': (r) => [200, 401, 429].includes(r.status),
    });
    successRate.add(ok);
    if (res.status === 429) rateErrors.add(1);
    if (res.status >= 500)  serverErrors.add(1);
  });

  sleep(0.5);

  // 2. Get fare estimate
  group('Rider: fare estimate', () => {
    const dropoff = randomLocation();
    const startTs = Date.now();
    const res = http.get(
      `${BASE_URL}/v1/rides/fare` +
      `?pickup_lat=${loc.lat.toFixed(6)}&pickup_lng=${loc.lng.toFixed(6)}` +
      `&dropoff_lat=${dropoff.lat.toFixed(6)}&dropoff_lng=${dropoff.lng.toFixed(6)}` +
      `&ride_type=standard`,
      { headers, tags: { role: 'rider', action: 'fare_estimate' } }
    );
    fareLatency.add(Date.now() - startTs);
    fareRequests.add(1);

    const ok = check(res, {
      'rider fare: not 5xx':           (r) => r.status < 500,
      'rider fare: 200 or 401 or 429': (r) => [200, 401, 429].includes(r.status),
    });
    successRate.add(ok);
    if (res.status === 429) rateErrors.add(1);
    if (res.status >= 500)  serverErrors.add(1);
  });

  sleep(0.5);

  // 3. 30% of riders actually request a ride
  if (Math.random() < 0.30 && TOKEN) {
    group('Rider: request ride', () => {
      const dropoff = randomLocation();
      const startTs = Date.now();
      const res = http.post(
        `${BASE_URL}/v1/rides`,
        JSON.stringify({
          pickup_lat:   loc.lat,
          pickup_lng:   loc.lng,
          pickup_address: `${loc.city.name} pickup`,
          dropoff_lat:  dropoff.lat,
          dropoff_lng:  dropoff.lng,
          dropoff_address: `${dropoff.city.name} dropoff`,
          ride_type:    'standard',
          payment_method: 'wallet',
        }),
        { headers, tags: { role: 'rider', action: 'request_ride' } }
      );
      rideCreateLatency.add(Date.now() - startTs);
      rideRequests.add(1);

      check(res, {
        'ride request: not 5xx': (r) => r.status < 500,
      });
      if (res.status === 429) rateErrors.add(1);
      if (res.status >= 500)  serverErrors.add(1);
    });
    sleep(1);
  }

  sleep(1);
}

// ── MAP WATCHER behaviour ─────────────────────────────────────────────────
function watcherBehaviour(headers) {
  const loc = randomLocation();

  // Just polls nearby drivers — simulates someone looking at the map without riding
  group('Watcher: map polling', () => {
    const startTs = Date.now();
    const res = http.get(
      `${BASE_URL}/v1/location/nearby-drivers?lat=${loc.lat.toFixed(6)}&lng=${loc.lng.toFixed(6)}&radius=10000`,
      { headers, tags: { role: 'watcher', action: 'map_poll' } }
    );
    nearbyLatency.add(Date.now() - startTs);
    nearbyRequests.add(1);

    const ok = check(res, { 'watcher: not 5xx': (r) => r.status < 500 });
    successRate.add(ok);
    if (res.status === 429) rateErrors.add(1);
    if (res.status >= 500)  serverErrors.add(1);
  });

  sleep(5); // watchers poll every 5 s
}

// ── ADMIN behaviour ───────────────────────────────────────────────────────
function adminBehaviour(headers) {
  group('Admin: health + metrics', () => {
    const h = http.get(`${BASE_URL}/health`, { headers });
    check(h, { 'admin health 200': (r) => r.status === 200 });
  });

  sleep(10); // admins are infrequent
}

// ── Main entry ────────────────────────────────────────────────────────────
export default function () {
  activeVUs.add(1);
  const role    = getRole();
  const headers = spoofedHeaders(__VU);

  switch (role) {
    case 'driver':  driverBehaviour(headers);  break;
    case 'rider':   riderBehaviour(headers);   break;
    case 'watcher': watcherBehaviour(headers); break;
    case 'admin':   adminBehaviour(headers);   break;
  }

  activeVUs.add(-1);
}

// ── Summary ───────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const totalReqs    = data.metrics.http_reqs?.values?.count ?? 0;
  const rps          = data.metrics.http_reqs?.values?.rate?.toFixed(1) ?? 'n/a';
  const p95Fare      = data.metrics.city_fare_latency_ms?.values?.['p(95)']?.toFixed(0) ?? 'n/a';
  const p95Nearby    = data.metrics.city_nearby_latency_ms?.values?.['p(95)']?.toFixed(0) ?? 'n/a';
  const p95Ride      = data.metrics.city_ride_create_latency_ms?.values?.['p(95)']?.toFixed(0) ?? 'n/a';
  const rl           = data.metrics.city_rate_limit_429?.values?.count ?? 0;
  const e5xx         = data.metrics.city_server_errors_5xx?.values?.count ?? 0;
  const successPct   = ((data.metrics.city_success_rate?.values?.rate ?? 0) * 100).toFixed(1);

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║      MOBO — Large City Simulation: ${profile.name.padEnd(22)}║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Total HTTP requests   : ${String(totalReqs).padEnd(34)}║`);
  console.log(`║  Peak throughput       : ${String(rps + ' req/s').padEnd(34)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Latency p95:                                            ║`);
  console.log(`║    Fare estimate       : ${String(p95Fare + ' ms').padEnd(34)}║`);
  console.log(`║    Nearby drivers      : ${String(p95Nearby + ' ms').padEnd(34)}║`);
  console.log(`║    Ride creation       : ${String(p95Ride + ' ms').padEnd(34)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Success rate          : ${String(successPct + '%').padEnd(34)}║`);
  console.log(`║  Rate-limited (429s)   : ${String(rl).padEnd(34)}║`);
  console.log(`║  Server errors (5xx)   : ${String(e5xx).padEnd(34)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Bottleneck guide:                                       ║');
  console.log('║  > p95 nearby > 2 s  → PostGIS index or DB pool issue   ║');
  console.log('║  > p95 fare > 1 s    → surge calc or ride-service CPU    ║');
  console.log('║  > many 429s         → add more server instances         ║');
  console.log('║  > any 5xx           → crash or unhandled error — fix!   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  return {
    'k6/results-large-city.json': JSON.stringify(data, null, 2),
  };
}
