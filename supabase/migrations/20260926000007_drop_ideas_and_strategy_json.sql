-- 20260926000007_drop_ideas_and_strategy_json.sql
-- Миграция: удаление устаревших колонок ideas и strategy_json из interview_analyses

ALTER TABLE interview_analyses
  DROP COLUMN IF EXISTS ideas,
  DROP COLUMN IF EXISTS strategy_json;