-- Category-level sauce rules for order additions modal
-- Default behavior in app (when no rule row exists):
--   sauce_mode = 'free_single' (1 free sauce max)

CREATE TABLE IF NOT EXISTS order_addition_category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug TEXT NOT NULL UNIQUE,
  sauce_mode TEXT NOT NULL DEFAULT 'free_single' CHECK (sauce_mode IN ('paid_multi', 'free_single', 'none')),
  max_sauces INTEGER NOT NULL DEFAULT 1,
  sauce_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_addition_category_rules_active
  ON order_addition_category_rules(active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_order_addition_category_rules_updated_at'
  ) THEN
    CREATE TRIGGER update_order_addition_category_rules_updated_at
    BEFORE UPDATE ON order_addition_category_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

INSERT INTO order_addition_category_rules (category_slug, sauce_mode, max_sauces, sauce_price, active)
VALUES
  ('mini', 'paid_multi', 3, 0.50, true),
  ('hamburger', 'paid_multi', 3, 0.50, true),
  ('hamburgers', 'paid_multi', 3, 0.50, true)
ON CONFLICT (category_slug) DO UPDATE SET
  sauce_mode = EXCLUDED.sauce_mode,
  max_sauces = EXCLUDED.max_sauces,
  sauce_price = EXCLUDED.sauce_price,
  active = EXCLUDED.active,
  updated_at = NOW();
