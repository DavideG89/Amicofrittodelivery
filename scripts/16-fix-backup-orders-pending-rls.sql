-- Fix Security Advisor: RLS disabled on public.backup_orders_pending_20260306
-- Safe approach:
-- - keep the backup table in place
-- - deny anon/authenticated direct access
-- - enable RLS so PostgREST no longer exposes unrestricted rows

DO $$
BEGIN
  IF to_regclass('public.backup_orders_pending_20260306') IS NULL THEN
    RAISE NOTICE 'Skipping backup_orders_pending_20260306 security fix (table not found)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.backup_orders_pending_20260306 ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON TABLE public.backup_orders_pending_20260306 FROM anon, authenticated';
END $$;
