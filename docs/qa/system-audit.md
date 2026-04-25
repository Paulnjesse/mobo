# MOBO — System Audit Report (Task A)
**Date:** 2026-04-25  
**Auditor:** Senior Staff QA Engineer / Distributed Systems Architect  
**Standard:** Production-grade ride-hailing platform (Uber/Bolt parity)

---

## 1. Audit Methodology

Each system domain was scored against production-grade requirements defined in TESTINGMOBO.txt. Evidence was gathered by reading source code, migration files, monitoring configs, and test suites.

Scale:
- ✅ **Implemented** — fully present and architecturally sound
- ⚠️ **Partial** — feature exists but incomplete or fragile at scale
- ❌ **Missing** — capability absent; constitutes a production gap

---

## 2. Domain-by-Domain Findings

### 2.1 Real-Time Operations

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Live map (drivers, trips) | ✅ | `admin/src/pages/LocationMap.jsx` + Socket.IO | Low |
| Ride state machine | ✅ | `rideController.js` — 7 states | Low |
| Auto-refresh (≤5s latency) | ⚠️ | Socket.IO adapter added; single-instance fallback if Redis down | Medium |
| Trip drill-down details | ✅ | `adminRideController.js` — GET /admin/rides/:id | Low |
| Demand/supply heatmaps | ⚠️ | `heatmapController.js` exists; admin UI only shows static overlay | Medium |
| Surge zone visualization | ✅ | `SurgePricing.jsx` + surge_zones table | Low |
| Live ETA recalculation | ❌ | No streaming ETA updates; client polls manually | High |
| Trip replay timeline | ❌ | No recorded GPS waypoint trail per trip; ride_events added in m040 but GPS path not stored | Critical |

**Gap:** Trip replay requires a `ride_waypoints` table logging GPS positions at intervals. Currently absent. Without it: no dispute resolution, no driver behavior review, no incident reconstruction.

---

### 2.2 Dispatch & Control

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Manual ride assignment | ⚠️ | `adminRideController.js` has assign endpoint; no dedicated dispatch queue | High |
| Driver reassignment | ⚠️ | State transitions possible via admin; no atomic reassignment guard | High |
| Cancel trip | ✅ | `POST /rides/:id/cancel` with role guard | Low |
| Force-complete / state override | ✅ | `POST /admin/rides/:id/status` | Low |
| Bulk assignment/reassignment | ❌ | No bulk endpoint; individual calls only | Critical |
| Queue prioritization | ❌ | No dispatch_queue table or priority field | Critical |
| Region-based dispatch control | ❌ | No region/zone assignment tables | High |
| AI vs manual override flag | ❌ | ML scores rides but no admin toggle to lock manual mode | High |

**Gap:** No `dispatch_queue` table means admin cannot see pending unmatched rides ranked by wait time, proximity, or priority. At scale (>500 concurrent rides) this is an operational blind spot.

**Architectural Risk:** Driver re-dispatch loop (`rideSocket.js`) lives in application memory (`pendingDispatches` Map). On multi-instance Render deployment, a pod restart loses all in-flight dispatch state — rides stall silently.

**Fix required:** Move `pendingDispatches` to Redis with TTL. Key: `dispatch:{rideId}`, value: `{attempts, declinedDriverIds, riderId, startedAt}`.

---

### 2.3 Incident & Alert Management

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Alerts: delay, fraud, breakdown, payment failure | ⚠️ | Prometheus alerts exist; no in-app incident creation | High |
| Severity levels | ⚠️ | alertmanager.yml has critical/warning; no Low/Medium in-app | Medium |
| Incident lifecycle (Open→Investigating→Resolved) | ❌ | No incidents table; no lifecycle API | Critical |
| SLA tracking | ❌ | Prometheus SLO alerts exist but no per-incident SLA clock | High |
| Escalation workflows | ⚠️ | PagerDuty routing in alertmanager; no in-app escalation | Medium |
| Root cause tagging | ❌ | No taxonomy table for incident categories | Medium |

**Gap:** The system has no `incidents` table. All alerts are fire-and-forget Prometheus rules → Slack/PagerDuty. There is no way for an ops agent to open an incident, assign it, track resolution, or tag a root cause from the dashboard.

---

