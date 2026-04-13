-- Migration 036: Least-privilege database roles (SEC-004)
-- Creates one PostgreSQL role per service with only the access it needs.
-- Previously all services shared a single superuser DATABASE_URL.
--
-- Roles created:
--   mobo_user_svc   → user-service   (users, auth, GDPR, KYC, fleet)
--   mobo_ride_svc   → ride-service   (ride lifecycle, fare, inspections, surge)
--   mobo_pay_svc    → payment-service (wallets, payments, refunds)
--   mobo_loc_svc    → location-service (driver GPS, safety)
--   mobo_readonly   → read replicas / analytics / reporting (SELECT only)
--
-- After applying:
--   1. Set per-service DATABASE_URL env vars in Render dashboard / .env files
--   2. Rotate the CHANGE_ME passwords to strong random values before use
--   3. The master DATABASE_URL (superuser) is only used for migrations
--
-- Run: node database/run_migrations.js

-- ── Helper: conditional per-table grant (skips tables that don't exist yet) ──
-- We use a DO block so this migration is safe to run on any schema state.
CREATE OR REPLACE FUNCTION _grant_if_exists(
  p_privilege TEXT,
  p_table     TEXT,
  p_role      TEXT
) RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    EXECUTE format('GRANT %s ON %I TO %I', p_privilege, p_table, p_role);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Create roles (idempotent) ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_user_svc') THEN
    CREATE ROLE mobo_user_svc WITH LOGIN PASSWORD 'CHANGE_ME_user_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_ride_svc') THEN
    CREATE ROLE mobo_ride_svc WITH LOGIN PASSWORD 'CHANGE_ME_ride_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_pay_svc') THEN
    CREATE ROLE mobo_pay_svc WITH LOGIN PASSWORD 'CHANGE_ME_pay_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_loc_svc') THEN
    CREATE ROLE mobo_loc_svc WITH LOGIN PASSWORD 'CHANGE_ME_loc_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_readonly') THEN
    CREATE ROLE mobo_readonly WITH LOGIN PASSWORD 'CHANGE_ME_readonly';
  END IF;
END
$$;

-- ── 2. Schema usage ───────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public
  TO mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc, mobo_readonly;

-- ── 3. mobo_user_svc — user service owns auth, profiles, GDPR, KYC ──────────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'users', 'user_documents', 'user_consents', 'consent_audit_log',
    'consent_purposes', 'notifications', 'trusted_contacts', 'saved_places',
    'teen_ride_log', 'loyalty_transactions', 'referrals',
    'corporate_accounts', 'corporate_members', 'fleets', 'fleet_vehicles',
    'driver_selfie_checks', 'gdpr_export_requests', 'gdpr_deletion_requests',
    'gdpr_erasure_requests', 'data_access_logs', 'admin_notifications',
    'admin_roles', 'permissions', 'role_permissions', 'user_permissions',
    'deactivation_appeals', 'user_social_accounts', 'family_accounts',
    'family_members', 'subscriptions', 'fraud_flags', 'audit_logs',
    'admin_audit_logs', 'api_key_rotation_log', 'developer_api_keys',
    'service_certificates', 'driver_biometric_verifications',
    'driver_realid_checks', 'whatsapp_sessions', 'ussd_sessions'
  ];
  -- Read-only access to tables owned by other services
  ro_tables TEXT[] := ARRAY['drivers', 'vehicles', 'rides', 'payments'];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_user_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_user_svc');
  END LOOP;
END
$$;

-- ── 4. mobo_ride_svc — ride service owns ride lifecycle, fares, dispatch ─────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'rides', 'ride_ratings', 'ride_disputes', 'ride_recordings',
    'ride_checkins', 'ride_type_fares', 'recurring_rides',
    'fare_splits', 'fare_split_participants',
    'promo_codes', 'promo_code_uses',
    'surge_zones', 'demand_zones',
    'sos_police_dispatches', 'police_emergency_contacts',
    'vehicle_inspections', 'vehicle_maintenance',
    'commuter_passes', 'driver_challenge_progress', 'bonus_challenges',
    'call_sessions', 'messages', 'quick_replies',
    'shared_ride_groups', 'pool_ride_groups',
    'preferred_drivers', 'driver_blocked_riders',
    'lost_and_found', 'support_tickets', 'support_messages',
    'ride_disputes', 'outstation_bookings',
    'shuttle_routes', 'shuttle_bookings',
    'concierge_bookings', 'airport_zones', 'airport_queue',
    'speed_alerts'
  ];
  ro_tables TEXT[] := ARRAY[
    'users', 'drivers', 'vehicles', 'driver_selfie_checks',
    'driver_locations', 'locations', 'payment_methods'
  ];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_ride_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_ride_svc');
  END LOOP;
END
$$;

-- ride service may update driver availability and acceptance rate (column-level)
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (is_available, acceptance_rate, ar_suspended_until, last_ride_at) ON drivers TO mobo_ride_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ride_svc driver column grant skipped: %', SQLERRM;
END
$$;

-- ── 5. mobo_pay_svc — payment service owns payments, wallet column ────────────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'payments', 'payment_methods', 'stripe_webhook_events',
    'express_pay_transactions', 'payment_audit_logs',
    'country_currency_config',
    'driver_earnings_daily', 'earnings_guarantee_windows',
    'fuel_cards', 'fuel_transactions', 'payout_requests'
  ];
  ro_tables TEXT[] := ARRAY['rides', 'users', 'drivers'];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_pay_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_pay_svc');
  END LOOP;
END
$$;

-- payment service updates wallet_balance (column-level, not full row access)
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (wallet_balance) ON users TO mobo_pay_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pay_svc wallet_balance grant skipped: %', SQLERRM;
END
$$;
-- payment service updates payment state on rides
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (final_fare, payment_method, payment_status, tip_amount) ON rides TO mobo_pay_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pay_svc rides columns grant skipped: %', SQLERRM;
END
$$;

-- ── 6. mobo_loc_svc — location service owns GPS data and safety ───────────────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'driver_locations', 'locations', 'speed_alerts'
  ];
  ro_tables TEXT[] := ARRAY[
    'rides', 'drivers', 'users', 'user_consents',  -- consent check (SEC-003)
    'surge_zones', 'demand_zones'
  ];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_loc_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_loc_svc');
  END LOOP;
END
$$;

-- location service updates driver availability and last-seen coordinates
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (is_available, last_seen_at) ON drivers TO mobo_loc_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'loc_svc driver column grant skipped: %', SQLERRM;
END
$$;

-- ── 7. mobo_readonly — SELECT-only across all tables ─────────────────────────
-- Used by read replicas, Metabase/analytics, and reporting pipelines.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mobo_readonly;

-- Auto-apply SELECT to tables created by future migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO mobo_readonly;

-- ── 8. Sequence access (required for INSERT with uuid_generate_v4 / gen_random_uuid) ─
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc;

-- ── 9. Revoke table-creation rights from service roles (defence-in-depth) ─────
-- Service roles must not be able to create or alter schema objects.
REVOKE CREATE ON SCHEMA public
  FROM mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc, mobo_readonly;

-- ── 10. Clean up helper function (not needed at runtime) ──────────────────────
DROP FUNCTION IF EXISTS _grant_if_exists(TEXT, TEXT, TEXT);
