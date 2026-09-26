-- 20260926000006_add_model_json_to_interview_analyses.sql
-- Миграция: добавление колонки model_json для хранения raw ответа модели

ALTER TABLE interview_analyses
  ADD COLUMN IF NOT EXISTS model_json JSONB;

COMMENT ON COLUMN interview_analyses.model_json IS 'Raw response from LLM model before normalization';