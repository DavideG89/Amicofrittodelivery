-- Fix Security Advisor warning:
-- Function Search Path Mutable on public.notify_admin_on_new_order

DO $$
BEGIN
  IF to_regprocedure('public.notify_admin_on_new_order()') IS NULL THEN
    RAISE NOTICE 'Skipping fix: public.notify_admin_on_new_order() not found';
    RETURN;
  END IF;

  EXECUTE 'ALTER FUNCTION public.notify_admin_on_new_order() SET search_path = pg_catalog';
END $$;
