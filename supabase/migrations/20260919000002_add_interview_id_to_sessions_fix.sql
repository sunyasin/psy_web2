-- 20260919000002_add_interview_id_to_sessions_fix.sql
-- Fix: ensure interview_id column exists in interview_sessions

ALTER TABLE IF EXISTS public.interview_sessions
  ADD COLUMN IF NOT EXISTS interview_id UUID;

-- Fill NULL values with first available interview
UPDATE interview_sessions
SET interview_id = (SELECT id FROM interview LIMIT 1)
WHERE interview_id IS NULL;
