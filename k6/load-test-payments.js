import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m',  target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // payments can be slower
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN    = __ENV.AUTH_TOKEN || '';

export default function () {
  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  // Test 1: Payment history
  const histRes = http.get(`${BASE_URL}/v1/payments/history`, { headers });
  check(histRes, { 'payment history 200/401': (r) => [200, 401].includes(r.status) });
  errorRate.add(![200, 401].includes(histRes.status));

  sleep(1);

  // Test 2: Loyalty points
  const loyaltyRes = http.get(`${BASE_URL}/v1/payments/loyalty`, { headers });
  check(loyaltyRes, { 'loyalty 200/401': (r) => [200, 401].includes(r.status) });

  sleep(1);

  // Test 3: Wallet balance
  const walletRes = http.get(`${BASE_URL}/v1/payments/wallet`, { headers });
  check(walletRes, { 'wallet 200/401': (r) => [200, 401].includes(r.status) });

  sleep(1);

  // Test 4: Stripe payment intent (requires valid ride_id and auth)
  const intentRes = http.post(
    `${BASE_URL}/v1/payments/stripe/payment-intent`,
    JSON.stringify({ ride_id: 1 }),
    { headers }
  );
  check(intentRes, { 'stripe intent not 500': (r) => r.status !== 500 });

  sleep(2);
}
