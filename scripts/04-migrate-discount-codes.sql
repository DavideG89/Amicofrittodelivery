-- Migration script to update discount_codes table structure
-- Run this in Supabase SQL Editor

-- Step 1: Add new columns if they don't exist
ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed'));

ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10, 2);

ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS active BOOLEAN;

ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP WITH TIME ZONE;

-- Step 2: Migrate data from old columns to new columns
UPDATE discount_codes 
SET discount_value = discount_percent 
WHERE discount_value IS NULL AND discount_percent IS NOT NULL;

UPDATE discount_codes 
SET active = is_active 
WHERE active IS NULL AND is_active IS NOT NULL;

-- Step 3: Drop old columns
ALTER TABLE discount_codes DROP COLUMN IF EXISTS discount_percent;
ALTER TABLE discount_codes DROP COLUMN IF EXISTS is_active;

-- Step 4: Make new columns NOT NULL (after data migration)
ALTER TABLE discount_codes 
ALTER COLUMN discount_value SET NOT NULL;

ALTER TABLE discount_codes 
ALTER COLUMN discount_type SET NOT NULL;
