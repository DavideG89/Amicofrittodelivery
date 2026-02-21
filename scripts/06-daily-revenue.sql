-- Daily revenue rollup and cleanup for orders
-- Creates a tiny table for daily totals and a function to refresh and purge old orders.

CREATE TABLE IF NOT EXISTS daily_revenue (
  day DATE PRIMARY KEY,
  total NUMERIC NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_revenue_day ON daily_revenue(day DESC);

-- Refresh daily totals and remove orders older than N days (default 7).
CREATE OR REPLACE FUNCTION rollup_and_purge_orders(keep_days INTEGER DEFAULT 7)
RETURNS VOID AS $$
BEGIN
  -- Rollup all orders into daily totals (overwrite if exists).
  INSERT INTO daily_revenue (day, total, orders_count, updated_at)
  SELECT
    (created_at AT TIME ZONE 'UTC')::date AS day,
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

  -- Purge old orders to control storage
  DELETE FROM orders
  WHERE created_at < (NOW() - (keep_days || ' days')::interval);
END;
$$ LANGUAGE plpgsql;
