-- 20260927000001_add_welcome_interview.sql
-- Миграция: добавляет входное интервью в таблицу interview

INSERT INTO interview (id, code, name, prompt, visible)
SELECT
  '00000000-0000-0000-0000-000000000003',
  'welcome',
  'Входное интервью',
  '',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM interview WHERE code = 'welcome'
);