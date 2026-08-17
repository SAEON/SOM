-- Production scale notes for public.field_values.
--
-- For 250M+ rows, the biggest wins are:
-- 1. Keep only necessary btree indexes on the hot ingest table.
-- 2. Use BRIN for broad timestamp pruning/cleanup.
-- 3. Partition by timestamp before the table reaches billions of rows.
-- 4. Serve interactive reads from rollups/materialized tables, not raw rows.
--
-- Run these manually in production after reviewing active constraints.
-- Do not run inside the automatic restore path without planning downtime.

-- Current required unique lookup for ingest and field pagination:
--   UNIQUE (field_id, "timestamp")
--
-- Existing duplicate indexes seen in the restored dump:
--   field_values_field_id_idx and idx_field_values_field_id overlap.
--   field_values_field_id_timestamp_key and uq_field_values_field_ts overlap.
--   field_values_id_idx overlaps field_values_pkey.
--
-- Drop only after confirming names on production:
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_field_values_field_id;
-- DROP INDEX CONCURRENTLY IF EXISTS public.uq_field_values_field_ts;
-- DROP INDEX CONCURRENTLY IF EXISTS public.field_values_id_idx;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_field_values_timestamp_brin
  ON public.field_values USING brin ("timestamp")
  WITH (pages_per_range = 128);

-- Future target shape for partitioning. PostgreSQL cannot directly convert the
-- existing populated table into a partitioned table in-place. Create a new table,
-- backfill in monthly chunks, then swap during a maintenance window.
--
-- CREATE TABLE public.field_values_partitioned (
--   id uuid NOT NULL DEFAULT uuid_generate_v4(),
--   field_id uuid NOT NULL,
--   "timestamp" timestamptz NOT NULL,
--   value text,
--   status varchar,
--   PRIMARY KEY (field_id, "timestamp")
-- ) PARTITION BY RANGE ("timestamp");
--
-- Example monthly partition:
-- CREATE TABLE public.field_values_2026_08
--   PARTITION OF public.field_values_partitioned
--   FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
--
-- Per-partition indexes stay small and vacuum/analyze becomes cheaper.
