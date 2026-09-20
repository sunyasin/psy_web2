-- Уникальность цели: одна пара (client_uuid, title) — одна строка.
-- Позволяет избежать дублей при сохранении идеи как цели.
-- CONSTRAINT IF NOT EXISTS не поддерживается в PostgreSQL напрямую,
-- поэтому проверяем через DO-блок.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_goals_client_title'
      AND conrelid = 'goals'::regclass
  ) THEN
    ALTER TABLE goals
      ADD CONSTRAINT uq_goals_client_title UNIQUE (client_uuid, title);
  END IF;
END $$;