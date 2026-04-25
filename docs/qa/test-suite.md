# MOBO — QA Test Suite (Task B)
**Date:** 2026-04-25  
**Coverage:** 32 test cases across all 14 system domains  
**Format:** Test ID | Module | Scenario | Preconditions | Steps | Expected Result | Priority

---

## Module 1: Ride Lifecycle

---

**TC-001**  
**Module:** Ride Lifecycle  
**Scenario:** Rider requests a standard ride — full happy path  
**Preconditions:** Rider authenticated (JWT), no active ride, ≥1 available driver within 10 km, GPS coordinates valid  
**Steps:**
1. POST `/rides` with valid pickup/dropoff coords, ride_type=standard, payment_method=mtn_mobile_money
2. Assert HTTP 201, body contains `id`, `status: "requested"`, `estimated_fare > 0`
3. Wait for Socket.IO `ride_request` event on driver namespace
4. Driver accepts via POST `/rides/:id/accept`
5. Assert ride status transitions to `accepted` in DB
6. Driver emits location updates every 2s via socket
7. Driver starts trip: POST `/rides/:id/start`
8. Assert status = `in_progress`
9. Driver completes: POST `/rides/:id/complete`
10. Assert status = `completed`, `payment_status` = pending/completed

**Expected Result:** Ride transitions through all states atomically. No duplicate state transitions possible. Payment record created with correct amount in XAF.  
**Priority:** Critical

---

**TC-002**  
**Module:** Ride Lifecycle — Concurrency  
**Scenario:** Two drivers attempt to accept the same ride simultaneously  
**Preconditions:** 1 ride in `requested` state, 2 drivers online and eligible  
**Steps:**
1. Create ride via API (status=requested)
2. Fire two concurrent POST `/rides/:id/accept` requests (driver A and driver B) within 50ms of each other
3. Assert exactly one returns HTTP 200, the other returns HTTP 409
4. Assert DB shows exactly one `driver_id` assigned
5. Assert `ride_events` log shows exactly one `status_change` from `requested` → `accepted`

**Expected Result:** Atomic CAS prevents double-acceptance. Losing driver receives 409. No ghost assignment.  
**Priority:** Critical

---

**TC-003**  
**Module:** Ride Lifecycle — Cancellation  
**Scenario:** Rider cancels ride before driver accepts  
**Preconditions:** Ride in `requested` state  
**Steps:**
1. POST `/rides/:id/cancel` as rider
2. Assert HTTP 200, status = `cancelled`
3. Assert no payment record created (or payment = 0)
4. Assert driver no longer receives dispatch notification

**Expected Result:** Clean cancellation. No charge applied.  
**Priority:** High

---

**TC-004**  
**Module:** Ride Lifecycle — Cancellation after acceptance  
**Scenario:** Rider cancels after driver is en route — cancellation fee applies  
**Preconditions:** Ride in `accepted` state, driver.arriving, >5 min elapsed  
**Steps:**
1. POST `/rides/:id/cancel` as rider (after 5-min grace period)
2. Assert HTTP 200, status = `cancelled`
3. Assert payment record created with `cancellation_fee > 0`
4. Assert driver notified of cancellation

**Expected Result:** Cancellation fee charged per configured policy. Driver compensated.  
**Priority:** High

---

**TC-005**  
**Module:** Ride Lifecycle — Driver No-Show Re-dispatch  
**Scenario:** Driver does not respond to dispatch — ride auto-re-dispatches  
**Preconditions:** Ride in `requested` state, primary driver online but unresponsive  
**Steps:**
1. Request ride; first driver is notified
2. Wait 15 seconds without driver response
3. Assert `pendingDispatches` timeout fires
4. Assert second driver (next nearest) is notified
5. Repeat until MAX_DISPATCH_ATTEMPTS (5) exhausted
6. Assert ride transitions to `cancelled` with reason `NO_DRIVER_AVAILABLE`

**Expected Result:** Up to 5 re-dispatch attempts across 3-minute window before auto-cancel.  
**Priority:** Critical

---

## Module 2: Payment Processing

---

