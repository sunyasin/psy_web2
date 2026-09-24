-- 20260924000000_add_interview_table.sql
-- Миграция: добавляет таблицу interview, на которую ссылаются interview_config и interview_sessions.

CREATE TABLE IF NOT EXISTS interview (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_code ON interview(code) WHERE active = true;

-- Seed the default interview that interview_config / interview_sessions reference.
INSERT INTO interview (id, code, name, active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'default',
  'Икигай-коуч: адаптивное интервью',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM interview WHERE code = 'default'
);