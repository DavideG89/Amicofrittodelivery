-- Add order type scope to discount codes
-- Run this in Supabase SQL Editor

ALTER TABLE discount_codes
ADD COLUMN IF NOT EXISTS order_type_scope TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'discount_codes_order_type_scope_check'
      AND conrelid = 'discount_codes'::regclass
  ) THEN
    ALTER TABLE discount_codes
    ADD CONSTRAINT discount_codes_order_type_scope_check
    CHECK (order_type_scope IN ('all', 'delivery', 'takeaway'));
  END IF;
END $$;

UPDATE discount_codes
SET order_type_scope = 'all'
WHERE order_type_scope IS NULL;

ALTER TABLE discount_codes
ALTER COLUMN order_type_scope SET DEFAULT 'all';

ALTER TABLE discount_codes
ALTER COLUMN order_type_scope SET NOT NULL;

