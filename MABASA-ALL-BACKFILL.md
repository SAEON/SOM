# Mabasa raw observation backfill — local validation

Validated on 14 October 2026 against local `loggernet_live_20261014`, restored
from that day's verified live backup. Changes on live after the backup can
change the preflight counts. No import has been committed locally or on live.

## Exact raw targets

| Raw table | Fields | Prepared rows | Missing readings in snapshot |
|---|---:|---:|---:|
| TableDay | 71 | 1,522 | 15,683 |
| daily | 36 | 480 | 720 |
| TableHour | 35 | 36,598 | 79,732 |
| hourly | 17 | 11,779 | 102,730 |
| five_min | 12 | 141,638 | 870,658 |

Each file uses `timestamp` followed by that exact raw table's original field
names, validated types and fixed table ID. Public display names are not used.
These are the five historical observation tables available in the supplied
archive. Const_Table, Status, DataTableInfo and live Public variables are not
historical observation imports. Binary TOB3 and reformatted tab copies are
excluded; original TOA5 exports covering the same observation tables are used.

67 batches were tested. Every batch passed schema/type/SAST/interval/checksum
validation, insert-only import, historical metadata refresh and replay with
zero new inserts. Each transaction was rolled back. Totals: 3,071,771 source
readings; 1,069,523 missing; 2,002,248 existing preserved. 50,624 existing readings
differ from prepared text; that count includes unit/text/timestamp formatting
differences and does not prove that existing readings are incorrect.

## Units and withheld source data

TableDay pressure minimum/maximum/average and TableHour average changed from
mbar to kPa. Preparation uses each original file's unit header and converts
mbar to raw-schema kPa with x0.1. Import does not multiply values again.
The latest available mbar daily row is 7 November 2022; the first kPa daily
row is 9 November. The archive has no daily row for 8 November.

Native hourly pressure is labelled hPa but approximately equals the simultaneous
legacy kPa reading until 23 May 2025 15:00 SAST. From 16:00 its magnitude is
approximately 10x the kPa stream, as expected for hPa. Earlier native pressure
is withheld, not automatically converted. Native daily pressure minimum and
maximum on 22–23 May have the same problem and are withheld. The exact exclusions
are in cell-exclusions.json and withheld_readings.csv: 234 unique pressure cells.
Abri's confirmation is needed before preparing those withheld pressure cells.

Native daily dates 14–21 May 2025 are withheld because the source contains
ten-second readings under the daily name. No daily aggregates are invented.
Four conflicting source cells (three TableDay PingTime_Avg and one hourly cell)
are left blank; the original alternatives remain in conflicting_readings.csv.
These exclusions mean the package does not fill every possible historical gap.

Existing historical database pressure values remain unchanged, even when the
current schema/multiplier no longer matches their original unit. Correcting
existing data requires a separately reviewed operation. This is gap filling only.

## Artifacts

`prepared/` contains full raw masterfiles, bounded CSV batches, raw schema,
checksum manifest, unit conversion/conflict/exclusion/source inventories.
`validation/validation-summary.json` and individual reports contain rollback
test results. `audit/` contains source-unit histories and paired pressure examples.
The archive also includes this document and SHA256SUMS.txt.

Use the batches, not the large full hourly/five-minute masters, for live imports.
The manifest binds every batch to its SHA256. Do not edit a batch or replace its
manifest manually. Regenerate reviewed files to change an exclusion/conversion.

## Deployment and transfer (not yet done)

Update the live checkout and rebuild only the API image:

```bash
cd /opt/saeon-observations-monitor-v2
git status --short --branch
# Continue only when tracked files are clean.
git pull --ff-only && docker compose build api && docker compose up -d --no-deps api
docker exec loggernet-api test -f /app/scripts/backfill-mabasa.js
docker logs --since 2m --tail 30 loggernet-api
```

This restarts the API only. PostgreSQL, its volume and web are not recreated.
No backfill occurs during deployment. Then transfer/verify the prepared archive.
Before a committed import, check the current verified backup and read-only
preflight results. The local snapshot counts are not a substitute for live checks.

The custom CLI source is included in SOM's API image. The entry
point is `api/scripts/backfill-mabasa.js`; supporting modules and reviewed config
must be included. This package contains input data and reports, not a deployed
application. Do not use the old public-name backfill screen.

