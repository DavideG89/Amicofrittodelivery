-- Fix Supabase Security Advisor findings:
-- 1) public.orders_public defined as security definer view
-- 2) RLS disabled on public.order_additions
-- 3) RLS disabled on public.order_addition_category_rules

-- Make orders_public use invoker permissions (removes "Security Definer View").
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'orders_public'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.orders_public SET (security_invoker = true)';
    EXECUTE 'GRANT SELECT ON TABLE public.orders_public TO anon, authenticated';
  END IF;
END $$;

-- Enable RLS and define policies for order_additions.
DO $$
BEGIN
  IF to_regclass('public.order_additions') IS NULL THEN
    RAISE NOTICE 'Skipping RLS setup for public.order_additions (table not found)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.order_additions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT ON TABLE public.order_additions TO anon, authenticated';
  EXECUTE 'GRANT INSERT, UPDATE, DELETE ON TABLE public.order_additions TO authenticated';

  EXECUTE 'DROP POLICY IF EXISTS order_additions_public_read_active ON public.order_additions';
  EXECUTE 'DROP POLICY IF EXISTS order_additions_admin_manage ON public.order_additions';

  EXECUTE 'CREATE POLICY order_additions_public_read_active
    ON public.order_additions
    FOR SELECT
    TO anon, authenticated
    USING (active = true)';

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY order_additions_admin_manage
      ON public.order_additions
      FOR ALL
      TO authenticated
      USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()))';
  ELSE
    EXECUTE 'CREATE POLICY order_additions_admin_manage
      ON public.order_additions
      FOR ALL
      TO authenticated
      USING (auth.role() = ''authenticated'')
      WITH CHECK (auth.role() = ''authenticated'')';
  END IF;
END $$;

-- Enable RLS and define policies for order_addition_category_rules.
DO $$
BEGIN
  IF to_regclass('public.order_addition_category_rules') IS NULL THEN
    RAISE NOTICE 'Skipping RLS setup for public.order_addition_category_rules (table not found)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.order_addition_category_rules ENABLE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT ON TABLE public.order_addition_category_rules TO anon, authenticated';
  EXECUTE 'GRANT INSERT, UPDATE, DELETE ON TABLE public.order_addition_category_rules TO authenticated';

  EXECUTE 'DROP POLICY IF EXISTS order_addition_category_rules_public_read_active ON public.order_addition_category_rules';
  EXECUTE 'DROP POLICY IF EXISTS order_addition_category_rules_admin_manage ON public.order_addition_category_rules';

  EXECUTE 'CREATE POLICY order_addition_category_rules_public_read_active
    ON public.order_addition_category_rules
    FOR SELECT
    TO anon, authenticated
    USING (active = true)';

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY order_addition_category_rules_admin_manage
      ON public.order_addition_category_rules
      FOR ALL
      TO authenticated
      USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()))';
  ELSE
    EXECUTE 'CREATE POLICY order_addition_category_rules_admin_manage
      ON public.order_addition_category_rules
      FOR ALL
      TO authenticated
      USING (auth.role() = ''authenticated'')
      WITH CHECK (auth.role() = ''authenticated'')';
  END IF;
END $$;
