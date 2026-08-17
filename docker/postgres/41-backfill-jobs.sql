CREATE TABLE IF NOT EXISTS public.backfill_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id integer,
  created_by_username text,
  server_name text NOT NULL,
  table_name text NOT NULL,
  file_name text,
  mode text NOT NULL CHECK (mode IN ('preflight', 'import')),
  status text NOT NULL CHECK (status IN ('passed', 'failed', 'imported')),
  row_count integer NOT NULL DEFAULT 0,
  value_count integer NOT NULL DEFAULT 0,
  inserted_or_updated_count integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_created_at
  ON public.backfill_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_target
  ON public.backfill_jobs (server_name, table_name, created_at DESC);
