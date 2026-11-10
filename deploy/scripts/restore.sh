#!/bin/sh
# Restore a backup made by backup.sh into this install (replaces ALL current shop data).
#   docker compose -f deploy/docker-compose.yml exec scheduler sh /app/deploy/scripts/restore.sh hk-2026-11-11_0730.sql.gz yes
set -e
FILE="$1"
[ -f "$FILE" ] || FILE="/backups/$1"
[ -f "$FILE" ] || { echo "Backup file not found: $1"; ls /backups 2>/dev/null | grep '^hk-' | tail -10; exit 1; }
[ "$2" = "yes" ] || { echo "This replaces all current orders, menu, settings and staff logins. Add 'yes' to confirm."; exit 1; }
export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL="psql -h ${POSTGRES_HOST:-db} -p ${POSTGRES_PORT:-5432} -U ${BACKUP_DB_USER:-supabase_admin} -d ${POSTGRES_DB:-postgres} -v ON_ERROR_STOP=1 -q -X"
{
  echo "set session_replication_role = replica;"
  echo "do \$\$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' loop execute format('truncate table public.%I cascade', r.tablename); end loop; end \$\$;"
  echo "delete from storage.objects; delete from auth.identities; delete from auth.users;"
  gunzip -c "$FILE"
} | $PSQL -1
PHOTOS="${FILE%.sql.gz}-photos.tar.gz"
if [ -f "$PHOTOS" ]; then tar -xzf "$PHOTOS" -C "${STORAGE_DIR:-/storage}"; fi
$PSQL -c "notify pgrst, 'reload schema'"
echo "restored $(basename "$FILE")"
