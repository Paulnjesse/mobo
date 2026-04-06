# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MOBO** is a production-grade ride-hailing platform targeting African markets (Cameroon, Nigeria, Kenya, Ivory Coast, South Africa, Gabon, Benin, Niger). Currency is XAF (West/Central African CFA Francs), stored as integers — never use decimals.

## Development Commands

### Running the Full Stack Locally (Recommended)
```bash
docker-compose up --build      # Start all services + PostgreSQL + Redis + Unleash
docker-compose down -v         # Stop and remove volumes
```

### Running Individual Services
Each microservice follows the same pattern:
```bash
cd services/<service-name>
npm install
npm run dev       # nodemon (watch mode)
npm start         # production
npm test          # Jest tests
```

### Admin Dashboard
```bash
cd admin && npm start          # Dev server (port 3005)
cd admin && npm run build      # Production build
```

### ML Service (Python)
```bash
cd services/ml-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

### Running a Single Test
```bash
cd services/<service-name>
npx jest --testEnvironment node --forceExit --testPathPattern="<filename>"
```

### Monitoring Stack
```bash
docker-compose -f docker-compose.monitoring.yml up    # Prometheus + Grafana
```

## Service Architecture

All services are Express.js (Node.js 18+) except the ML service (FastAPI/Python). All run independently but communicate via the API Gateway.

| Service | Port | Responsibility |
|---------|------|----------------|
| api-gateway | 3000 | JWT auth, routing, rate limiting, OpenTelemetry |
| user-service | 3001 | Auth (JWT/OTP/OAuth), profiles, fleet management |
| ride-service | 3002 | Ride lifecycle, fare calculation, surge pricing |
| payment-service | 3003 | Wallets, Flutterwave/MTN MoMo/Orange Money/Stripe |
| location-service | 3004 | Real-time GPS tracking via Socket.IO |
| ml-service | 8000 | Fraud detection (4 scikit-learn models, FastAPI) |

**Shared utilities** live in `services/shared/` and are referenced via relative paths. Key modules:
- `circuitBreaker.js` — Opossum circuit breaker for inter-service calls
- `fieldEncryption.js` — Field-level encryption for sensitive DB columns
- `fraudDetection.js` — Integrates with ml-service for real-time fraud scoring
- `internalAuth.js` / `mtlsClient.js` — mTLS for service-to-service auth
- `featureFlags.js` — Unleash feature flag client
- `logger.js` — Winston structured logging (never use `console.log`)
- `redis.js` — Shared Redis connection pool

## Database

PostgreSQL 15+ with PostGIS extension. 19 migration files in `database/migration_*.sql` (cumulative). Schema initialized via `database/init.sql`.

- Use PostGIS for any geographic queries (nearby drivers, surge zones)
- All queries must be parameterized — no string interpolation in SQL
- Connection pooling via `pg` Pool; read replicas are configured in production

## Coding Standards (Enforced by CI)

- **Async/await** with try/catch — no raw Promise chains
- **Structured logging**: use `logger.info/warn/error` from `services/shared/logger.js`
- **Parameterized SQL**: `pool.query('SELECT ... WHERE id = $1', [id])` — never template literals in queries
- **XAF currency**: always integers, never floats
- **Input validation**: use `express-validator` at route level
- **Error tracking**: Sentry is configured in each service — let it capture unhandled errors

## CI/CD Pipeline

`.github/workflows/ci.yml` runs on every push:
1. ESLint with `eslint-plugin-security` — security-focused lint rules enforced
2. Secret detection (Gitleaks)
3. SAST + SCA (`npm audit`) — zero critical/high CVEs allowed on `main`
4. Unit tests with **70% coverage gate** per service
5. Integration tests (real PostgreSQL + Redis)
6. OWASP ZAP DAST scan
7. Deploy to Render (main branch only)

All stages must pass before deploy. Do not use `--no-verify` to bypass hooks.

## Security Layers

Rate limiting is applied at multiple levels: Cloudflare Workers (edge), api-gateway (global + per-endpoint), and per-service. RBAC is enforced at the route level via middleware. Authentication flow: JWT from api-gateway → mTLS for internal service calls.

## Deployment

Production runs on **Render** (see `render.yaml`). Each Node.js service scales 2–8 instances. Database is Supabase/Render PostgreSQL with EU + US read replicas. Admin dashboard deploys to **Netlify**. Mobile deploys via **Expo EAS**.

Environment variables are defined in `.env.example` files per service. Required external integrations: Google Maps API, Twilio (OTP), Flutterwave, MTN MoMo, Orange Money, Stripe, Smile ID (biometrics), Sentry, Unleash.
