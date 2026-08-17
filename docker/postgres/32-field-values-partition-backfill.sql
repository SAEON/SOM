-- Stage 2: online backfill into public.field_values_partitioned.
--
-- This copies one month at a time and records progress in
-- public.field_values_partition_migration.
--
-- IMPORTANT: call this with autocommit on, not inside BEGIN/COMMIT:
--   CALL public.backfill_field_values_partitioned('2010-01-01', '2026-09-01', 0.2);
--
-- You can safely stop and rerun it. ON CONFLICT prevents duplicate rows.

CREATE OR REPLACE PROCEDURE public.backfill_field_values_partitioned(
  p_from timestamptz DEFAULT '2010-01-01',
  p_to timestamptz DEFAULT (date_trunc('month', now()) + interval '1 month'),
  p_sleep_seconds numeric DEFAULT 0
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_month_start timestamptz := date_trunc('month', p_from);
  v_month_end timestamptz;
  copied bigint;
BEGIN
  WHILE v_month_start < p_to LOOP
    v_month_end := v_month_start + interval '1 month';

    INSERT INTO public.field_values_partition_migration (month_start, month_end, started_at, error)
    VALUES (v_month_start, v_month_end, now(), NULL)
    ON CONFLICT (month_start) DO UPDATE
      SET started_at = EXCLUDED.started_at,
          finished_at = NULL,
          error = NULL;

    INSERT INTO public.field_values_partitioned (id, field_id, "timestamp", value, status)
    SELECT id, field_id, "timestamp", value, status
    FROM public.field_values
    WHERE "timestamp" >= v_month_start
      AND "timestamp" < v_month_end
    ON CONFLICT (field_id, "timestamp") DO UPDATE
      SET value = EXCLUDED.value,
          status = EXCLUDED.status
      WHERE public.field_values_partitioned.value IS DISTINCT FROM EXCLUDED.value
         OR public.field_values_partitioned.status IS DISTINCT FROM EXCLUDED.status;

    GET DIAGNOSTICS copied = ROW_COUNT;

    UPDATE public.field_values_partition_migration
    SET rows_copied = copied,
        finished_at = now(),
        error = NULL
    WHERE field_values_partition_migration.month_start = v_month_start;

    COMMIT;

    IF p_sleep_seconds > 0 THEN
      PERFORM pg_sleep(p_sleep_seconds);
    END IF;

    v_month_start := v_month_end;
  END LOOP;
END $$;
