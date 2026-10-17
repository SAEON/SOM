# iThemba Labs raw-source validation

Target **EFTEON_IThembaLabs_ERS**, logger **33665**. Cutoff: **1 June 2023 onward in SAST**, as requested by Marc. This archive starts in June 2024 and ends 11 September 2026; no earlier observations were invented.

The 78 original TOA5 `.dat` files match the exact raw schemas and units for Table10Minute (16 fields), TableHour (22) and TableDay (45). No raw header/unit mismatches, conflicting cells, off-grid observation dates or suspect event times were found. There are no TOB3 files in the archive. The original archive passed CRC verification and its SHA256 was retained.

Independent reconciliation compared **37,331,063 raw source-value occurrences** without value mismatches. Thirty-three derived text/CSV masterfile copies were also checked. They add no observations absent from the raw sources, but include 47,451 truncated event-time occurrences, 20,804 values rounded to exported decimal precision, and 235 numeric export-representation differences. Only original raw `.dat` values are used in prepared candidates; no derived rounding, renamed headers or lost event seconds are substituted for the raw readings. Gap/completeness reports, configuration/program files and maintenance records are not observation imports.

| Raw table | Prepared timestamp rows | Prepared readings | Missing locally |
|---|---:|---:|---:|
| Table10Minute | 117,006 | 1,872,063 | 0 |
| TableHour | 19,501 | 428,568 | 0 |
| TableDay | 813 | 36,580 | 0 |

All **48 batches** passed rollback-only insertion and replay tests. Eleven site-specific/shared regression tests passed. **All 2,337,211 nonmissing prepared readings already exist in the local restored database** (`loggernet_live_20261014`). The actual local insert-only runner subsequently completed all 48 files and inserted zero readings. All existing values/statuses were retained; 300 existing samples were verified unchanged. Availability was not recalculated because the observation data were unchanged. These results do not substitute for a live preflight.

## Existing values requiring separate review

Strict text comparison flagged 14,751 existing values: 10,569 are equivalent event-time formatting, and 3,106 are numerically equivalent representations. The remaining **1,076** differences are:

* **TableHour / DewPointTemp_Avg:** 983 readings, 13 January–22 February 2025. Example: 13 January 2025 00:00 SAST, raw source **13.92**, local database **13.77**. The reason for the differences has not been established; existing values may have been corrected previously. Do not overwrite automatically.
* **TableHour / ScanCount:** 86 readings, 22–25 October 2024. Example: 22 October 00:00 SAST, raw source **3600**, local database **0.826**.
* **TableDay / LoggerLithiumBatt:** seven readings, 9–15 February 2025. Raw source says **OK ON POWER UP**, while the local database contains non-readable strings.

The insert-only CLI preserves all these existing values/statuses. Any correction must be a separate reviewed operation with a bounded change report and before-values retained. No correction is performed by this validation.

Prepared files: `/home/private/SOM/IThemba_prepared`.
Evidence: `C:/Users/Marc/Documents/SOM/IThemba_validation`.
Source code: `api/ithemba-backfill.js`, `api/ithemba-backfill-config.json`, `api/scripts/backfill-ithemba.js`, `api/scripts/backfill-ithemba-all.js`, `api/tests/ithemba-backfill.test.js`.

The CLI pins exact raw table IDs/schema/units, logger serial 33665, source schema audit and June 2023 cutoff, and validates prepared file checksums. Imports, if ever required after live preflight, use the shared resumable ON CONFLICT DO NOTHING helpers. Deploy source code through Git, then perform a separate live preflight; local missing counts do not guarantee the live counts. Existing-value corrections are outside this insert-only deployment.


## Live deployment

Keep completed backfill reports on the host before recreating the API. Confirm `/api/background-status` has `writer.running=false`, and no backfill CLI is running. Do not interrupt an active availability refresh or import.

Transfer from local WSL:

```bash
cd /home/private/SOM/backups
sha256sum -c ithemba-backfill-validated.zip.sha256 &&
scp ithemba-backfill-validated.zip ithemba-backfill-validated.zip.sha256 marc@192.168.117.154:/home/marc/
ssh marc@192.168.117.154
```

On the server, verify the transfer and deploy only the API from Git:

```bash
cd /home/marc
sha256sum -c ithemba-backfill-validated.zip.sha256
cd /opt/saeon-observations-monitor-v2
git status --short --branch
git pull --ff-only &&
docker compose build api &&
docker compose up -d --no-deps api
docker logs --since 2m --tail 20 loggernet-api
docker exec loggernet-api test -f /app/scripts/backfill-ithemba-all.js
```

Keep PostgreSQL and its existing data volume unchanged. Extract into a new folder, verify all inner hashes, and copy prepared files:

```bash
cd /home/marc
test ! -e /home/marc/ithemba-backfill-validated &&
python3 -m zipfile -e ithemba-backfill-validated.zip ithemba-backfill-validated
cd /home/marc/ithemba-backfill-validated
sha256sum -c SHA256SUMS.txt
docker cp prepared loggernet-api:/tmp/IThemba_prepared
```

Run a read-only live preflight and review its counts before importing:

```bash
docker exec loggernet-api node /app/scripts/backfill-ithemba.js \
  --table TableDay \
  --file /tmp/IThemba_prepared/TableDay_batches/part_001.csv \
  --manifest /tmp/IThemba_prepared/preparation-report.json \
  --report /tmp/ithemba-TableDay-live-preflight-001.json
```

Local missing counts are a comparison only; live may differ. Once reviewed, run all three tables with availability deferred:

```bash
mkdir -p /home/marc/ithemba-backfill-reports
docker cp loggernet-api:/tmp/ithemba-TableDay-live-preflight-001.json /home/marc/ithemba-backfill-reports/
nohup docker exec loggernet-api node /app/scripts/backfill-ithemba-all.js \
  --prepared /tmp/IThemba_prepared \
  --reports /tmp/ithemba-reports \
  --confirm-database loggernet \
  --operator Marc \
  --metadata defer \
  >> /home/marc/ithemba-backfill-reports/all-tables-run.log 2>&1 < /dev/null &
```

Monitor with `tail -n 15 /home/marc/ithemba-backfill-reports/all-tables-run.log`. Completion reports all three tables and **48 files**. Saved batches remain committed if interrupted; rerun the same runner to recheck and skip existing keys. Copy `/tmp/ithemba-reports` to the host after completion and before API recreation. Refresh availability separately through the authenticated API, using 48 months to cover the historical observations. No automated CSV generation or public field remapping is introduced.
