#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/saeon-observations-monitor-v2}"
BRANCH="${BRANCH:-}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git is not installed"
command -v docker >/dev/null 2>&1 || fail "docker is not installed"

cd "$APP_DIR" || fail "Cannot cd to $APP_DIR"

if [ -z "$BRANCH" ]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi

[ -f .env ] || fail "Missing $APP_DIR/.env. Keep server secrets in .env, not in Git."
[ -f api/.env ] || fail "Missing $APP_DIR/api/.env. Keep API secrets in api/.env, not in Git."

grep -Eq '^POSTGRES_PASSWORD=.+' .env || fail "POSTGRES_PASSWORD is missing from .env"
grep -Eq '^LOGGERNET_HOST_OVERRIDE=192\.168\.111\.70$' .env || {
  printf 'WARN: LOGGERNET_HOST_OVERRIDE is not set to 192.168.111.70 in .env.\n' >&2
  printf '      Sync from Docker may resolve the public LogNet address and time out on the server.\n' >&2
}
grep -Eq '^LOGGERNET_REJECT_UNAUTHORIZED=false$' .env || {
  printf 'WARN: LOGGERNET_REJECT_UNAUTHORIZED=false is recommended for the current LogNet certificate path.\n' >&2
}

log "Pulling latest code from origin/$BRANCH"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

log "Validating Docker Compose"
docker compose config >/dev/null

log "Building API and web images"
docker compose build api web

log "Ensuring database is up"
docker compose up -d db

log "Restarting API and web"
docker compose up -d --force-recreate api web

log "Container status"
docker compose ps

log "Smoke testing local web and API"
curl -fsS --max-time 20 http://localhost:3080/ >/dev/null
curl -fsS --max-time 20 http://localhost:3081/api/public/site-status >/dev/null

log "Deployment complete"
printf 'Open: https://observationsmonitor.saeon.ac.za/\n'
printf 'Check jobs after login: curl -b saeon.cookies http://localhost:3081/api/background-status\n'
