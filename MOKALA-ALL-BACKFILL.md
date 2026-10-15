# Mokala raw observation backfill — validated locally

Site: EFTEON_Mokala_AWS. Datalogger serial: 27084. Scope: records on or after 1 January 2024 SAST, at Marc's instruction. Validated on 15 October 2026 using local loggernet_live_20261014. No observations were retained by these tests and nothing was deployed to live.

| Raw table | Prepared rows | Missing readings in local snapshot |
|---|---:|---:|
| Table10m | 90,576 | 1,857 |
| TableDay | 621 | 195 |
| TableHour | 15,098 | 290 |
| TableSolarCharger10m | 89,567 | 1,139 |
| daily | 269 | 108 |
| five_min | 101,034 | 213,924 |
| hourly | 8,240 | 170 |

Total: 5,985,104 prepared readings; 217,683 missing; 5,767,421 existing preserved. There are 106 CSV batches. Every batch passed exact raw table/site/type/unit checks, SAST/grid validation, insert-only rollback testing, and replay with zero new inserts. Unit/regression tests also cover wrong-site identities, changed pressure units, changed checksums, pre-2024 dates, conflict preservation, and resumable failure behavior.

## Source coverage and exclusions

The original Level zero data (1).zip contains 126 TOA5 text exports and 79 TOB3 binary files (including preallocated zero space). All binary files were scanned, including full and partial frames and embedded program headers. Comparing 4,748,201 binary values at text-output precision found seven post-2024 records absent from the original text: six TableSolarCharger10m rows and one five_min row. These were recovered from valid source-stamped frames into separate TOA5 files; all 114 fields were independently checked against the original frame hashes and headers. Historical-stamp frames were separately decoded and their post-2024 measurements matched the text. Pre-2024 observations are excluded; keep the source archive and detailed audit for provenance.

The resulting text plus recovered rows covers the checked binary observations within the approved date scope. Numeric comparison allows decimal-output rounding plus one float32 ULP; this is semantic coverage, not byte-for-byte equivalence. Original source conflicts remain unresolved: 83 cells (70 Table10m, 12 TableHour, one TableDay) are blank in prepared candidates. Their largest numeric difference is 0.0001. No arbitrary winner was selected, and no existing database value is overwritten.

All text field names and unit headers match their respective raw SOM tables. Daily pressure min/max agree across all 269 paired native/legacy dates; no factor-of-ten pressure conversion was found or applied. Hourly values can differ between table calculations; they stay in their original raw tables. Source pressure includes low outliers; no QC correction or rescaling was invented. Const_Table and Public are not historical observation imports. The generator's candidate_only/import_ready flags remain conservative; validation-final.json records the completed independent tests.

## Deployment later

Do not redeploy while a live availability refresh is running. Preserve the existing database volume. Review and push the Mokala CLI/config/tests through GitHub first, then pull on the server and rebuild/recreate only the API. This package does not itself deploy code, restore databases, or delete data.

Verify mokala-backfill-validated.zip.sha256 before extracting; then verify SHA256SUMS.txt inside the package. Copy prepared/ into the API container as /tmp/Mokala_prepared. Existing prepared files in container /tmp may disappear on recreation; keep the host ZIP and reports.

First run the single daily preflight (does not write observations):

```bash
docker exec loggernet-api node /app/scripts/backfill-mokala.js \
  --table TableDay \
  --file /tmp/Mokala_prepared/TableDay_batches/part_001.csv \
  --manifest /tmp/Mokala_prepared/preparation-report.json \
  --report /tmp/mokala-TableDay-preflight-NEW.json
```

After reviewing live preflight output, the all-table import command is:

```bash
docker exec loggernet-api node /app/scripts/backfill-mokala-all.js \
  --prepared /tmp/Mokala_prepared \
  --reports /tmp/mokala-reports \
  --confirm-database loggernet \
  --operator Marc \
  --metadata defer
```

Each completed 250-value batch is committed and audited. Retry safely after an interruption: existing field/timestamp pairs are skipped. No UPDATE or DELETE is issued for observations. Copy /tmp/mokala-reports to the server host before another API recreation. Availability is deliberately deferred; run the authenticated historical availability API separately after imports complete. The live missing count may differ from the local snapshot.

## Format references

Campbell Scientific TOB2/TOB3 layout: https://help.campbellsci.com/loggernet-manual/ln_manual/campbell_scientific_file_formats/tob2_or_tob3.htm
Campbell Scientific TOA5 layout: https://help.campbellsci.com/loggernet-manual/ln_manual/campbell_scientific_file_formats/toa5.htm

## Live release sequence while an earlier refresh is running

1. On the WSL client, verify and transfer the package (does not change live containers):

```bash
cd /home/private/SOM/backups
sha256sum -c mokala-backfill-validated.zip.sha256 &&
scp mokala-backfill-validated.zip mokala-backfill-validated.zip.sha256 marc@192.168.117.154:/home/marc/
```

2. SSH to the server and verify the received ZIP:

```bash
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 marc@192.168.117.154
cd /home/marc
sha256sum -c mokala-backfill-validated.zip.sha256
```

While the existing live refresh is running, stop here or only extract/verify host files. Do not rebuild/recreate/restart the API, start another availability refresh, or start this backfill yet. Check the live authenticated `/api/background-status`: wait for `writer.running=false`, a completed `lastFinishedAt`, and `writer.lastError=null`. Log lines alone are not a substitute for checking the job status.

3. Once idle, check the repository is clean, pull, and rebuild only application containers:

```bash
cd /opt/saeon-observations-monitor-v2
git status --short --branch
git pull --ff-only &&
docker compose build api web &&
docker compose up -d --no-deps api web
```

Keep PostgreSQL 16 and the existing database volume unchanged. Do not run `down -v`, restore a dump, or prune volumes. Check API startup logs and HTTP health after deployment. The frontend must also be rebuilt for the browser cache fix; a normal page reload then loads its new hashed assets. Chart responses revalidate and chart fetches bypass stale browser data.

4. Extract into a new host folder with available Python 3 (or unzip), verify every inner checksum, then copy `prepared/` into the newly recreated API. Check the destination directory does not already contain a different run before copying:

```bash
cd /home/marc
test ! -e /home/marc/mokala-backfill-validated &&
python3 -m zipfile -e /home/marc/mokala-backfill-validated.zip /home/marc/mokala-backfill-validated
cd /home/marc/mokala-backfill-validated
sha256sum -c SHA256SUMS.txt
docker cp /home/marc/mokala-backfill-validated/prepared loggernet-api:/tmp/Mokala_prepared
```

If any command fails, stop and inspect the output. Run the daily preflight above with a new report filename. Review the live counts; the local snapshot's 217,683 missing readings is a comparison, not a required live count. Then run the all-table import with deferred metadata and retain its host logs/reports. After it completes, verify committed audit totals and perform a separate authenticated availability recalculation. Do not overlap it with another writer or availability job.

## Local committed rehearsal

The actual local import completed on 15 October 2026: 217,683 readings committed, existing values preserved, and all 5,985,104 prepared readings subsequently verified present. A normal authenticated 60-month availability API refresh completed in 429.2 seconds without error. For 26 January 2026 the mapped ten-minute air-temperature availability rose from 75/144 (52.08%) to 140/144 (97.22%). Mokala daily availability for 1 January–15 October 2026 is 87.50% locally; the corresponding public live chart still has the 7–9 September gap.

The public Mokala mappings currently use Table10m, TableDay and TableHour. Native five_min, daily, hourly and solar-charger observations are filled and verified in their raw tables but do not automatically create or change public mappings.
