-- Add label column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS label TEXT CHECK (label IN ('sconto', 'novita', NULL));
