-- 20250813000000_add_interview_analyses.sql
-- Миграция: сохранение результатов LLM-анализа интервью и связь с целями

CREATE TABLE IF NOT EXISTS interview_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  interview_session_id UUID NOT NULL,
  source_file TEXT,
  raw_answers JSONB DEFAULT '{}'::jsonb,
  ideas JSONB DEFAULT '[]'::jsonb,
  model_used TEXT,
  answer_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE interview_analyses IS 'Результаты LLM-анализа интервью (идеи, паттерны)';
COMMENT ON COLUMN interview_analyses.interview_session_id IS 'Ссылка на сессию интервью';
COMMENT ON COLUMN interview_analyses.source_file IS 'Для статических файлов: путь к файлу';

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS source_analysis_id UUID;

COMMENT ON COLUMN goals.source_analysis_id IS 'Ссылка на interview_analyses, откуда цель была выбрана';

CREATE INDEX IF NOT EXISTS idx_interview_analyses_client_uuid ON interview_analyses(client_uuid);
CREATE INDEX IF NOT EXISTS idx_interview_analyses_session_id ON interview_analyses(interview_session_id);
CREATE INDEX IF NOT EXISTS idx_goals_source_analysis_id ON goals(source_analysis_id);
