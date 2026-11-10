#!/bin/sh
# Daily backup: all shop data (orders, menu, settings, staff logins…) + uploaded photos, into /backups (BACKUP_DIR).
# Restore with restore.sh. Keeps BACKUP_KEEP_DAYS days.
set -e
OUT="${BACKUP_OUT:-/backups}"
STAMP=$(date +%Y-%m-%d_%H%M)
export PGPASSWORD="$POSTGRES_PASSWORD"
CONN="-h ${POSTGRES_HOST:-db} -p ${POSTGRES_PORT:-5432} -U ${BACKUP_DB_USER:-supabase_admin} -d ${POSTGRES_DB:-postgres}"
mkdir -p "$OUT"
TMP="$OUT/.hk-$STAMP.sql.gz.part"
{
  echo "-- Home Kitchen backup $STAMP"
  pg_dump $CONN --data-only --no-owner --no-privileges --schema=public
  pg_dump $CONN --data-only --no-owner --no-privileges -t auth.users -t auth.identities -t storage.objects
} | gzip > "$TMP"
mv "$TMP" "$OUT/hk-$STAMP.sql.gz"
if [ -d "${STORAGE_DIR:-/storage}" ] && [ -n "$(ls -A "${STORAGE_DIR:-/storage}" 2>/dev/null)" ]; then
  tar -czf "$OUT/.hk-$STAMP-photos.tar.gz.part" -C "${STORAGE_DIR:-/storage}" .
  mv "$OUT/.hk-$STAMP-photos.tar.gz.part" "$OUT/hk-$STAMP-photos.tar.gz"
fi
find "$OUT" -maxdepth 1 -name 'hk-*' -mtime +"${BACKUP_KEEP_DAYS:-30}" -delete 2>/dev/null || true
echo "backup saved: hk-$STAMP.sql.gz"
