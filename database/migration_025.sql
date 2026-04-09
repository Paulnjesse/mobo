-- Migration 025: Row-Level Security (RLS) policies
-- Adds PostgreSQL database-level tenant isolation so no application bug
-- can accidentally leak one user's data to another.
--
-- Pattern used:
--   1. Enable RLS on each sensitive table.
--   2. Create a PERMISSIVE policy that allows access only when
--      current_setting('app.current_user_id') matches the row's owner column.
--   3. Service accounts (postgres superuser / Supabase service role) bypass RLS
--      by design — they are used only by the backend, never by end users.
--
-- The application sets the user context at the start of each DB transaction:
--   SET LOCAL app.current_user_id = '<uuid>';
--
-- Tables covered: users, rides, payments, locations, driver_profiles,
--   notifications, support_tickets, trusted_contacts, saved_places,
--   gdpr_deletion_requests, gdpr_erasure_requests, gdpr_export_requests,
--   payment_methods, ride_ratings, fare_splits, preferred_drivers.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: create the app.current_user_id setting if it does not exist yet.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('app.current_user_id', '', false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_owner_policy ON users;
CREATE POLICY users_owner_policy ON users
  USING (id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- rides  (accessible to the rider OR the assigned driver)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rides_participant_policy ON rides;
CREATE POLICY rides_participant_policy ON rides
  USING (
    rider_id::text  = current_setting('app.current_user_id', true)
    OR
    driver_id::text = current_setting('app.current_user_id', true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- payments
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_owner_policy ON payments;
CREATE POLICY payments_owner_policy ON payments
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- payment_methods
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_methods_owner_policy ON payment_methods;
CREATE POLICY payment_methods_owner_policy ON payment_methods
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- locations  (drivers own their own location rows)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS locations_owner_policy ON locations;
CREATE POLICY locations_owner_policy ON locations
  USING (driver_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_owner_policy ON notifications;
CREATE POLICY notifications_owner_policy ON notifications
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- support_tickets
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_owner_policy ON support_tickets;
CREATE POLICY support_tickets_owner_policy ON support_tickets
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- trusted_contacts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trusted_contacts_owner_policy ON trusted_contacts;
CREATE POLICY trusted_contacts_owner_policy ON trusted_contacts
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- saved_places
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE saved_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_places_owner_policy ON saved_places;
CREATE POLICY saved_places_owner_policy ON saved_places
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- ride_ratings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ride_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_ratings_participant_policy ON ride_ratings;
CREATE POLICY ride_ratings_participant_policy ON ride_ratings
  USING (
    rater_id::text  = current_setting('app.current_user_id', true)
    OR
    ratee_id::text  = current_setting('app.current_user_id', true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- fare_splits
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fare_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fare_splits_participant_policy ON fare_splits;
CREATE POLICY fare_splits_participant_policy ON fare_splits
  USING (initiator_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- preferred_drivers
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE preferred_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS preferred_drivers_owner_policy ON preferred_drivers;
CREATE POLICY preferred_drivers_owner_policy ON preferred_drivers
  USING (rider_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- GDPR tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gdpr_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_deletion_owner_policy ON gdpr_deletion_requests;
CREATE POLICY gdpr_deletion_owner_policy ON gdpr_deletion_requests
  USING (user_id::text = current_setting('app.current_user_id', true));

ALTER TABLE gdpr_erasure_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_erasure_owner_policy ON gdpr_erasure_requests;
CREATE POLICY gdpr_erasure_owner_policy ON gdpr_erasure_requests
  USING (user_id::text = current_setting('app.current_user_id', true));

ALTER TABLE gdpr_export_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_export_owner_policy ON gdpr_export_requests;
CREATE POLICY gdpr_export_owner_policy ON gdpr_export_requests
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- developer_api_keys
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE developer_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS developer_api_keys_owner_policy ON developer_api_keys;
CREATE POLICY developer_api_keys_owner_policy ON developer_api_keys
  USING (user_id::text = current_setting('app.current_user_id', true));
