-- Maintenance: create future monthly partitions.
--
-- Run monthly, or before enabling ingestion for a new month.

CREATE OR REPLACE PROCEDURE public.ensure_field_values_monthly_partitions(
  p_from date DEFAULT date_trunc('month', now())::date,
  p_months_ahead int DEFAULT 12
)
LANGUAGE plpgsql
AS $$
DECLARE
  partition_start date := date_trunc('month', p_from)::date;
  partition_stop date := (partition_start + make_interval(months => p_months_ahead))::date;
  next_month date;
  partition_name text;
BEGIN
  WHILE partition_start < partition_stop LOOP
    next_month := (partition_start + interval '1 month')::date;
    partition_name := format('field_values_%s', to_char(partition_start, 'YYYY_MM'));

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.field_values FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_start::timestamptz,
      next_month::timestamptz
    );

    partition_start := next_month;
  END LOOP;
END $$;
