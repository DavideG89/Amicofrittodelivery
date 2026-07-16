-- Phase 2/2: make repository-owned RLS policies canonical and fail-closed.
-- Prerequisite: migration 20 and at least one valid public.admin_users row.
-- Export current policies and grants before applying this migration in production.

BEGIN;

DO $$
DECLARE
  required_table TEXT;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'admin_users',
    'categories',
    'products',
    'store_info',
    'discount_codes',
    'orders',
    'daily_revenue',
    'admin_push_tokens',
    'customer_push_tokens',
    'order_additions',
    'order_addition_category_rules',
    'upsell_settings',
    'print_jobs',
    'order_feedback'
  ]
  LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing', required_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_users au
    JOIN auth.users u ON u.id = au.user_id
  ) THEN
    RAISE EXCEPTION 'No valid administrator found; bootstrap admin_users before migration 21';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN auth.users u ON u.id = au.user_id
    WHERE au.user_id IS NULL OR u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'admin_users contains null or unknown auth user IDs';
  END IF;
END $$;

ALTER TABLE public.admin_users
  ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.admin_users'::regclass
      AND conname = 'admin_users_user_id_fkey'
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_payment_method_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('cash', 'card'));
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name TEXT;
  policy_row RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'admin_users',
    'categories',
    'products',
    'store_info',
    'discount_codes',
    'orders',
    'daily_revenue',
    'admin_push_tokens',
    'customer_push_tokens',
    'order_additions',
    'order_addition_category_rules',
    'upsell_settings',
    'print_jobs',
    'order_feedback'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        policy_row.policyname,
        table_name
      );
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL ON TABLE
  public.admin_users,
  public.categories,
  public.products,
  public.store_info,
  public.discount_codes,
  public.orders,
  public.daily_revenue,
  public.admin_push_tokens,
  public.customer_push_tokens,
  public.order_additions,
  public.order_addition_category_rules,
  public.upsell_settings,
  public.print_jobs,
  public.order_feedback
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.categories,
  public.products,
  public.store_info,
  public.order_additions,
  public.order_addition_category_rules,
  public.upsell_settings
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.categories,
  public.products,
  public.store_info,
  public.discount_codes,
  public.order_additions,
  public.order_addition_category_rules,
  public.upsell_settings,
  public.admin_push_tokens
TO authenticated;

GRANT SELECT ON TABLE
  public.orders,
  public.daily_revenue
TO authenticated;

GRANT DELETE ON TABLE public.orders TO authenticated;

CREATE POLICY categories_public_read
ON public.categories
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY categories_admin_manage
ON public.categories
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY products_public_read
ON public.products
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY products_admin_manage
ON public.products
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY store_info_public_read
ON public.store_info
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY store_info_admin_manage
ON public.store_info
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY discount_codes_admin_manage
ON public.discount_codes
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY orders_admin_read
ON public.orders
FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));

CREATE POLICY orders_admin_delete
ON public.orders
FOR DELETE TO authenticated
USING ((SELECT public.is_admin()));

CREATE POLICY daily_revenue_admin_read
ON public.daily_revenue
FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));

CREATE POLICY admin_push_tokens_admin_manage
ON public.admin_push_tokens
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY order_additions_public_read
ON public.order_additions
FOR SELECT TO anon, authenticated
USING (active = true);

CREATE POLICY order_additions_admin_manage
ON public.order_additions
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY addition_rules_public_read
ON public.order_addition_category_rules
FOR SELECT TO anon, authenticated
USING (active = true);

CREATE POLICY addition_rules_admin_manage
ON public.order_addition_category_rules
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY upsell_settings_public_read
ON public.upsell_settings
FOR SELECT TO anon, authenticated
USING (id = 'default');

CREATE POLICY upsell_settings_admin_manage
ON public.upsell_settings
FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK (id = 'default' AND (SELECT public.is_admin()));

DO $$
BEGIN
  IF to_regclass('public.orders_public') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.orders_public FROM anon, authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.rollup_and_purge_orders(integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rollup_and_purge_orders(integer)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rollup_and_purge_orders(integer)
      TO service_role;
    ALTER FUNCTION public.rollup_and_purge_orders(integer)
      SET search_path = pg_catalog, public;
  END IF;

  IF to_regprocedure('public.run_rollup_if_end_of_day_rome()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.run_rollup_if_end_of_day_rome()
      FROM PUBLIC, anon, authenticated;
    ALTER FUNCTION public.run_rollup_if_end_of_day_rome()
      SET search_path = pg_catalog, public;
  END IF;

  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.update_updated_at_column()
      FROM PUBLIC, anon, authenticated;
    ALTER FUNCTION public.update_updated_at_column()
      SET search_path = pg_catalog, public;
  END IF;
END $$;

-- Older deployments may still have the database webhook from the original
-- script 05. The application route is now the single notification owner.
DROP TRIGGER IF EXISTS trg_notify_admin_new_order ON public.orders;
DROP FUNCTION IF EXISTS public.notify_admin_on_new_order();

COMMIT;
