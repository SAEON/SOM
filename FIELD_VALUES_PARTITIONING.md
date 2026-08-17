# Field Values Partitioning Runbook

Status on the local restored Docker DB after the partition swap:

- `public.field_values`: partitioned table
- Partitions: 206
- Partition total size: about 46 GB
- Materialized views: `pre_aggregated_field_values` and `pre_aggregated_table_values` are populated
- Legacy unpartitioned table: removed after verification to reclaim disk space

## Historical Scripts

These were used for the local partition migration and are retained as a runbook. Run from `/Users/private/SAEON/SAEON_GitHub/SOM/Loggernet` if a fresh environment ever needs to repeat the same migration.

1. Prepare partitioned table:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d loggernet < docker/postgres/31-field-values-partition-prepare.sql
```

2. Install backfill procedure:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d loggernet < docker/postgres/32-field-values-partition-backfill.sql
```

3. Start/resume backfill:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d loggernet -c "CALL public.backfill_field_values_partitioned('2010-01-01', '2026-09-01', 0.2);"
```

The procedure copies month by month and records progress in `public.field_values_partition_migration`.

4. Check progress:

```bash
docker compose exec -T db psql -U postgres -d loggernet -c "select month_start, month_end, rows_copied, started_at, finished_at, error from public.field_values_partition_migration order by month_start;"
```

5. Verify before swap:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d loggernet < docker/postgres/33-field-values-partition-verify.sql
```

6. Cut over during a maintenance window:

```bash
docker compose stop api
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d loggernet < docker/postgres/34-field-values-partition-swap.sql
docker compose up -d api
```

## Notes

- The full partition backfill duplicates the raw data temporarily, so keep at least 70-90 GB free if repeating the migration from an unpartitioned database.
- Stop the API/background writers only for the final swap, not for the online backfill.
- The final swap recreates the materialized views so they bind to the new partitioned `public.field_values`.
- Keep `field_values_legacy_unpartitioned` only until the partitioned table has been verified in production, then remove it to reclaim disk space.
