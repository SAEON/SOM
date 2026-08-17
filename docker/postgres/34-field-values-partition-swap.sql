-- Stage 4: controlled cutover.
--
-- Preconditions:
-- 1. Stop API/background writers.
-- 2. Run the backfill procedure through at least the next month.
-- 3. Run 33-field-values-partition-verify.sql and resolve differences.
-- 4. Take a fresh backup/snapshot.
--
-- This script performs a final delta copy, swaps table names, and recreates the
-- materialized views so they bind to the new partitioned public.field_values.

BEGIN;

LOCK TABLE public.field_values IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.field_values_partitioned IN ACCESS EXCLUSIVE MODE;

INSERT INTO public.field_values_partitioned (id, field_id, "timestamp", value, status)
SELECT id, field_id, "timestamp", value, status
FROM public.field_values
WHERE "timestamp" >= (
  SELECT max(month_start)
  FROM public.field_values_partition_migration
  WHERE finished_at IS NOT NULL
)
ON CONFLICT (field_id, "timestamp") DO UPDATE
  SET value = EXCLUDED.value,
      status = EXCLUDED.status
  WHERE public.field_values_partitioned.value IS DISTINCT FROM EXCLUDED.value
     OR public.field_values_partitioned.status IS DISTINCT FROM EXCLUDED.status;

DROP MATERIALIZED VIEW IF EXISTS public.pre_aggregated_field_values;
DROP MATERIALIZED VIEW IF EXISTS public.pre_aggregated_table_values;

ALTER TABLE public.field_values RENAME TO field_values_legacy_unpartitioned;
ALTER TABLE public.field_values_partitioned RENAME TO field_values;

COMMIT;

CREATE MATERIALIZED VIEW public.pre_aggregated_field_values AS
WITH recent_timestamps AS (
  SELECT
    st.display_server_name,
    st.display_table_name,
    max(fv."timestamp") AS max_timestamp
  FROM public.field_values fv
  JOIN public.summary_table st ON fv.field_id = st.field_id
  GROUP BY st.display_server_name, st.display_table_name
),
filtered_data AS (
  SELECT
    fv."timestamp",
    st.display_server_name,
    st.display_table_name,
    json_agg(jsonb_build_object(
      'display_field_name', st.display_field_name,
      'field_value',
        CASE
          WHEN safe_cast_numeric(fv.value) IS NOT NULL
            THEN (safe_cast_numeric(fv.value) * st.multiplier)::text
          ELSE fv.value
        END,
      'units', st.units
    )) AS field_values,
    max(st.latitude) AS latitude,
    max(st.longitude) AS longitude
  FROM public.field_values fv
  JOIN public.summary_table st ON fv.field_id = st.field_id
  JOIN recent_timestamps rt
    ON rt.display_server_name = st.display_server_name
   AND rt.display_table_name = st.display_table_name
   AND fv."timestamp" >= rt.max_timestamp - interval '1 month'
  GROUP BY fv."timestamp", st.display_server_name, st.display_table_name
)
SELECT
  "timestamp",
  display_server_name,
  display_table_name,
  field_values,
  latitude,
  longitude
FROM filtered_data
ORDER BY "timestamp" DESC
WITH NO DATA;

CREATE UNIQUE INDEX idx_pre_aggregated_field_values
  ON public.pre_aggregated_field_values ("timestamp", display_server_name, display_table_name);

CREATE MATERIALIZED VIEW public.pre_aggregated_table_values AS
WITH recent_timestamps AS (
  SELECT
    sf.table_id,
    max(fv."timestamp") AS max_timestamp
  FROM public.field_values fv
  JOIN public.server_table_fields sf ON fv.field_id = sf.field_id
  GROUP BY sf.table_id
),
filtered_data AS (
  SELECT
    fv."timestamp",
    sf.table_id,
    json_agg(jsonb_build_object(
      'field_name', sf.field_name,
      'value', fv.value,
      'status', COALESCE(sf.status, ''::character varying),
      'units', COALESCE(sf.units, ''::character varying)
    )) AS fields
  FROM public.field_values fv
  JOIN public.server_table_fields sf ON fv.field_id = sf.field_id
  JOIN recent_timestamps rt ON rt.table_id = sf.table_id
  WHERE fv."timestamp" >= rt.max_timestamp - interval '1 month'
  GROUP BY fv."timestamp", sf.table_id
)
SELECT
  "timestamp",
  table_id,
  fields
FROM filtered_data
ORDER BY "timestamp" DESC
WITH NO DATA;

CREATE UNIQUE INDEX idx_pre_aggregated_table_values
  ON public.pre_aggregated_table_values ("timestamp", table_id);

REFRESH MATERIALIZED VIEW public.pre_aggregated_field_values;
REFRESH MATERIALIZED VIEW public.pre_aggregated_table_values;

ANALYZE public.field_values;
