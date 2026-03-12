-- Daily revenue at end of day (23:00 Europe/Rome)
-- Run once in Supabase SQL Editor after script 06.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Ensure the function groups orders by local business day.
CREATE OR REPLACE FUNCTION rollup_and_purge_orders(keep_days INTEGER DEFAULT 7)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_revenue (day, total, orders_count, updated_at)
  SELECT
    (created_at AT TIME ZONE 'Europe/Rome')::date AS day,
    COALESCE(SUM(total), 0) AS total,
    COUNT(*) AS orders_count,
    NOW()
  FROM orders
  WHERE status <> 'cancelled'
  GROUP BY 1
  ON CONFLICT (day)
  DO UPDATE SET
    total = EXCLUDED.total,
    orders_count = EXCLUDED.orders_count,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM orders
  WHERE created_at < (NOW() - (keep_days || ' days')::interval);
END;
$$ LANGUAGE plpgsql;

-- Wrapper: execute rollup only during the 23:00 hour in Italy timezone.
CREATE OR REPLACE FUNCTION run_rollup_if_end_of_day_rome()
RETURNS VOID AS $$
BEGIN
  IF EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Europe/Rome')) = 23 THEN
    PERFORM public.rollup_and_purge_orders(7);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Replace existing job if present.
DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'daily-revenue-rollup-23';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'daily-revenue-rollup-rome-hourly-check';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

-- Run hourly (UTC), but perform rollup only when local Rome hour is 23.
SELECT cron.schedule(
  'daily-revenue-rollup-rome-hourly-check',
  '5 * * * *',
  $$SELECT public.run_rollup_if_end_of_day_rome();$$
);