### 2.4 Driver Management

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Online/offline/on-trip status | ✅ | `drivers` table + socket events | Low |
| Driver profiles + documents | ✅ | `user_documents` table (m034) + `backgroundCheckController` | Low |
| Activate/deactivate driver | ✅ | `adminManagementController.js` — archive endpoint | Low |
| Performance metrics | ✅ | `drivers.rating`, `acceptance_rate`, `cancellation_rate` | Low |
| Earnings breakdown | ✅ | `settleEarnings.js` job + `earnings_pending` table (m038) | Low |
| Fraud/behavior flags | ⚠️ | ML model produces scores; no admin-visible flag UI with history | Medium |
| Driver messaging | ⚠️ | Notification route exists; no in-app chat or thread history | Medium |
| Bulk driver activation/deactivation | ❌ | No bulk endpoint | Critical |

---

### 2.5 Rider Management

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| User profiles + ride history | ✅ | Admin endpoints in `adminController.js` | Low |
| Support tools | ⚠️ | Dispute controller exists; no ticket system | Medium |
| Fraud detection signals | ⚠️ | ML score returned; not persisted per-user in admin view | High |
| Ban/restrict user | ✅ | Soft-archive in `adminManagementController.js` | Low |
| Customer segmentation (VIP/high-risk) | ⚠️ | `loyalty_tier` on users; no high-risk flag or segment list API | Medium |
| Communication tools (SMS/email/push) | ⚠️ | Twilio OTP present; no broadcast SMS/email from admin | Medium |

---

### 2.6 Payments & Financials

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Fare breakdown | ✅ | `payments` table with fare components | Low |
| Payment status tracking | ✅ | `reconcilePayments.js` job, status enum | Low |
| Reconciliation system | ✅ | 24h polling loop, idempotency keys | Low |
| Driver payouts | ✅ | `settleEarnings.js`, `driverCashout` endpoint | Low |
| Refunds/disputes | ⚠️ | `refundPayment` endpoint exists; no admin UI bulk refund | High |
| Commission tracking | ⚠️ | Commission calculated in fare; no dedicated commission report | Medium |
| Financial reports (daily/weekly) | ❌ | No scheduled report generation or export pipeline | High |
| Bulk refunds | ❌ | No bulk refund endpoint | Critical |

---

### 2.7 Analytics

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| KPI dashboard | ✅ | `adminController.js` — trips, revenue, cancellations | Low |
| Drill-down analytics | ⚠️ | Basic breakdown; no time-series breakdown by city/zone | Medium |
| Cohort analysis | ❌ | No cohort SQL or analytics endpoints | High |
| Demand forecasting | ❌ | ML service has GPS/fraud models; no forecasting model | High |
| Exportable reports | ❌ | No CSV/Excel export for any report | High |

---

### 2.8 Security

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| RBAC | ✅ | `rbac.js` + `admin_roles` + permissions catalog | Low |
| Admin roles separation | ✅ | `super_admin`, `ops_admin`, `finance_admin`, `support_agent` | Low |
| Fine-grained permissions | ✅ | `admin_permissions` table + `role_permissions` | Low |
| Audit logs | ✅ | `auditLog.js` + `data_access_logs` table (m034) | Low |
| Session tracking | ⚠️ | JWT stateless — no session revocation, no concurrent session limit | High |
| Header forgery prevention | ✅ | x-user-* headers stripped at gateway | Low |
| Webhook HMAC verification | ✅ | MTN + Orange + Flutterwave all verify signatures | Low |
| SQL injection prevention | ✅ | Parameterized queries throughout | Low |

**Gap:** JWT is stateless with no revocation. A compromised admin token is valid until expiry (default 24h in some env configs). A Redis-backed token blocklist is required for admin sessions.

---

### 2.9 Observability

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Structured logs | ✅ | Winston in all services, Sentry for errors | Low |
| Prometheus metrics | ✅ | All services instrumented; scrape configs present | Low |
| Alertmanager routing | ✅ | Slack + PagerDuty + inhibit rules | Low |
| Distributed tracing | ⚠️ | OpenTelemetry in api-gateway only; not propagated to services | High |
| SLA monitoring | ⚠️ | P99 < 2s alert exists; no per-endpoint SLA breakdown | Medium |
| Service health dashboard | ✅ | `mobo-overview.json` Grafana dashboard | Low |
| Fraud model performance metrics | ❌ | No precision/recall tracking in Prometheus | High |

