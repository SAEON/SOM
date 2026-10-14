#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/saeon-observations-monitor-v2}"
BRANCH="${BRANCH:-main}"
PROJECT="saeon-observations-monitor-v2"
EXPECTED_DB_VOLUME="saeon-observations-monitor-v2_loggernet-db-data"
SOM_BACKUP_DUMP="${SOM_BACKUP_DUMP:-$HOME/som-backup-$(date +%F)/loggernet.dump}"
log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose -p "$PROJECT" -f "$APP_DIR/docker-compose.yml" "$@"; }

cd "$APP_DIR" || fail "Cannot open $APP_DIR"
[ -f .env ] && [ -f api/.env ] || fail "Keep the existing .env and api/.env on the server."
[ -s "$SOM_BACKUP_DUMP" ] || fail "A completed backup is required: $SOM_BACKUP_DUMP"
[ -f "$SOM_BACKUP_DUMP.complete" ] || fail "Verify pg_dump exit code 0 and create $SOM_BACKUP_DUMP.complete before deploying."
actual_volume=$(docker inspect loggernet-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')
[ "$actual_volume" = "$EXPECTED_DB_VOLUME" ] || fail "Unexpected database volume: $actual_volume. No deployment performed."
dump_connections=$(docker exec loggernet-db psql -U postgres -d loggernet -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='pg_dump'")
[ "$dump_connections" = 0 ] || fail "A database backup is still running. Wait for it to finish."
docker exec -i loggernet-db pg_restore --list < "$SOM_BACKUP_DUMP" >/dev/null || fail "Backup table-of-contents check failed."
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "Tracked server files have local changes; inspect before pulling."

stamp=$(date -u +%Y%m%d%H%M%S)
backup_dir=$(dirname "$SOM_BACKUP_DUMP")
git rev-parse HEAD > "$backup_dir/pre-deploy-commit-$stamp.txt"
cp docker-compose.yml "$backup_dir/docker-compose-pre-deploy-$stamp.yml"
docker image tag "$(docker inspect loggernet-api --format '{{.Image}}')" "som-api-rollback:$stamp"
docker image tag "$(docker inspect loggernet-web --format '{{.Image}}')" "som-web-rollback:$stamp"
printf 'Rollback image tags: som-api-rollback:%s and som-web-rollback:%s\n' "$stamp" "$stamp"

log "Pulling origin/$BRANCH (no deployment is triggered by push alone)"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"
compose config --quiet
log "Building app images before interrupting SOM"
compose build api web

log "Pausing SOM API; e-news remains running"
compose stop api
log "Recreating PostgreSQL with the existing named volume and updated memory profile"
compose up -d --wait --wait-timeout 180 db
actual_volume=$(docker inspect loggernet-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')
[ "$actual_volume" = "$EXPECTED_DB_VOLUME" ] || fail "Post-deployment volume mismatch; API remains stopped."
log "Applying availability indexes (no observation tables are deleted or restored)"
compose exec -T db psql -U postgres -d loggernet -v ON_ERROR_STOP=1 < docker/postgres/50-availability-query-indexes.sql
log "Starting rebuilt API and web"
compose up -d --force-recreate api web
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 http://localhost:3081/api/public/site-status >/dev/null; then break; fi
  sleep 1
done
curl -fsS --max-time 20 http://localhost:3080/ >/dev/null
curl -fsS --max-time 20 http://localhost:3081/api/public/site-status
compose exec -T db psql -U postgres -d loggernet -c 'SHOW shared_buffers; SHOW effective_cache_size; SHOW work_mem; SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;'
compose exec -T api node -e 'console.log("Background jobs:", process.env.ENABLE_BACKGROUND_JOBS); if (process.env.ENABLE_BACKGROUND_JOBS !== "true") process.exitCode=1;'
compose ps
log "Deployment complete; verify login, SAST CSV downloads, previews, and availability"
printf 'Rollback evidence is in %s. Do not remove Docker volumes.\n' "$backup_dir"