From the local WSL terminal, copy the prepared archive and its checksum:

```bash
scp /home/private/SOM/backups/mabasa-backfill-validated.zip /home/private/SOM/backups/mabasa-backfill-validated.zip.sha256 marc@192.168.117.154:/home/marc/
```

On live, verify the outer checksum before extraction:

```bash
cd /home/marc
sha256sum -c mabasa-backfill-validated.zip.sha256
mkdir -p mabasa-backfill-validated
unzip mabasa-backfill-validated.zip -d mabasa-backfill-validated
cd mabasa-backfill-validated
sha256sum -c SHA256SUMS.txt
```

Do not restore a database or remove its Docker volume to run backfill. Verify a
current backup and confirm the deployed CLI first. Copy only `prepared/` into
the API container and use the dedicated exact-table CLI for preflight/import.

## Per-batch CLI

After copying prepared/ to /tmp/Mabasa_prepared inside the deployed API container:

```bash
docker exec loggernet-api node /app/scripts/backfill-mabasa.js --table TableHour --file /tmp/Mabasa_prepared/TableHour_batches/part_001.csv --manifest /tmp/Mabasa_prepared/preparation-report.json --report /tmp/mabasa-TableHour-001-preflight.json
```

This is read-only. Review current missing/existing/differing counts. For a
committed import, the same command additionally requires:
`--mode import --confirm-database loggernet --operator Marc`, with a fresh
report filename. These flags commit changes; they are not a rollback test.
Choose the correct table name and its corresponding batch for every run.
Preserve reports by copying them out of the container; audit rows also remain
in backfill_jobs. Background ingestion has its own update behavior and is not
changed by this CLI.

An import inserts only absent field/timestamp pairs with status backfilled.
Each batch of 250 observation candidates and its audit record share a transaction.
Completed batches remain saved if a later batch or availability refresh fails.
Availability is refreshed separately in SAST monthly windows. Rerun the same
validated file with a new report path to resume; existing values are skipped.
Existing public total_count is left for the normal summary refresh.

### Import progress and bounded inserts

The CLI reuses preflight results to insert only missing readings, sorted by timestamp, in batches of 250. Every batch still uses `ON CONFLICT DO NOTHING` to preserve readings added concurrently. Progress is printed for insertion and before metadata refresh. Each completed insertion batch is committed separately. A timeout rolls back only the current transaction; earlier batches remain saved. Wait for `Import committed.` before treating an import as complete.

Run all five tables sequentially with `node /app/scripts/backfill-mabasa-all.js --prepared /tmp/Mabasa_prepared --reports /tmp/mabasa-reports --confirm-database loggernet --operator Marc`. The runner stops on any failed file; rerunning skips existing readings and retries metadata. Copy reports out before recreating the API container. Saved observation batches and audit records persist in PostgreSQL.

### Import observations before refreshing availability

Pass `--metadata defer` to the single-file CLI or all-table runner to save and audit observation batches without recalculating availability. Existing readings remain protected. Reports explicitly set `metadataDeferred: true` and `metadataComplete: false`. The runner continues through all five tables; it does not claim availability is complete. Later rerun with the default `--metadata refresh` to retry the per-file availability refresh without duplicating observations, or run a separately configured historical availability job. Preserve reports outside the container before rebuilding.

### One-off historical availability API refresh

After observation imports finish, an authenticated Admin/SU can POST
`/api/background/run-availability` with JSON `{"monthsBack":60}` to recalculate
the preceding 60 months across mapped sites, followed by availability cleanup,
weekly/monthly/yearly summaries, summary date ranges and dataset counts. This does not fetch or overwrite observations.
The optional numeric window must be an integer from 1 to 120; omitting it retains
the configured normal daily window. It does not change the scheduled window.
Read `/api/background-status` and wait for writer.running=false and lastError=null.
Do not restart the API while this background job is running.

### Slow all-site availability reports

The all-site report endpoint allows five minutes for its read-only summary query. Set `AVAILABILITY_REPORT_TIMEOUT_MS` in the API container environment to override this (1,000–540,000 ms; larger values are capped). The allowance is transaction-local and does not change ingestion or other query timeouts. The web container proxy allows 600 seconds; any external reverse proxy must also allow enough time. A longer allowance avoids premature cancellation on slow storage; investigate the query plan and storage if reports remain slow.
