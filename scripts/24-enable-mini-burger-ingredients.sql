-- Enable ingredient customization for the historical Mini Burger category.
-- Prerequisite: migration 23.
-- Impact: updates only the category feature flag; products and ingredients are unchanged.
-- Rollback: disable the flag manually only if Mini Burger customization is no longer desired.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'categories'
      AND column_name = 'ingredient_customization_enabled'
  ) THEN
    RAISE EXCEPTION 'Required column categories.ingredient_customization_enabled is missing; apply migration 23 first';
  END IF;
END $$;

UPDATE public.categories
SET ingredient_customization_enabled = true
WHERE lower(btrim(slug)) IN (
    'mini-burger',
    'mini-burgers'
  )
  OR regexp_replace(lower(btrim(name)), '\s+', ' ', 'g') IN (
    'mini burger',
    'mini burgers'
  );

COMMIT;
