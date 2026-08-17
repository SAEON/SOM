#!/usr/bin/env bash
set -euo pipefail

dump_file="/docker-entrypoint-initdb.d/loggernet.dump"

if [ ! -f "$dump_file" ]; then
  echo "PostgreSQL dump not found at $dump_file"
  exit 1
fi

echo "Restoring loggernet database from $dump_file"
pg_restore \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  --jobs "${PG_RESTORE_JOBS:-4}" \
  --verbose \
  "$dump_file"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --command "create table if not exists public.docker_restore_status (id integer primary key, restored_at timestamptz not null default now()); insert into public.docker_restore_status (id) values (1) on conflict (id) do update set restored_at = excluded.restored_at;"
