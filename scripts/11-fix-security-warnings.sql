-- Fix Supabase Security Advisor warnings:
-- 1) Extension in Public: public.pg_net
-- 2) RLS Policy Always True: public.customer_push_tokens
-- 3) RLS Policy Always True: public.upsell_settings

-- 1) Move pg_net extension out of public schema when possible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    EXECUTE 'CREATE SCHEMA IF NOT EXISTS extensions';
    BEGIN
      EXECUTE 'ALTER EXTENSION pg_net SET SCHEMA extensions';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not move extension pg_net to schema extensions: %', SQLERRM;
    END;
  END IF;
END $$;

-- 2) Lock down customer_push_tokens:
-- The app uses service-role server routes for this table; no anon/authenticated access is required.
DO $$
DECLARE
  policy_name TEXT;
BEGIN
  IF to_regclass('public.customer_push_tokens') IS NULL THEN
    RAISE NOTICE 'Skipping customer_push_tokens fixes (table not found)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.customer_push_tokens ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON TABLE public.customer_push_tokens FROM anon, authenticated';

  FOR policy_name IN
    SELECT p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'customer_push_tokens'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_push_tokens', policy_name);
  END LOOP;
END $$;

-- 3) Replace permissive policies on upsell_settings with scoped policies.
DO $$
DECLARE
  policy_name TEXT;
BEGIN
  IF to_regclass('public.upsell_settings') IS NULL THEN
    RAISE NOTICE 'Skipping upsell_settings fixes (table not found)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.upsell_settings ENABLE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT ON TABLE public.upsell_settings TO anon, authenticated';
  EXECUTE 'GRANT INSERT, UPDATE ON TABLE public.upsell_settings TO authenticated';

  FOR policy_name IN
    SELECT p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'upsell_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.upsell_settings', policy_name);
  END LOOP;

  EXECUTE 'CREATE POLICY upsell_settings_public_read_default
    ON public.upsell_settings
    FOR SELECT
    TO anon, authenticated
    USING (id = ''default'')';

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY upsell_settings_admin_insert
      ON public.upsell_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (
        id = ''default''
        AND EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
      )';

    EXECUTE 'CREATE POLICY upsell_settings_admin_update
      ON public.upsell_settings
      FOR UPDATE
      TO authenticated
      USING (
        id = ''default''
        AND EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
      )
      WITH CHECK (
        id = ''default''
        AND EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
      )';
  ELSE
    EXECUTE 'CREATE POLICY upsell_settings_admin_insert
      ON public.upsell_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (id = ''default'' AND auth.role() = ''authenticated'')';

    EXECUTE 'CREATE POLICY upsell_settings_admin_update
      ON public.upsell_settings
      FOR UPDATE
      TO authenticated
      USING (id = ''default'' AND auth.role() = ''authenticated'')
      WITH CHECK (id = ''default'' AND auth.role() = ''authenticated'')';
  END IF;
END $$;
