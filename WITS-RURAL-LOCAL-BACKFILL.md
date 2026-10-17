# Wits Rural raw backfill — local validation

Target: **EFTEON_LowveldWitsRural_AWS**, logger **27307**. This is the AWS site, not EFTEON_LowveldMRCWits_ERS.

Marc requested records from **1 June 2023 onward**, interpreted as SAST (+02:00). The selected archive contains no June observations: the first retained raw observations are 18 July 2023. Earlier records are excluded; no gaps are fabricated. The archive ends 11 September 2026 for some tables and 31 August for others. This is not a claim that later observations are missing from the live logger/database.

## Completed validation

* All 122 archive files are TOA5 text. No binary files require recovery. Ten Const_Table configuration files are excluded from observation imports.
* All 112 observation files have the expected serial and exact raw headers/units. No unit conversions, malformed-width rows, off-grid observation timestamps or suspect event timestamps were found after the cutoff.
* Independent verification compared **65,665,167** source value occurrences with the prepared masterfiles, allowing only blank conflict cells and explicit missing markers.
* All seven tables retain their own raw names. There is no remapping between native and legacy raw tables.
* **57 conflicting cells** are blank: Table10m 46, TableDay 1, TableHour 10. Source conflicts are retained in per-table audit CSVs, with no arbitrary choice of winner.
* Paired daily pressure has 425 pairs each for minima/maxima, agreeing exactly except one rounding-scale minimum difference. Hourly pressure ratios range 0.99866–1.00274; no factor-of-ten discrepancy. Source pressure units match target hPa/hpa exactly per field. Existing pressure readings are preserved.
* All **163 batches** passed rollback-only insertion and repeat-import tests. Eleven unit/regression tests passed, covering cutoff boundaries, wrong site/serial, changed units, stale source audit, tampered CSV, zero values, conflict preservation and resumable commits.
* The actual local insert-only import committed **32,234 readings**; no existing values/statuses were overwritten. A sample of 700 existing value/status pairs was verified unchanged. Full post-import verification is recorded separately.

| Raw table | Prepared readings | Locally inserted |
|---|---:|---:|
| TableDay | 72,940 | 198 |
| daily | 15,300 | 72 |
| TableHour | 768,578 | 1,856 |
| hourly | 173,349 | 799 |
| Table10m | 4,610,889 | 16,556 |
| TableSolarCharger10m | 2,618,765 | 5,877 |
| five_min | 1,506,342 | 6,876 |

The public Wits Rural Facility AWS availability charts currently map Table10m (10 minute), TableDay (daily) and TableHour (hourly). The native daily/hourly/five_min and solar charger tables are not added to public mappings by this import. Existing differing readings remain untouched; prepared source conflicts are withheld, not used to erase database values.

## Local execution and evidence

Prepared files: `/home/private/SOM/WitsRural_prepared`.
Evidence: `C:/Users/Marc/Documents/SOM/WitsRural_validation`.
Committed reports: `/home/private/SOM/backups/wits-rural-local-actual-import/wits-rural-reports`.
CLI: `api/scripts/backfill-wits-rural.js` and `api/scripts/backfill-wits-rural-all.js`.
Database: `loggernet_live_20261014` in `som-migration-db`.

The config pins exact site/table IDs, raw fields/types/units, source schema-audit hash and June 2023 date policy. Prepared batch hashes are checked before every import. Existing `(field_id,timestamp)` keys use ON CONFLICT DO NOTHING. Completed 250-value batches are separately committed and audited. Availability is deferred so a summary failure cannot undo saved observations.

Local availability must be refreshed through the normal authenticated `/api/background/run-availability` endpoint using 48 months to cover all imported dates. Final completion and before/after results are recorded in the validation evidence. No live deployment or Git push is included in this local task.

## Availability result

The normal authenticated API refresh completed all five stages at **2026-10-16T14:43:02.969Z** in **272.1 seconds**, with no error. The 48-month window covers all imported dates. Daily chart summaries gained 9,978 ten-minute readings, 117 daily readings and 1,088 hourly readings (11,183 mapped readings total). The public chart API for **12 February 2026** now returns **100%** for all three mapped tables, up from zero. Other dates may retain gaps where the archive has no valid source observations; for example 13 February ten-minute availability is 99.31% and hourly 95.83%. No missing observations were invented.

All 9,766,163 prepared readings are present after import, with zero missing. Source conflicts and existing differing readings remain preserved/withheld as documented. Local source and code are ready for review; a separate Git push, live preflight and live import are still needed before server deployment.

## Live deployment

Keep completed backfill reports on the host before recreating the API. Confirm `/api/background-status` has `writer.running=false`, and no backfill CLI is running. Do not interrupt an active availability refresh or import.

Transfer from local WSL:

```bash
cd /home/private/SOM/backups
sha256sum -c wits-rural-backfill-validated.zip.sha256 &&
scp wits-rural-backfill-validated.zip wits-rural-backfill-validated.zip.sha256 marc@192.168.117.154:/home/marc/
ssh marc@192.168.117.154
```

On the server, verify the transfer and deploy only the API from Git:

```bash
cd /home/marc
sha256sum -c wits-rural-backfill-validated.zip.sha256
cd /opt/saeon-observations-monitor-v2
git status --short --branch
git pull --ff-only &&
docker compose build api &&
docker compose up -d --no-deps api
docker logs --since 2m --tail 20 loggernet-api
docker exec loggernet-api test -f /app/scripts/backfill-wits-rural-all.js
```

Keep PostgreSQL and its existing data volume unchanged. Extract into a new folder, verify all inner hashes, and copy prepared files:

```bash
cd /home/marc
test ! -e /home/marc/wits-rural-backfill-validated &&
python3 -m zipfile -e wits-rural-backfill-validated.zip wits-rural-backfill-validated
cd /home/marc/wits-rural-backfill-validated
sha256sum -c SHA256SUMS.txt
docker cp prepared loggernet-api:/tmp/WitsRural_prepared
```

Run a read-only live preflight and review its counts before importing:

```bash
docker exec loggernet-api node /app/scripts/backfill-wits-rural.js \
  --table TableDay \
  --file /tmp/WitsRural_prepared/TableDay_batches/part_001.csv \
  --manifest /tmp/WitsRural_prepared/preparation-report.json \
  --report /tmp/wits-rural-TableDay-live-preflight-001.json
```

Local missing counts are a comparison only; live may differ. Once reviewed, run all seven tables with availability deferred:

```bash
mkdir -p /home/marc/wits-rural-backfill-reports
docker cp loggernet-api:/tmp/wits-rural-TableDay-live-preflight-001.json /home/marc/wits-rural-backfill-reports/
nohup docker exec loggernet-api node /app/scripts/backfill-wits-rural-all.js \
  --prepared /tmp/WitsRural_prepared \
  --reports /tmp/wits-rural-reports \
  --confirm-database loggernet \
  --operator Marc \
  --metadata defer \
  >> /home/marc/wits-rural-backfill-reports/all-tables-run.log 2>&1 < /dev/null &
```

Monitor with `tail -n 15 /home/marc/wits-rural-backfill-reports/all-tables-run.log`. Completion reports all seven tables and **163 files**. Saved batches remain committed if interrupted; rerun the same runner to recheck and skip existing keys. Copy `/tmp/wits-rural-reports` to the host after completion and before API recreation. Refresh availability separately through the authenticated API, using 48 months to cover the historical observations. No automated CSV generation or public field remapping is introduced.