**TC-006**  
**Module:** Payment — MTN Mobile Money  
**Scenario:** MTN MoMo payment succeeds via webhook  
**Preconditions:** Ride completed, payment record in `pending` state with MTN reference  
**Steps:**
1. Construct valid MTN webhook payload: `{ externalId: <reference>, status: 'SUCCESSFUL' }`
2. Sign with HMAC-SHA256 using `MTN_WEBHOOK_SECRET`
3. POST to `/payments/webhook/mtn` with `x-mtn-signature: sha256=<sig>`
4. Assert HTTP 200
5. Assert payment status = `completed` in DB
6. Assert ride `payment_status` = `paid`
7. Assert idempotency: re-sending same webhook returns 200 but makes no DB changes

**Expected Result:** Atomic transaction updates both tables. Idempotency key prevents double-processing.  
**Priority:** Critical

---

**TC-007**  
**Module:** Payment — Webhook Replay Attack  
**Scenario:** Attacker replays a valid MTN webhook for a second ride  
**Preconditions:** Ride A payment already completed  
**Steps:**
1. Capture the original valid webhook for ride A
2. Replay the same payload + signature to `/payments/webhook/mtn`
3. Assert HTTP 200 (idempotent) but no second charge applied
4. Assert `idempotency_keys` table has entry preventing re-processing

**Expected Result:** Second call is a no-op. No double credit.  
**Priority:** Critical

---

**TC-008**  
**Module:** Payment — Invalid HMAC Rejected  
**Scenario:** Webhook with tampered payload is rejected  
**Preconditions:** None  
**Steps:**
1. Construct MTN webhook payload
2. Sign with WRONG key: `sha256=deadbeef`
3. POST to `/payments/webhook/mtn`
4. Assert HTTP 401

**Expected Result:** 401 Unauthorized. No DB writes.  
**Priority:** Critical

---

**TC-009**  
**Module:** Payment Reconciliation  
**Scenario:** MoMo payment stuck in PENDING — reconciliation resolves after 24h  
**Preconditions:** Payment with `status=pending`, `poll_attempts=0`  
**Steps:**
1. Advance `poll_attempts` to 143 in DB (simulating 23h50m of polling)
2. Run `runReconciliation()` once
3. Mock provider returns `{ status: 'PENDING' }`
4. Assert `poll_attempts` = 144, payment status = `failed`, metadata contains `MAX_ATTEMPTS_EXCEEDED`
5. Assert `logger.warn` called with "Max poll attempts reached"

**Expected Result:** After 144 polls × 10 min = 24h, payment fails gracefully. No infinite retry.  
**Priority:** Critical

---

**TC-010**  
**Module:** Payment — Orange Money Success  
**Scenario:** Orange Money payment succeeds with pay_token  
**Preconditions:** Payment pending with `method=orange_money`, `metadata.pay_token=ptok_abc`  
**Steps:**
1. Mock `pollOrangeStatus('ref_xyz', 'ptok_abc')` → `{ status: 'SUCCESS' }`
2. Run reconciliation cycle
3. Assert payment = `completed`, ride = `paid`

**Expected Result:** Orange-specific status code `SUCCESS` mapped to completed.  
**Priority:** High

---

## Module 3: Dispatch & Admin Control

---

**TC-011**  
**Module:** Dispatch — Admin Manual Assignment  
**Scenario:** Admin manually assigns unmatched ride to a specific driver  
**Preconditions:** Ride in `requested` state, driver online and available, admin authenticated with `ops_admin` role  
**Steps:**
1. Admin calls POST `/admin/rides/:rideId/assign` with `{ driver_id: <uuid> }`
2. Assert HTTP 200
3. Assert ride `driver_id` = assigned driver, status = `accepted`
4. Assert `ride_events` records manual assignment with `actor_role=admin`
5. Assert driver socket receives `ride_assigned` event

**Expected Result:** Ride assigned atomically. Audit trail created. Driver notified.  
**Priority:** Critical

---

**TC-012**  
**Module:** Dispatch — Driver Reassignment  
**Scenario:** Admin reassigns in-progress ride to different driver (breakdown scenario)  
**Preconditions:** Ride in `accepted` state  
**Steps:**
1. Admin POST `/admin/rides/:id/reassign` with new `driver_id`
2. Assert original driver notified of cancellation
3. Assert new driver notified of assignment
4. Assert ride `driver_id` updated atomically
5. Assert both assignment events logged in `ride_events`

