-- migration_042.sql
-- Performance indexes for the hottest query paths.
-- All indexes are CONCURRENTLY — zero table lock, safe to run in production
-- without a maintenance window.
--
-- Analysis source: rideController.js (120 pool.query calls profiled),
-- paymentController.js, locationController.js
-- ─────────────────────────────────────────────────────────────────────────────

-- ── rides table ───────────────────────────────────────────────────────────────

-- listRides: WHERE (rider_id = $1 OR driver_user_id = $1) ORDER BY created_at DESC
-- Most riders check "my rides" — rider_id + created_at covers the sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_rider_created
  ON rides (rider_id, created_at DESC);

-- Driver active-ride check (acceptRide serialisation guard):
--   WHERE driver_id = $1 AND status IN ('accepted','arriving','in_progress')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_driver_status
  ON rides (driver_id, status)
  WHERE status IN ('accepted', 'arriving', 'in_progress', 'requested');

-- Status-based admin queries and reconciliation jobs:
--   WHERE status = 'requested' / 'pending' ORDER BY created_at ASC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_status_created
  ON rides (status, created_at ASC);

-- cancelRide / updateRideStatus — primary key lookup + status filter
-- (rider_id, id) used in: WHERE id = $1 AND rider_id = $2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_id_rider
  ON rides (id, rider_id);

-- ── payments table ────────────────────────────────────────────────────────────

-- getPaymentHistory: WHERE user_id = $1 ORDER BY created_at DESC LIMIT n
-- This is the highest-traffic read in payment-service.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_created
  ON payments (user_id, created_at DESC);

-- checkPaymentStatus + reconciliation: WHERE reference = $1 (external provider ref)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_reference
  ON payments (reference)
  WHERE reference IS NOT NULL;

-- flagStalePayments: WHERE status='pending' AND method=ANY(...) AND created_at < ...
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status_method_created
  ON payments (status, method, created_at ASC)
  WHERE status = 'pending';

-- ── users table ───────────────────────────────────────────────────────────────

-- Covered index for push token lookups — eliminates heap fetch for the
-- 17 individual "SELECT push_token FROM users WHERE id = $1" calls per ride.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_id_push_token
  ON users (id)
  INCLUDE (push_token, phone, language, full_name);

-- Auth: WHERE phone = $1 (OTP login — most frequent auth path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL;

-- ── drivers table ─────────────────────────────────────────────────────────────

-- Driver lookup by user_id (used in every acceptRide, updateRideStatus)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drivers_user_id
  ON drivers (user_id)
  INCLUDE (id, is_approved, is_available, ar_suspended_until, vehicle_id);

-- ── ride_events table (append-only audit log) ─────────────────────────────────

-- Already has idx_ride_events_ride_id and idx_ride_events_created_at (migration_040).
-- Add composite for compliance: "all events for a ride between t1 and t2"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ride_events_ride_time
  ON ride_events (ride_id, created_at DESC);

-- ── surge_zones table ─────────────────────────────────────────────────────────

-- Already has GIST index on zone geometry (idx_surge_zones).
-- Add partial index for active zones only (95%+ of lookups filter is_active=true)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_surge_zones_active
  ON surge_zones (id)
  WHERE is_active = true;

-- ── locations table (GPS history) ─────────────────────────────────────────────

-- locationPurgeJob: DELETE WHERE recorded_at < NOW() - INTERVAL '90 days'
-- Already has idx_locations_recorded on recorded_at DESC but an explicit
-- composite with user_id allows per-user GDPR erasure in O(log n).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locations_user_recorded
  ON locations (user_id, recorded_at DESC);
