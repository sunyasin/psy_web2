-- 20250813000002_add_interview_id_to_sessions.sql
-- Миграция: привязка сессии интервью к конкретной анкете

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS interview_id UUID;

UPDATE interview_sessions
  SET interview_id = (SELECT id FROM interview LIMIT 1)
  WHERE interview_id IS NULL;

ALTER TABLE interview_sessions
  ALTER COLUMN interview_id SET NOT NULL;

ALTER TABLE interview_sessions
  ADD CONSTRAINT interview_sessions_interview_id_fkey
    FOREIGN KEY (interview_id) REFERENCES interview(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_interview_sessions_interview_id ON interview_sessions(interview_id);