**Expected Result:** Atomic reassignment. Both drivers notified. Full audit trail.  
**Priority:** High

---

**TC-013**  
**Module:** Dispatch — Force Complete  
**Scenario:** Admin force-completes a stalled ride  
**Preconditions:** Ride in `in_progress` state for >2 hours  
**Steps:**
1. Admin POST `/admin/rides/:id/status` with `{ status: 'completed', reason: 'admin_force_complete' }`
2. Assert HTTP 200, ride status = `completed`
3. Assert fare calculated based on elapsed time/distance
4. Assert `ride_events` records override with admin actor

**Expected Result:** Ride closed. Admin action audited.  
**Priority:** High

---

## Module 4: GPS & Real-Time

---

**TC-014**  
**Module:** GPS — Spoofing Detection  
**Scenario:** Rider submits teleporting coordinates — ride blocked  
**Preconditions:** `fraud_detection_v1` feature flag enabled, ML service running  
**Steps:**
1. Mock `checkGpsSpoofing()` → `{ ok: false, reason: 'teleportation_detected' }`
2. POST `/rides` with pickup coords
3. Assert HTTP 403, `{ code: 'GPS_FRAUD_DETECTED' }`
4. Assert no ride record created in DB

**Expected Result:** Ride creation blocked. No DB write. Fraud event logged.  
**Priority:** Critical

---

**TC-015**  
**Module:** GPS — ML Service Unavailable  
**Scenario:** GPS fraud check fails gracefully when ML service is down  
**Preconditions:** `fraud_detection_v1` enabled, ML service returns 500  
**Steps:**
1. Mock `checkGpsSpoofing()` → throws `Error('connect ECONNREFUSED')`
2. POST `/rides` with valid coords
3. Assert HTTP 201 (ride created despite ML failure)
4. Assert `logger.warn` called with "GPS fraud check unavailable"

**Expected Result:** Fail-open. ML outage never blocks legitimate rides.  
**Priority:** Critical

---

**TC-016**  
**Module:** Real-Time — Socket.IO Multi-Instance  
**Scenario:** Driver location update on instance A is visible to rider on instance B  
**Preconditions:** Redis adapter active, two server instances running  
**Steps:**
1. Rider connects to instance A, joins ride room
2. Driver connects to instance B, emits `driver_location` event
3. Assert rider on instance A receives location update within 1s
4. Assert update contains `{ lat, lng, bearing, speed }`

**Expected Result:** Redis pub/sub bridges instances. Cross-instance broadcast works.  
**Priority:** Critical

---

**TC-017**  
**Module:** Real-Time — Missed Event Replay  
**Scenario:** Rider reconnects mid-ride and receives current state  
**Preconditions:** Ride in `in_progress`, rider socket disconnected  
**Steps:**
1. Rider socket disconnects
2. Driver progresses ride state
3. Rider reconnects
4. Assert `ride_state_sync` event emitted within 200ms of connection
5. Assert event contains current `status`, `driver_location`, `eta`

**Expected Result:** Rider immediately informed of current state without re-requesting the ride.  
**Priority:** High

---

## Module 5: RBAC & Security

---

**TC-018**  
**Module:** RBAC — Role Enforcement  
**Scenario:** Support agent cannot access financial admin routes  
**Preconditions:** User has `support_agent` role only  
**Steps:**
1. Authenticate as support_agent
2. GET `/payments/admin/financial-reports`
3. Assert HTTP 403, `{ error: 'Insufficient permissions' }`
4. Assert audit log records denied attempt

**Expected Result:** Finance routes accessible only to `finance_admin` and `super_admin`.  
**Priority:** Critical

---

**TC-019**  
**Module:** RBAC — Driver vs Rider Route Isolation  
**Scenario:** Rider cannot call driver-only endpoint  
**Preconditions:** User has `rider` role  
**Steps:**
1. POST `/rides/:id/accept` as rider
2. Assert HTTP 403
3. Attempt GET `/drivers/earnings` as rider
4. Assert HTTP 403

**Expected Result:** Role guard rejects incorrect role at middleware level. No business logic reached.  
**Priority:** Critical

