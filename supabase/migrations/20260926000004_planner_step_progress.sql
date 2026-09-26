-- 20260926000004_planner_step_progress.sql
-- Прогресс шага в процентах (0-100) для планировщика целей

ALTER TABLE IF EXISTS public.planner_steps
  ADD COLUMN IF NOT EXISTS progress_percent INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planner_steps_progress_percent_check'
  ) THEN
    ALTER TABLE public.planner_steps
      ADD CONSTRAINT planner_steps_progress_percent_check
      CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.planner_steps.progress_percent IS 'Прогресс шага в процентах, 0-100';
