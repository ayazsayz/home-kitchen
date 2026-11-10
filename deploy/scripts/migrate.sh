#!/bin/sh
# Creates / updates the Home Kitchen tables: supabase/schema.sql, then every supabase/migrations/*.sql once, in order.
# Runs automatically before the app starts (Docker installs). Safe to run again.
set -e
DIR="${HK_SQL_DIR:-/app/supabase}"
export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL="psql -h ${POSTGRES_HOST:-db} -p ${POSTGRES_PORT:-5432} -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-postgres} -v ON_ERROR_STOP=1 -q -X"

i=0
until $PSQL -c "select 1" >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -gt 90 ] && { echo "Database not reachable"; exit 1; }
  sleep 2
done
# Storage creates its own tables on first start; the photo bucket needs them.
i=0
until [ "$($PSQL -tAc "select to_regclass('storage.buckets') is not null")" = "t" ]; do
  i=$((i + 1)); [ $i -gt 90 ] && { echo "Storage tables not ready"; exit 1; }
  echo "waiting for storage…"; sleep 2
done

$PSQL -c "create schema if not exists hk_internal; create table if not exists hk_internal.migrations (name text primary key, applied_at timestamptz not null default now());"
fresh=$([ "$($PSQL -tAc "select count(*) from hk_internal.migrations")" = "0" ] && echo 1 || echo 0)

for f in "$DIR/schema.sql" "$DIR"/migrations/*.sql; do
  n=$(basename "$f")
  if [ "$($PSQL -tAc "select 1 from hk_internal.migrations where name = '$n'")" != "1" ]; then
    echo "applying $n"
    $PSQL -1 -f "$f"
    $PSQL -c "insert into hk_internal.migrations (name) values ('$n')"
  fi
done

# New install: shop time zone from deploy/.env
if [ "$fresh" = "1" ] && [ -n "$TZ" ]; then
  $PSQL -c "update settings set timezone = '$(echo "$TZ" | sed "s/'//g")' where id = 1"
fi
$PSQL -c "notify pgrst, 'reload schema'"
echo "database up to date"
