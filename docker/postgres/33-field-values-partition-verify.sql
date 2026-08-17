-- Stage 3: verification queries during/after backfill.
--
-- These avoid full-table counts where possible. For the final cutover, run the
-- month comparison and investigate any month where partitioned_rows differs from
-- original_rows.

SELECT
  month_start,
  month_end,
  rows_copied,
  started_at,
  finished_at,
  error
FROM public.field_values_partition_migration
ORDER BY month_start;

WITH original AS (
  SELECT date_trunc('month', "timestamp") AS month_start, count(*)::bigint AS original_rows
  FROM public.field_values
  GROUP BY 1
),
partitioned AS (
  SELECT date_trunc('month', "timestamp") AS month_start, count(*)::bigint AS partitioned_rows
  FROM public.field_values_partitioned
  GROUP BY 1
)
SELECT
  COALESCE(o.month_start, p.month_start) AS month_start,
  COALESCE(o.original_rows, 0) AS original_rows,
  COALESCE(p.partitioned_rows, 0) AS partitioned_rows,
  COALESCE(p.partitioned_rows, 0) - COALESCE(o.original_rows, 0) AS difference
FROM original o
FULL OUTER JOIN partitioned p USING (month_start)
WHERE COALESCE(o.original_rows, 0) <> COALESCE(p.partitioned_rows, 0)
ORDER BY month_start;

SELECT
  (SELECT count(*) FROM pg_partition_tree('public.field_values_partitioned') WHERE level > 0) AS partitions,
  (SELECT pg_size_pretty(sum(pg_total_relation_size(relid))) FROM pg_partition_tree('public.field_values_partitioned')) AS partitioned_size,
  pg_size_pretty(pg_total_relation_size('public.field_values')) AS original_size
;
