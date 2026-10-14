# Dynamic downloads and memory deployment — October 2026

Pushes do **not** deploy production. The workflow is manual (`workflow_dispatch`).
Keep e-news running. SOM uses the existing production project and volume:

`saeon-observations-monitor-v2_loggernet-db-data`

## Wait for and validate the backup

Do not deploy while the current `pg_dump` is running. In its original shell,
immediately after it returns, check `echo $?`. Continue only if it is **0**.
The backup folder must stay private (`chmod 700`). Then validate and record it:

```bash
docker exec -i loggernet-db pg_restore --list < "$HOME/som-backup-2026-10-14/loggernet.dump" > "$HOME/som-backup-2026-10-14/loggernet.toc.txt"
sha256sum "$HOME/som-backup-2026-10-14/loggernet.dump" > "$HOME/som-backup-2026-10-14/loggernet.dump.sha256"
touch "$HOME/som-backup-2026-10-14/loggernet.dump.complete"
```

Run each command separately and stop on an error; do not create the `.complete`
marker after a failed dump or table-of-contents check. Listing a dump checks its
catalog, not every data block. A separate restore test gives stronger assurance.
The old local restore contained historical rows conflicting with a NOT VALID
check constraint; a recovery restore may need to defer that constraint until
after loading, then reinstate it NOT VALID. Do not test a restore over production.

## Deploy only after backup completion

```bash
cd /opt/saeon-observations-monitor-v2
git status --short --branch
git pull --ff-only origin main
SOM_BACKUP_DUMP="$HOME/som-backup-2026-10-14/loggernet.dump" ./scripts/deploy-server.sh
```

Inspect any local tracked changes before pulling. Keep server `.env` and
`api/.env`; never replace them with the local development configuration.
Production must retain `ENABLE_BACKGROUND_JOBS=true` and its LoggerNet host
override. Local testing used `ENABLE_BACKGROUND_JOBS=false` intentionally.

The script checks the volume and backup, tags the previous app images, builds
before downtime, stops only SOM API, waits for PostgreSQL to become healthy,
adds availability indexes concurrently, and starts the rebuilt API and web.
It does not restore a dump, delete volumes, or stop e-news. PostgreSQL settings
default to shared_buffers=4GB, effective_cache_size=10GB (an estimate),
work_mem=16MB, maintenance_work_mem=512MB, and autovacuum_work_mem=128MB.
Environment overrides still take precedence. Availability tasks use scoped
128MB work memory and bounded concurrency. Background CSV generation is removed.

Expect a brief SOM interruption during PostgreSQL/API recreation. If a step
fails, stop and inspect it; the script does not automatically restore data or
hide a failed migration. The availability migration is idempotent; partial
failure can leave an invalid concurrent index, which must be inspected before
retrying (IF NOT EXISTS alone does not repair an invalid index).

## Verify

Confirm the same named database volume is mounted, memory settings match, and
SOM containers are healthy. Sign in and test a raw Daily/Five_min download,
mapped download, table preview, and availability report. The example observation
36.57 for SA Wildlife College exports as 20/11/2020 00:00:00 SAST; UTC storage
remains 19/11/2020 22:00:00. Check background status and sync logs without
triggering duplicate runs. E-news should still be running.

## Roll back application/configuration if required

Use the script's printed rollback tags and the saved Compose file/commit. Pause
SOM API, restore the prior Compose configuration and app image references, and
recreate only SOM services using the same project/volume. The added indexes can
remain. Never use `docker compose down -v`, `docker volume rm`, or a database
restore as routine code rollback. If data recovery is actually required, stop
and plan an isolated restore before replacing anything.

## Validation already performed locally

- 14 API regression tests for dynamic SAST exports, cleanup, progress, and bounded ingestion.
- UI/helper tests for download states, one request per preview page, native streaming, and timezone independence.
- Exact before/after comparisons for mapped/raw previews and availability responses.
- Full raw Daily CSV (1,960 rows) and mapped CSV progress/byte-count checks.
- Local PostgreSQL 4GB profile and transaction-local background memory reset checks.

Live LoggerNet ingestion has not been exercised locally; scheduled jobs remain
disabled in the restored local installation. Deployment script syntax and
Compose validation are checked locally; the script is not run against production
until the server backup has completed.
