-- 20260919000003_disable_rls_for_dev.sql
-- Temporary: disable RLS for development (no auth in this project)
-- Remove this and implement proper auth before production

ALTER TABLE IF EXISTS public.interview_analyses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions DISABLE ROW LEVEL SECURITY;
