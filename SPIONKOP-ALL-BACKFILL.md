# Spionkop raw backfill — validated package

Validated locally on 15 October 2026 for **EFTEON_Spioenkop_AWS**, logger serials **27310 and 3435**. The EC site is not a target. All available valid source dates are included, starting January 2023; October 2021 test dates are explicitly excluded at Marc's instruction. Observation timestamps use SAST (+02:00).

This is ready for live preflight after the new CLI/config/tests are deployed through Git. Nothing in this validation was pushed or deployed to live. Do not recreate the API while the live Mokala import or an availability writer is running.

## Local validation

| Raw table | Prepared rows | Prepared readings | Missing in current local DB |
|---|---:|---:|---:|
| Table10m | 189,493 | 5,430,198 | 0 |
| TableDay | 1,308 | 85,072 | 0 |
| TableHour | 31,578 | 905,540 | 0 |
| TableSolarCharger10m | 75,172 | 1,277,924 | 0 |
| daily | 210 | 7,541 | 0 |
| five_min | 76,646 | 919,733 | 0 |
| hourly | 4,365 | 74,196 | 0 |

Total: **8,700,204 readings**, 131 CSV batches. Every batch passed exact raw schema/unit/site/checksum checks, a rollback-only insert rehearsal and replay. There were zero missing readings in the current local database. A further 21 unit/regression tests passed, including wrong-site/unit/checksum rejection, date exclusions, stale audit rejection and preservation of committed resumable batches. A real recovered-data batch also passed preflight using the final pinned audit hash.

The earlier local import added 10,381 readings (83 Table10m and 10,298 solar charger). This later binary review added no observations: recovered data were already present and agreed with the local database. The previous local 60-month availability recalculation remains applicable; no new mapped observations were inserted during this review. Public charts use Table10m, TableDay and TableHour; solar charger and the native tables are not currently mapped. No public mapping is changed by this package.

## Binary coverage and recovery

All **46 TOB3 files** were checked, including embedded headers, older validation epochs, shifted boundaries and partial frames. The completed audit compared **3,755,539 field values** against text/conflict alternatives without unresolved value mismatches. Older and newer stamps may coexist in a partial frame; the decoder checks each stamp against its reviewed layout rather than treating all changes as corruption.

Recovered **12,990 solar-charger records / 220,830 readings** absent from text exports, covering gaps between 10 May and 1 November 2023. Each recovered record was independently decoded from its original binary bytes, checking its frame SHA256, record number, logger serial, SAST timestamp, raw field names and units. The recovery uses no unit conversion. Those recovered readings already exist locally and agree with the database.

The audit accounts for four remaining truncated fragments: every complete typed record payload in them matches existing text (six payloads total); the shorter pieces lack a complete observation and usable timestamp. Three other unusable minor-frame prefixes have invalid/off-grid timestamp metadata and are retained in the audit, not imported or assigned guessed dates. This is a qualified reconciliation of valid observations, not a claim that damaged bytes contain recoverable measurements.

## Dates and values deliberately excluded

* **25–26 October 2021:** 146 startup/test records excluded after Marc confirmed the dates were test/incorrect.
* **UV maximum event times:** the repeated text `1990-01-01 00:00:03.294967295` corresponds to unusable all-FF NSec bytes in checked source frames. It is not repaired into a calendar time. The final prepared data leave 404 such cells blank; three additional occurrences are inside the quarantined daily rows.
* **TableDay labels 14 April 2023, 16 June 2023 and 14 June 2024:** exclude the entire three rows. Event times and some ten-minute totals indicate the labeled day, while the daily sequence skips the following date and some counters disagree. No complete-row day shift is justified. All original values and comparison evidence are retained in `prepared/quarantined-daily-rows.json` and the audit. These rows already have 66 readings each in the local raw database; this insert-only package does not fix, delete or overwrite those existing readings. A future correction requires a separate reviewed change.
* Conflicting source cells remain blank (1,580 Table10m, two TableDay and 263 TableHour source conflicts). No arbitrary winner is selected.
* Twenty files under data-recovery-attempt folders remain excluded: they contain garbled station identifiers, non-UTF8 bytes and implausible dates. Original source files and the Downloads ZIP remain intact.

