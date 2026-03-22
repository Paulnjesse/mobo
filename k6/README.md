# MOBO Load Tests (k6)

## Prerequisites
Install k6: https://k6.io/docs/getting-started/installation/

## Run tests

### Ride endpoints load test
```bash
k6 run k6/load-test-rides.js \
  -e BASE_URL=https://api.mobo.cm \
  -e AUTH_TOKEN=<your_jwt_token>
```

### Payment endpoints load test
```bash
k6 run k6/load-test-payments.js \
  -e BASE_URL=https://api.mobo.cm \
  -e AUTH_TOKEN=<your_jwt_token>
```

### Smoke test (low load sanity check)
```bash
k6 run --vus 1 --duration 30s k6/load-test-rides.js
```

## Thresholds
- Ride endpoints: p95 < 500ms, error rate < 1%
- Payment endpoints: p95 < 1000ms, error rate < 1%
