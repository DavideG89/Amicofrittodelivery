DO $$
BEGIN
  IF to_regclass('public.upsell_settings') IS NULL THEN
    RAISE NOTICE 'Skipping migration: table public.upsell_settings does not exist';
    RETURN;
  END IF;

  ALTER TABLE public.upsell_settings
    ADD COLUMN IF NOT EXISTS product_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
END $$;
