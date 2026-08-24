# Docker Deployment Runbook

This stack runs on host ports chosen to avoid older services while testing:

- Web: http://localhost:3080
- API: http://localhost:3081
- Postgres: localhost:55432

Start it from the repository root:

```sh
docker compose up -d --build
```

Deployment-sensitive values should live in `.env` on the server, copied from `.env.example` and filled in with real values. They can also be supplied as environment variables without editing the compose file:

```sh
POSTGRES_PASSWORD='change-me' \
NODE_ENV=production \
ENABLE_BACKGROUND_JOBS=false \
LOGGERNET_REJECT_UNAUTHORIZED=false \
OAUTH_CALLBACK_URL='https://your-domain.example/api/logged_in' \
WEB_HOST_PORT=3080 \
API_HOST_PORT=3081 \
DB_HOST_PORT=55432 \
docker compose up -d --build
```

The first run restores `../backups/loggernet-live-2026-08-13/loggernet-2026-08-13.dump` into the `loggernet-db-data` Docker volume if that volume is empty. Because the database is large, a logical restore can take a long time. Later starts reuse the volume and skip the restore.

The database healthcheck waits for a `public.docker_restore_status` marker that is written after `pg_restore` finishes. This prevents the API from starting against a half-restored database on a fresh server.

For normal production updates, do not remove the database volume. Pull code, rebuild `api` and `web`, and restart those containers:

```sh
git pull
docker compose build api web
docker compose up -d api web
```

The preferred production path is now:

```sh
./scripts/deploy-server.sh
```

This keeps the live database volume in place, rebuilds only the application containers, and runs a short local smoke test.

Set `ENABLE_BACKGROUND_JOBS=true` when the API container should run the scheduled reader/writer sync loops.

The public warning banner is database-controlled through `public.site_status`. Status values `testing`, `maintenance`, `warning`, `degraded`, and `offline` show the banner. Status values `done`, `online`, and `normal` hide it.

To mark transfer testing complete:

```sql
UPDATE public.site_status
SET status = 'done',
    message = 'SAEON observations monitor API is online.',
    details = 'Live-transfer testing has been completed.',
    updated_by = 'technician',
    updated_at = now()
WHERE id = 1;
```

To force a fresh restore:

```sh
docker compose down
docker volume rm loggernet_loggernet-db-data
docker compose up --build
```

Use the actual volume name from `docker volume ls` on the target host. On the production v2 server it is typically `saeon-observations-monitor-v2_loggernet-db-data`.
