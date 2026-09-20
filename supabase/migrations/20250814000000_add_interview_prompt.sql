-- 20250814000000_add_interview_prompt.sql
-- Миграция: добавление системного промпта для анализа интервью

ALTER TABLE interview
  ADD COLUMN IF NOT EXISTS prompt TEXT;

COMMENT ON COLUMN interview.prompt IS 'Системный промпт для LLM-анализа ответов интервью';
