CREATE INDEX IF NOT EXISTS idx_summary_table_locations
  ON public.summary_table (display_server_name)
  WHERE display_server_name IS NOT NULL
    AND btrim(display_server_name) <> ''
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_summary_table_field_lookup
  ON public.summary_table (field_id, display_server_name, display_table_name, display_field_name);

CREATE INDEX IF NOT EXISTS idx_summary_table_lower_table_field
  ON public.summary_table (lower(display_table_name), lower(display_field_name), field_id);

CREATE INDEX IF NOT EXISTS idx_field_values_timestamp_brin
  ON public.field_values USING brin ("timestamp")
  WITH (pages_per_range = 128);

CREATE INDEX IF NOT EXISTS idx_site_mapping_display_name_clean
  ON public.site_mapping ((COALESCE(NULLIF(btrim(display_name), ''), site_name)));

CREATE INDEX IF NOT EXISTS idx_site_mapping_display_locations
  ON public.site_mapping (display_name)
  WHERE display_name IS NOT NULL
    AND btrim(display_name) <> ''
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_summary_data_date_ranges_lookup
  ON public.summary_data_date_ranges (server_name, table_name);

CREATE INDEX IF NOT EXISTS idx_daily_data_availability_table_date
  ON public.daily_data_availability (
    display_server_name,
    display_table_name,
    date,
    display_field_name
  );

CREATE INDEX IF NOT EXISTS idx_daily_data_availability_clean_table_date
  ON public.daily_data_availability (
    display_server_name,
    display_table_name,
    date,
    display_field_name
  )
  WHERE display_server_name IS NOT NULL
    AND btrim(display_server_name) <> ''
    AND display_table_name IS NOT NULL
    AND btrim(display_table_name) <> ''
    AND display_field_name IS NOT NULL
    AND btrim(display_field_name) <> ''
    AND availability_percentage BETWEEN 0 AND 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.daily_data_availability'::regclass
      AND conname = 'daily_data_availability_required_fields_chk'
  ) THEN
    ALTER TABLE public.daily_data_availability
      ADD CONSTRAINT daily_data_availability_required_fields_chk
      CHECK (
        display_server_name IS NOT NULL
        AND btrim(display_server_name) <> ''
        AND display_table_name IS NOT NULL
        AND btrim(display_table_name) <> ''
        AND display_field_name IS NOT NULL
        AND btrim(display_field_name) <> ''
        AND date IS NOT NULL
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.daily_data_availability'::regclass
      AND conname = 'daily_data_availability_percentage_chk'
  ) THEN
    ALTER TABLE public.daily_data_availability
      ADD CONSTRAINT daily_data_availability_percentage_chk
      CHECK (
        availability_percentage IS NOT NULL
        AND availability_percentage >= 0
        AND availability_percentage <= 100
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.field_values'::regclass
      AND conname = 'field_values_clean_value_chk'
  ) THEN
    ALTER TABLE public.field_values
      ADD CONSTRAINT field_values_clean_value_chk
      CHECK (
        value IS NULL
        OR (
          btrim(value) <> ''
          AND upper(btrim(value)) NOT IN ('NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY')
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pre_aggregated_table_values_table_timestamp
  ON public.pre_aggregated_table_values (table_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_pre_aggregated_field_values_table_timestamp
  ON public.pre_aggregated_field_values (
    display_server_name,
    display_table_name,
    "timestamp" DESC
  );

CREATE INDEX IF NOT EXISTS idx_unified_mapping_current_server_name
  ON public.unified_mapping_table (current_server_name)
  WHERE current_server_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unified_mapping_current_field_name
  ON public.unified_mapping_table (current_field_name)
  WHERE current_field_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unified_mapping_summary_keys
  ON public.unified_mapping_table (
    display_server_name,
    display_table_name,
    display_field_name,
    aggregation_type
  )
  WHERE include_in_summary = TRUE;

CREATE TABLE IF NOT EXISTS public.csv_export_manifest (
  id bigserial PRIMARY KEY,
  display_server_name text NOT NULL,
  display_table_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  file_path text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  row_count bigint NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ready',
  error_message text,
  UNIQUE (display_server_name, display_table_name, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_csv_export_manifest_lookup
  ON public.csv_export_manifest (
    display_server_name,
    display_table_name,
    period_start,
    period_end,
    status
  );

ANALYZE public.summary_table;
ANALYZE public.site_mapping;
ANALYZE public.field_values;
ANALYZE public.daily_data_availability;
ANALYZE public.pre_aggregated_field_values;
ANALYZE public.pre_aggregated_table_values;
ANALYZE public.summary_data_date_ranges;
ANALYZE public.unified_mapping_table;
ANALYZE public.csv_export_manifest;
