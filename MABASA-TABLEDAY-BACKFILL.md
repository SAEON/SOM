# Mabasa TableDay backfill

This is a dedicated command-line workflow for raw `EFTEON_MabasaTA_AWS / TableDay`,
table ID `39e0a801-f0a1-4481-8301-f649c4646788`, datalogger serial `6456`.
It does not use the public `daily` selector or need a new interface.
The native raw `daily` table and other sites are outside this import.

## Unit audit

The audit examined headers from 183 original comma-separated TOA5 files.
Pressure is the only measurement unit change found after equivalent unit labels
were normalized. `TableDay` pressure minimum, maximum and average changed from
`mbar` to `kPa`; `TableHour` average pressure changed too. Binary TOB3 and
reformatted tab-separated copies are excluded from this finding.

Latest available mbar TableDay row: 7 November 2022 SAST.
Earliest available kPa TableDay row: 9 November 2022 SAST.
The archive has no TableDay row for 8 November; this brackets the transition,
not a confirmed exact logger-program change time.

The current raw table schema uses kPa. Its public mapping applies x10 to hPa.
Preparation converts explicitly declared source mbar values to kPa with x0.1;
source kPa values remain unchanged. Import applies no additional multiplier.
Example: 22 June 2022 BPressure_Min 1020.373 mbar becomes 102.0373 kPa in
the prepared file, which should display as 1020.373 hPa through that mapping.
Every conversion is logged in unit_conversions.csv.

Existing historical database pressure values are not normalized by this import.
Some are still mbar-sized despite the current schema/multiplier. They remain
unchanged and require a separately reviewed correction. Do not treat backfill
as proof that existing pressure values or all sensor measurements are correct.

## Preparation

Use the shared Python tool on the expanded raw folder with the Mabasa schema,
`--serial 6456 --table TableDay --daily-table TableDay`, and
`--unit-rules mabasa-tableday-unit-rules.json`. The raw 71 field names are kept.
Files contain `timestamp` plus all 71 raw fields. Blanks are skipped; zero is valid.
Three conflicting PingTime_Avg cells are blank and retained in the conflict report.
No missing measurements are fabricated.

The preparation manifest records SHA256 of the masterfile. The import command
requires that manifest and rejects an altered or different file. For a smaller
batch, create a new reviewed manifest with its checksum; do not reuse the full
file's manifest. Current full file fits the 20,000-row/250,000-value caps.

## Local commands

Copy the prepared folder into the local API container:

```bash
docker cp /mnt/c/Users/Marc/Documents/SOM/Mabasa_TableDay_ready som-migration-api:/tmp/Mabasa_TableDay_ready
```

Read-only preflight; select a fresh report filename for each run:

```bash
docker exec som-migration-api node /app/scripts/backfill-mabasa-tableday.js --file /tmp/Mabasa_TableDay_ready/Master_TableDay_raw.csv --manifest /tmp/Mabasa_TableDay_ready/preparation-report.json --report /tmp/mabasa-preflight-new.json
```

Full rollback test (local only):

```bash
docker exec -e ALLOW_LOCAL_BACKFILL_TEST=true som-migration-api node /app/scripts/backfill-mabasa-tableday.js --file /tmp/Mabasa_TableDay_ready/Master_TableDay_raw.csv --manifest /tmp/Mabasa_TableDay_ready/preparation-report.json --report /tmp/mabasa-test-new.json --mode test
```

An actual import requires both `--mode import` and
`--confirm-database loggernet_live_20261014 --operator Marc` on local.
It commits data; preflight and test do not. No import has yet been committed.
For production use the production container/database names, after code deployment,
fresh backup verification and review of the counts. The files/commands in this
change are not yet deployed live. Do not run the old public backfill importer.

## Safety and refresh behavior

Only missing (field_id, timestamp) pairs are inserted as `backfilled`.
Every existing value and status is preserved, even if it differs from the source.
Preflight reports missing/existing/differing counts without writing observations.
Import revalidates the file and current database schema and records an audit row
in backfill_jobs with operator, raw target, counts and masterfile checksum.

Import refreshes daily availability for affected public keys and SAST dates,
including other raw fields feeding those same keys. Repeated source timestamps
are counted once. Weekly/monthly/yearly averages are recomputed for affected
periods. Raw date bounds are recomputed and public date bounds are extended.
The existing public total_count is left for the normal summary refresh.
Observation inserts, metadata refresh and the audit row share one transaction:
any failure rolls them back together. A test run rolls them all back deliberately.

The separate background ingestion has its own upsert behavior. This command's
preservation guarantee does not change those jobs. Local jobs stay disabled.

## Local validation results

Prepared file: 1,522 days, 94,839 nonblank readings.
Against the restored October 14 live snapshot: 15,683 missing readings,
79,156 existing, of which 20,595 differ from the prepared raw text.
The differing count includes pressure normalization, timestamp/text formatting
and potentially genuine value differences; it is not a list of proven bad data.
Existing values are always skipped. Review separately before any correction.

The full rollback test inserted the missing readings, refreshed historical
availability and verified a replay inserted zero. All changes were rolled back.
Separate local fixtures verified existing value/status preservation and numeric
zero insertion. Newer live changes after the snapshot can change the counts.
