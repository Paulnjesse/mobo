import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up to 20 users
    { duration: '1m',  target: 50 },   // hold at 50 users
    { duration: '30s', target: 100 },  // spike to 100 users
    { duration: '1m',  target: 100 },  // hold spike
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed:   ['rate<0.01'],  // less than 1% failure rate
    errors:            ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN    = __ENV.AUTH_TOKEN || '';

export default function () {
  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  // Test 1: Fare estimate
  const fareRes = http.get(
    `${BASE_URL}/v1/rides/fare?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516&ride_type=standard`,
    { headers }
  );
  check(fareRes, { 'fare estimate 200': (r) => r.status === 200 });
  errorRate.add(fareRes.status !== 200);

  sleep(0.5);

  // Test 2: Nearby drivers
  const driversRes = http.get(
    `${BASE_URL}/v1/location/nearby-drivers?lat=3.848&lng=11.502&radius=5000`,
    { headers }
  );
  check(driversRes, { 'nearby drivers 200': (r) => r.status === 200 });
  errorRate.add(driversRes.status !== 200);

  sleep(0.5);

  // Test 3: Ride history
  const historyRes = http.get(`${BASE_URL}/v1/rides`, { headers });
  check(historyRes, { 'ride history 200/401': (r) => [200, 401].includes(r.status) });

  sleep(1);
}
