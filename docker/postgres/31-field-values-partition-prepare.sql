-- Stage 1: create the side-by-side partitioned field_values table.
--
-- This is non-destructive. It does not alter public.field_values.
-- Run before backfill:
--   psql -U postgres -d loggernet -f docker/postgres/31-field-values-partition-prepare.sql

CREATE TABLE IF NOT EXISTS public.field_values_partitioned (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  field_id uuid NOT NULL REFERENCES public.server_table_fields(field_id) ON DELETE CASCADE,
  "timestamp" timestamptz NOT NULL,
  value text,
  status character varying,
  UNIQUE (field_id, "timestamp")
) PARTITION BY RANGE ("timestamp");

CREATE TABLE IF NOT EXISTS public.field_values_default
  PARTITION OF public.field_values_partitioned DEFAULT;

CREATE INDEX IF NOT EXISTS idx_field_values_partitioned_timestamp_brin
  ON public.field_values_partitioned USING brin ("timestamp")
  WITH (pages_per_range = 128);

CREATE INDEX IF NOT EXISTS idx_field_values_partitioned_id
  ON public.field_values_partitioned (id);

CREATE TABLE IF NOT EXISTS public.field_values_partition_migration (
  month_start timestamptz PRIMARY KEY,
  month_end timestamptz NOT NULL,
  rows_copied bigint NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

DO $$
DECLARE
  partition_start date := DATE '2010-01-01';
  partition_stop date := (date_trunc('month', now()) + interval '6 months')::date;
  next_month date;
  partition_name text;
BEGIN
  WHILE partition_start < partition_stop LOOP
    next_month := (partition_start + interval '1 month')::date;
    partition_name := format('field_values_%s', to_char(partition_start, 'YYYY_MM'));

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.field_values_partitioned FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_start::timestamptz,
      next_month::timestamptz
    );

    partition_start := next_month;
  END LOOP;
END $$;

ANALYZE public.field_values_partitioned;
