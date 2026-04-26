#!/usr/bin/env bash
# backup_wal.sh — PostgreSQL WAL archiving + point-in-time recovery setup for MOBO
#
# Usage:
#   ./scripts/backup_wal.sh setup          # configure postgresql.conf for WAL archiving
#   ./scripts/backup_wal.sh base-backup    # take a full base backup (pg_basebackup)
#   ./scripts/backup_wal.sh verify         # verify latest base backup is readable
#   ./scripts/backup_wal.sh restore        # print PITR restore instructions
#
# Prerequisites:
#   - $DATABASE_URL or individual $PGHOST/$PGPORT/$PGUSER/$PGDATABASE env vars
#   - $BACKUP_S3_BUCKET  (e.g. s3://mobo-db-backups/prod)
#   - aws-cli configured with write access to the bucket
#   - pg_basebackup available in PATH

set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mobo-pg}"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://mobo-db-backups/prod}"
PGUSER="${PGUSER:-postgres}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-mobo_prod}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BASE_BACKUP_PATH="${BACKUP_DIR}/base_${TIMESTAMP}"
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"

mkdir -p "${BACKUP_DIR}"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "[$(date -u +%FT%TZ)] MOBO WAL Backup — action: ${1:-help}"

# ── Helpers ────────────────────────────────────────────────────────────────────
check_deps() {
  for cmd in pg_basebackup psql aws; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "ERROR: $cmd not found in PATH" >&2
      exit 1
    fi
  done
}

# ── 1. setup — configure postgresql.conf for continuous WAL archiving ──────────
setup() {
  echo "Configuring PostgreSQL for WAL archiving..."
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<SQL
-- Enable WAL archiving (run as superuser)
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET archive_mode = 'on';
ALTER SYSTEM SET archive_command = 'aws s3 cp %p ${S3_BUCKET}/wal/%f 2>>${BACKUP_DIR}/wal_archive.log';
ALTER SYSTEM SET archive_timeout = '300';  -- archive incomplete WAL segments every 5 min
ALTER SYSTEM SET max_wal_senders = '3';
ALTER SYSTEM SET wal_keep_size = '1GB';

-- ride_events protection: ensure FULL replica identity so WAL contains full row images
ALTER TABLE ride_events REPLICA IDENTITY FULL;
ALTER TABLE dead_letter_events REPLICA IDENTITY FULL;

SELECT pg_reload_conf();
SQL

  echo "PostgreSQL WAL archiving configured."
  echo "IMPORTANT: Restart PostgreSQL to apply wal_level and archive_mode changes."
  echo "  sudo systemctl restart postgresql"
  echo "  OR on Render/Supabase: these settings must be applied via the provider dashboard."
}

# ── 2. base-backup — full snapshot via pg_basebackup ──────────────────────────
base_backup() {
  check_deps
  echo "Starting base backup to ${BASE_BACKUP_PATH}..."

  pg_basebackup \
    --host="$PGHOST" \
    --port="$PGPORT" \
    --username="$PGUSER" \
    --pgdata="$BASE_BACKUP_PATH" \
    --wal-method=stream \
    --checkpoint=fast \
    --label="mobo_${TIMESTAMP}" \
    --progress \
    --verbose

  # Compress and upload to S3
  echo "Compressing backup..."
  tar -czf "${BASE_BACKUP_PATH}.tar.gz" -C "${BACKUP_DIR}" "base_${TIMESTAMP}"
  rm -rf "${BASE_BACKUP_PATH}"

  echo "Uploading to S3..."
  aws s3 cp "${BASE_BACKUP_PATH}.tar.gz" "${S3_BUCKET}/base/${TIMESTAMP}.tar.gz" \
    --storage-class STANDARD_IA \
    --metadata "timestamp=${TIMESTAMP},host=${PGHOST},db=${PGDATABASE}"

  # Upload log
  aws s3 cp "${LOG_FILE}" "${S3_BUCKET}/logs/backup_${TIMESTAMP}.log" 2>/dev/null || true

  echo "Base backup complete: ${S3_BUCKET}/base/${TIMESTAMP}.tar.gz"

  # Prune local backups older than RETENTION_DAYS
  find "${BACKUP_DIR}" -name "*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete
  echo "Local backups older than ${RETENTION_DAYS} days pruned."
}

# ── 3. verify — check latest backup is readable ───────────────────────────────
verify() {
  check_deps
  echo "Verifying latest base backup..."

  LATEST=$(aws s3 ls "${S3_BUCKET}/base/" | sort | tail -1 | awk '{print $4}')
  if [[ -z "$LATEST" ]]; then
    echo "ERROR: No base backups found in ${S3_BUCKET}/base/" >&2
    exit 1
  fi

  VERIFY_DIR="${BACKUP_DIR}/verify_${TIMESTAMP}"
  mkdir -p "$VERIFY_DIR"

  echo "Downloading ${LATEST}..."
  aws s3 cp "${S3_BUCKET}/base/${LATEST}" "${VERIFY_DIR}/${LATEST}"
  tar -tzf "${VERIFY_DIR}/${LATEST}" | head -20
  echo "Archive is readable. Latest backup: ${LATEST}"
  rm -rf "$VERIFY_DIR"
  echo "Verification passed."
}

# ── 4. restore — print PITR instructions ──────────────────────────────────────
restore() {
  cat <<'EOF'
Point-in-Time Recovery (PITR) Instructions for MOBO PostgreSQL
==============================================================

1. Stop the PostgreSQL service:
   sudo systemctl stop postgresql

2. Download the latest base backup:
   aws s3 cp s3://mobo-db-backups/prod/base/<LATEST>.tar.gz /tmp/mobo_restore.tar.gz
   tar -xzf /tmp/mobo_restore.tar.gz -C /var/lib/postgresql/data --strip-components=1

3. Create recovery.conf (PostgreSQL < 12) or recovery signal (PostgreSQL >= 12):
   # For PostgreSQL 12+:
   touch /var/lib/postgresql/data/recovery.signal

   # Edit postgresql.conf and add:
   restore_command = 'aws s3 cp s3://mobo-db-backups/prod/wal/%f %p'
   recovery_target_time = '2024-06-15 14:30:00 UTC'   # <- set to your target time
   recovery_target_action = 'promote'

4. Start PostgreSQL:
   sudo systemctl start postgresql

5. Verify ride_events table integrity:
   psql -c "SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM ride_events;"
   psql -c "SELECT COUNT(*) FROM dead_letter_events WHERE resolved = false;"

6. Promote the replica (if using streaming replication):
   pg_ctl promote -D /var/lib/postgresql/data

NOTES:
- Supabase/Render: use provider PITR UI (Settings → Database → Point-in-time Recovery)
- WAL segments are in: s3://mobo-db-backups/prod/wal/
- Base backups are in:  s3://mobo-db-backups/prod/base/
- Retention: 7 days (configurable via BACKUP_RETENTION_DAYS env var)
EOF
}

# ── Dispatch ───────────────────────────────────────────────────────────────────
case "${1:-help}" in
  setup)        setup        ;;
  base-backup)  base_backup  ;;
  verify)       verify       ;;
  restore)      restore      ;;
  *)
    echo "Usage: $0 {setup|base-backup|verify|restore}"
    echo ""
    echo "  setup        Configure postgresql.conf for WAL archiving (run once)"
    echo "  base-backup  Take a full base backup and upload to S3"
    echo "  verify       Download and verify latest base backup"
    echo "  restore      Print PITR restore instructions"
    exit 0
    ;;
esac
