-- Phase 1/2: create the explicit admin allowlist used by API authorization and RLS.
-- This migration is safe to apply before inserting the first administrator.
-- It intentionally does not guess which auth.users row should become an admin.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_user_id_key
  ON public.admin_users(user_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMIT;

-- Required bootstrap before running migration 21:
-- 1. Create the administrator in Supabase Auth.
-- 2. Copy that user's UUID from auth.users.
-- 3. Run the following statement in the SQL Editor with the real UUID:
--
-- INSERT INTO public.admin_users (user_id)
-- VALUES ('00000000-0000-0000-0000-000000000000')
-- ON CONFLICT (user_id) DO NOTHING;
