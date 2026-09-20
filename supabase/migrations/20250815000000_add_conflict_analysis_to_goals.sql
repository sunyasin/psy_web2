-- 20250815000000_add_conflict_analysis_to_goals.sql
-- Миграция: добавление колонки для хранения анализа саботажа/противоречий

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS conflict_analysis TEXT;

COMMENT ON COLUMN goals.conflict_analysis IS 'Результат анализа саботажа и психологической готовности (tension_resolution_agent + self_sabotage_agent)';