Paired native/raw daily pressure minima and maxima agree on all 210 overlapping dates. Hourly pressure ratios are approximately one. Source units match the target raw tables; no pressure rescaling is applied. Status/DataTableInfo/configuration files are not observation-table imports.

The CLI pins the completed binary audit SHA256 and the reviewed date policy, rejects the test dates and ambiguous daily labels, validates raw table identities and units, and uses insert-only conflict handling. Existing readings/statuses are always preserved. Differing preflight counts are not instructions to overwrite them.

## Package integrity

Verify `spionkop-backfill-validated.zip.sha256`, extract to a new folder, then verify every entry in `SHA256SUMS.txt`. The package contains prepared CSVs, validation reports, audited recovered TOA5 files, evidence and code copies. The original 20.9 GB source ZIP is not duplicated in the deployment package; retain it for provenance. Conservative generator flags remain unchanged; `validation/validation-final.json` records the completed independent validation.

## Live deployment later — do not overlap Mokala or availability jobs

1. Finish the running Mokala import and copy its reports out of the API container. Confirm the authenticated `/api/background-status` shows `writer.running=false`; inspect `docker top loggernet-api -eo pid,etime,args` for any remaining backfill process. Do not recreate the container while either is active.
2. Commit and push only the new Spionkop CLI, config, tests and this documentation from the WSL repository. Preserve unrelated local changes. The package's code directory is an audit copy, not a substitute for Git deployment.
3. On the live server:

```bash
cd /opt/saeon-observations-monitor-v2
git status --short --branch
git pull --ff-only &&
docker compose build api &&
docker compose up -d --no-deps api
docker logs --since 2m --tail 20 loggernet-api
```

Keep PostgreSQL and its existing volume unchanged. Do not restore a dump or run `down -v` or volume pruning.

4. Transfer the ZIP/checksum from WSL, verify on the server, extract to a new host directory, and check inner hashes:

```bash
# WSL client
cd /home/private/SOM/backups
sha256sum -c spionkop-backfill-validated.zip.sha256 &&
scp spionkop-backfill-validated.zip spionkop-backfill-validated.zip.sha256 marc@192.168.117.154:/home/marc/

# Server
cd /home/marc
sha256sum -c spionkop-backfill-validated.zip.sha256 &&
test ! -e /home/marc/spionkop-backfill-validated &&
python3 -m zipfile -e /home/marc/spionkop-backfill-validated.zip /home/marc/spionkop-backfill-validated
cd /home/marc/spionkop-backfill-validated
sha256sum -c SHA256SUMS.txt
docker cp prepared loggernet-api:/tmp/Spionkop_prepared
```

5. Run a read-only preflight and review its live counts:

```bash
docker exec loggernet-api node /app/scripts/backfill-spionkop.js \
  --table TableDay \
  --file /tmp/Spionkop_prepared/TableDay_batches/part_001.csv \
  --manifest /tmp/Spionkop_prepared/preparation-report.json \
  --report /tmp/spionkop-TableDay-live-preflight-NEW.json
```

Live missing counts can differ from the already-backfilled local database. Review them before starting the import.

6. When ready, run all seven tables in resumable batches with availability deferred:

```bash
mkdir -p /home/marc/spionkop-backfill-reports
nohup docker exec loggernet-api node /app/scripts/backfill-spionkop-all.js \
  --prepared /tmp/Spionkop_prepared \
  --reports /tmp/spionkop-reports \
  --confirm-database loggernet \
  --operator Marc \
  --metadata defer \
  > /home/marc/spionkop-backfill-reports/all-tables-run.log 2>&1 < /dev/null &
```

Each completed 250-value insertion batch commits and is audited; reruns skip existing keys. Follow progress with `tail -f` and the latest `Starting` line. There are 131 files. Copy `/tmp/spionkop-reports` to the host after completion, before recreating the container. If mapped readings were added, schedule the normal authenticated availability refresh separately once all writers/imports are idle.

## Format references

Campbell Scientific TOB2/TOB3 layout: https://help.campbellsci.com/loggernet-manual/ln_manual/campbell_scientific_file_formats/tob2_or_tob3.htm
Campbell Scientific NSEC storage: https://help.campbellsci.com/crbasic/landing/Content/parameters/datatype1.htm