---

### 2.10 Reliability

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Ride state consistency | ✅ | DB constraints + `ride_events` audit log | Low |
| Idempotency handling | ✅ | `idempotency_keys` table + middleware | Low |
| Retry logic | ✅ | Circuit breaker (`circuitBreaker.js`) + reconciliation job | Low |
| Conflict resolution (double-assign) | ⚠️ | `FOR UPDATE SKIP LOCKED` on payments; rides use optimistic check not SELECT FOR UPDATE | High |

**Gap:** `acceptRide` in `rideController.js` checks driver availability with a plain SELECT then updates — classic TOCTOU race. Under concurrent accept from two drivers, both can pass the SELECT guard before either UPDATE commits.

---

## 3. Critical Production Blockers

| # | Blocker | Severity | Affected Module |
|---|---|---|---|
| P0-001 | `pendingDispatches` Map is in-process memory — lost on pod restart or multi-instance scale-out | **CRITICAL** | ride-service/rideSocket.js |
| P0-002 | `acceptRide` race condition — two drivers can accept same ride simultaneously | **CRITICAL** | ride-service/rideController.js |
| P0-003 | No `incidents` table or lifecycle API — ops cannot manage outages through dashboard | **CRITICAL** | admin + user-service |
| P0-004 | Trip replay impossible — GPS waypoints not recorded per trip | **CRITICAL** | ride-service + location-service |
| P0-005 | No bulk dispatch, bulk refund, or bulk driver management endpoints | **CRITICAL** | multiple |
| P0-006 | JWT admin sessions have no revocation mechanism | **CRITICAL** | api-gateway/jwtUtil.js |
| P0-007 | Distributed tracing not propagated beyond api-gateway (blind in ride/payment/location) | **HIGH** | all services |
| P0-008 | No financial report export pipeline (no CSV/Excel, no scheduled report jobs) | **HIGH** | payment-service |

---

## 4. Architectural Risks

### 4.1 In-Memory Dispatch State
The `pendingDispatches` Map in `rideSocket.js` holds active dispatch state per process. Render auto-scales to 2–8 instances. A request hitting a different pod finds no dispatch state → re-dispatch attempt counts reset → driver receives duplicate notifications.

**Fix:** Replace with Redis hash `HSET dispatch:{rideId} attempts 1 declinedDriverIds [] startedAt <ts>` with `EXPIRE 300`.

### 4.2 TOCTOU on Ride Accept
```js
// rideController.js — current (racy):
const { rows } = await db.query('SELECT id FROM rides WHERE id=$1 AND status=$2', [rideId,'requested']);
if (!rows[0]) return res.status(409)...
await db.query('UPDATE rides SET status=$1, driver_id=$2 WHERE id=$3', ['accepted', driverId, rideId]);
```
Under load, two drivers race. Fix: `UPDATE rides SET status='accepted', driver_id=$1 WHERE id=$2 AND status='requested' RETURNING id` — atomic CAS, no SELECT needed.

### 4.3 Single Payment Reconciliation Worker
`reconcilePayments.js` runs as a singleton interval. On Render with 2+ instances, all instances run the job simultaneously. `FOR UPDATE SKIP LOCKED` prevents double-processing but doubles DB load.

**Fix:** Use a named advisory lock: `SELECT pg_try_advisory_lock(hashtext('reconciliation'))` — only one worker proceeds.

### 4.4 Redis as Single Point of Failure
Socket.IO adapter, feature flags, and rate limiting all depend on Redis. No fallback behavior is defined if Redis becomes unavailable.

**Fix:** Wrap all Redis operations in try/catch with graceful degradation (rate limiting → pass-through, Socket.IO → single-instance mode, feature flags → defaults).

---

## 5. Missing Database Tables

| Table | Purpose | Priority |
|---|---|---|
| `ride_waypoints` | GPS path per trip for replay | Critical |
| `incidents` | Incident lifecycle tracking | Critical |
| `dispatch_queue` | Ordered pending ride queue with priority | Critical |
| `bulk_operations` | Audit trail for bulk admin actions | High |
| `driver_messages` | Driver messaging thread history | Medium |
| `financial_reports` | Cached scheduled report results | Medium |
| `cohort_events` | User cohort analytics events | Medium |

---

*End of Task A — System Audit*