---

**TC-020**  
**Module:** Security — Header Injection Prevention  
**Scenario:** Client sends forged x-user-id header to bypass auth  
**Preconditions:** None (unauthenticated request)  
**Steps:**
1. Send GET `/rides` with header `x-user-id: 1` and `x-user-role: admin` but no JWT
2. Assert HTTP 401 (JWT missing, forged header stripped at gateway)
3. Send same request with valid JWT for `rider` role + forged `x-user-role: admin`
4. Assert request handled as `rider`, not `admin`

**Expected Result:** Forged headers stripped before auth middleware runs. Privilege escalation impossible.  
**Priority:** Critical

---

**TC-021**  
**Module:** Security — SQL Injection  
**Scenario:** Attacker injects SQL via ride_id parameter  
**Preconditions:** None  
**Steps:**
1. GET `/rides/'; DROP TABLE rides; --`
2. Assert HTTP 400 or 404 (validation rejects invalid UUID)
3. Assert `rides` table still exists in DB
4. Attempt same with `?status='; DELETE FROM payments; --`
5. Assert input sanitized; no DB modification

**Expected Result:** Parameterized queries prevent injection. No DB side effects.  
**Priority:** Critical

---

**TC-022**  
**Module:** Security — Rate Limiting  
**Scenario:** Brute-force login attempt is throttled  
**Preconditions:** None  
**Steps:**
1. POST `/auth/login` with wrong password 10 times in 60 seconds
2. Assert responses 1–5: HTTP 401
3. Assert responses 6–10: HTTP 429 with `Retry-After` header
4. Wait 60 seconds
5. Assert valid login succeeds (HTTP 200)

**Expected Result:** Rate limiter triggers at 5 failed attempts/minute. Lock releases after window.  
**Priority:** Critical

---

## Module 6: Driver & Rider Management

---

**TC-023**  
**Module:** Driver Management — Deactivation  
**Scenario:** Admin deactivates an online driver mid-shift  
**Preconditions:** Driver status=online, no active ride  
**Steps:**
1. Admin POST `/admin/drivers/:id/deactivate`
2. Assert driver `is_active` = false in DB
3. Assert driver receives `force_offline` socket event
4. Assert driver no longer appears in dispatch pool (no new ride assignments)
5. Assert admin action logged in `data_access_logs`

**Expected Result:** Driver removed from dispatch pool instantly. Audit trail created.  
**Priority:** High

---

**TC-024**  
**Module:** Driver Management — Deactivation with Active Ride  
**Scenario:** Admin attempts to deactivate driver mid-ride  
**Preconditions:** Driver has ride in `in_progress` state  
**Steps:**
1. Admin POST `/admin/drivers/:id/deactivate`
2. Assert HTTP 409 with `{ error: 'Cannot deactivate driver with active ride' }`
3. Assert driver remains active

**Expected Result:** Deactivation blocked. Rider not stranded.  
**Priority:** High

---

**TC-025**  
**Module:** Rider Management — Fraud Flag and Ban  
**Scenario:** Admin bans high-risk rider  
**Preconditions:** Rider has 3+ fraud signals in ML model  
**Steps:**
1. Admin POST `/admin/users/:id/ban` with `{ reason: 'payment_fraud', duration_days: 30 }`
2. Assert user `is_banned` = true, `ban_expires_at` set
3. Attempt to request a ride as banned user
4. Assert HTTP 403 with `{ code: 'ACCOUNT_SUSPENDED' }`

**Expected Result:** Ban enforced at middleware. Banned rider cannot create rides.  
**Priority:** High

---

## Module 7: Alerts & Incidents

---

**TC-026**  
**Module:** Alerts — Payment Failure Alert  
**Scenario:** Payment failure rate exceeds 2% threshold — alert fires  
**Preconditions:** Prometheus alert rule configured: `payment_success_rate < 0.98`  
**Steps:**
1. Simulate 10 failed payments in 5 minutes (mock via metrics endpoint)
2. Wait for Prometheus evaluation interval (15s)
3. Assert Alertmanager fires alert to `#alerts-payments` Slack channel
4. Assert PagerDuty NOT called (not critical threshold)

