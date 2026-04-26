-- migration_051.sql
-- Event schema versioning: add schema_version to ride_events
-- Allows version-aware handlers in the event DLQ and future schema evolution
-- without breaking old-format events still in the queue.

ALTER TABLE ride_events
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN ride_events.schema_version IS
  'Schema version of this event record. Increment when ride_events structure changes.
   Version 1: initial schema (ride_id, event_type, old_status, new_status, actor_id, actor_role, metadata).
   Consumer code must handle all versions it has ever seen.';

-- Index for filtering events by schema version during migrations/replays
CREATE INDEX IF NOT EXISTS idx_ride_events_schema_version
  ON ride_events(schema_version)
  WHERE schema_version > 1;

-- Also version dead_letter_events so replayed events carry version metadata
ALTER TABLE dead_letter_events
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

-- Grant audit:write (dead-letter replay) to super_admin only
-- ops_admin gets audit:read but NOT audit:write (replay is a destructive action)
INSERT INTO role_permissions (role, permission)
  VALUES ('super_admin', 'audit:write')
  ON CONFLICT (role, permission) DO NOTHING;
