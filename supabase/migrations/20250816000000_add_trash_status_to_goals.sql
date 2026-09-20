-- 20250816000000_add_trash_status_to_goals.sql
-- Миграция: добавление статуса "trash" для мягкого удаления целей

ALTER TABLE goals
  DROP CONSTRAINT IF EXISTS goals_status_check;

ALTER TABLE goals
  ADD CONSTRAINT goals_status_check CHECK (status IN ('active', 'paused', 'achieved', 'abandoned', 'trash'));

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