**Expected Result:** Correct severity routing. Payments team notified. No false PagerDuty page.  
**Priority:** High

---

**TC-027**  
**Module:** Alerts — High Latency Alert  
**Scenario:** API P99 latency exceeds 2s — critical alert fires  
**Preconditions:** Prometheus alert `http_request_duration_p99 > 2` configured  
**Steps:**
1. Inject 100 slow requests taking 2.5s each (k6 load test)
2. Assert alert fires within 1 minute
3. Assert both Slack `#alerts-platform` AND PagerDuty called
4. Assert inhibit rules suppress `HighWarningLatency` when `HighCriticalLatency` is firing

**Expected Result:** Critical alert fires. PagerDuty paged. Child warning suppressed by inhibit rule.  
**Priority:** High

---

## Module 8: Analytics & Reporting

---

**TC-028**  
**Module:** Analytics — KPI Dashboard  
**Scenario:** Admin fetches daily KPI summary  
**Preconditions:** Admin authenticated as `super_admin` or `finance_admin`  
**Steps:**
1. GET `/admin/dashboard?date=2026-04-25`
2. Assert response includes: `{ total_rides, total_revenue_xaf, cancellation_rate, avg_rating, on_time_pct }`
3. Assert all values are non-negative integers
4. Assert `total_revenue_xaf` is integer (never float — XAF business rule)
5. Assert response time < 500ms (cached)

**Expected Result:** KPI data returned with correct types. No floats in currency fields.  
**Priority:** High

---

**TC-029**  
**Module:** Analytics — Surge Zone Accuracy  
**Scenario:** Surge multiplier applied correctly at zone boundary  
**Preconditions:** Surge zone configured with `multiplier=1.8` for Bastos district  
**Steps:**
1. Request fare estimate with pickup inside surge zone
2. Assert `surge_multiplier` = 1.8 in response
3. Request fare estimate with pickup 1m outside zone boundary
4. Assert `surge_multiplier` = 1.0
5. Assert `max_multiplier` cap (3.5×) is never exceeded per migration_031

**Expected Result:** PostGIS zone boundary respected to meter precision. Cap enforced.  
**Priority:** High

---

## Module 9: Reliability & Consistency

---

**TC-030**  
**Module:** Reliability — DB Connection Pool Exhaustion  
**Scenario:** Payment service handles pool exhaustion gracefully  
**Preconditions:** pg pool size = 20, 20 concurrent connections active  
**Steps:**
1. Saturate connection pool with 20 long-running queries
2. Submit new payment request
3. Assert request queued (not dropped) up to pool `connectionTimeoutMillis`
4. Assert HTTP 503 with `Retry-After` header if queue times out
5. Assert Sentry captures the error

**Expected Result:** No silent 500 errors. Client receives actionable error with retry guidance.  
**Priority:** High

---

**TC-031**  
**Module:** Reliability — Circuit Breaker  
**Scenario:** ML service down — circuit opens, ride creation continues  
**Preconditions:** ML service returning 500 for all requests  
**Steps:**
1. Submit 5 ride requests (circuit breaker threshold = 5 failures)
2. Assert circuit opens after threshold
3. Submit 6th ride request
4. Assert circuit is open — GPS check skipped immediately (no timeout wait)
5. Assert ride created successfully (fail-open behavior)
6. After 30s half-open period, assert circuit probes ML service

**Expected Result:** Opossum circuit breaker prevents cascade. Rides unblocked within 1 circuit-open request.  
**Priority:** High

---

**TC-032**  
**Module:** Reliability — Redis Failure Graceful Degradation  
**Scenario:** Redis becomes unavailable — system remains functional  
**Preconditions:** Redis running, then killed  
**Steps:**
1. Kill Redis container
2. Submit ride request
3. Assert Socket.IO falls back to single-instance mode (no crash)
4. Assert rate limiting falls back to pass-through (no 429 storms)
5. Assert feature flags return defaults (not crash)
6. Assert logger warns on each Redis error (not error-level)
7. Restart Redis
8. Assert system reconnects automatically within 30s

**Expected Result:** Redis failure degrades functionality gracefully. No cascading service failures.  
**Priority:** Critical

---

*End of Task B — QA Test Suite (32 test cases)*
