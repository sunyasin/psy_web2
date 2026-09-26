-- 20260926000002_planner_stages_steps.sql
-- Планировщик: цели → этапы (идеи) → шаги выбранной стратегии

ALTER TABLE IF EXISTS public.interview_analyses
  ADD COLUMN IF NOT EXISTS goal_answer TEXT;

ALTER TABLE IF EXISTS public.planner_stages
  DROP CONSTRAINT IF EXISTS planner_stages_user_idea_id_fkey;
ALTER TABLE IF EXISTS public.planner_stages
  DROP CONSTRAINT IF EXISTS planner_stages_goal_id_user_idea_id_key;
ALTER TABLE IF EXISTS public.planner_stages
  DROP COLUMN IF EXISTS user_idea_id;

ALTER TABLE IF EXISTS public.planner_stages
  DROP CONSTRAINT IF EXISTS planner_stages_strategy_id_fkey;
ALTER TABLE IF EXISTS public.planner_stages
  DROP COLUMN IF EXISTS strategy_id;

DROP TABLE IF EXISTS public.user_ideas CASCADE;

CREATE TABLE IF NOT EXISTS public.planner_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES public.clients(client_uuid) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.interview_analyses(id) ON DELETE SET NULL,
  idea_index INT NOT NULL DEFAULT 0,
  strategy_title TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'finished', 'canceled', 'deleted')),
  planned_days INT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  result TEXT,
  spent_amount NUMERIC(12, 2) DEFAULT 0,
  model_comments TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, idea_index)
);

COMMENT ON TABLE public.planner_stages IS 'Этап планировщика, соответствующий одной идее из анализа интервью';
COMMENT ON COLUMN public.planner_stages.status IS 'planned, in_progress, finished, canceled, deleted';
COMMENT ON COLUMN public.planner_stages.strategy_title IS 'Название выбранной стратегии';

CREATE TABLE IF NOT EXISTS public.planner_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.planner_stages(id) ON DELETE CASCADE,
  client_uuid UUID REFERENCES public.clients(client_uuid) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE,
  strategy_title TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'finished', 'canceled', 'deleted')),
  notes TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  result TEXT,
  spent_amount NUMERIC(12, 2) DEFAULT 0,
  planned_days INT,
  model_comments TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stage_id, order_index)
);

COMMENT ON TABLE public.planner_steps IS 'Шаги выбранной стратегии внутри этапа планировщика';
COMMENT ON COLUMN public.planner_steps.strategy_title IS 'Название стратегии, которой принадлежит шаг';
COMMENT ON COLUMN public.planner_steps.notes IS 'Заметки пользователя по шагу';
COMMENT ON COLUMN public.planner_steps.result IS 'Необязательный результат, зафиксированный пользователем';
COMMENT ON COLUMN public.planner_steps.model_comments IS 'Комментарии модели по шагу';

ALTER TABLE IF EXISTS public.planner_stages
  ADD COLUMN IF NOT EXISTS strategy_title TEXT;
ALTER TABLE IF EXISTS public.planner_steps
  ADD COLUMN IF NOT EXISTS strategy_title TEXT;

CREATE INDEX IF NOT EXISTS idx_planner_stages_goal_id ON public.planner_stages(goal_id, status);
CREATE INDEX IF NOT EXISTS idx_planner_stages_client_uuid ON public.planner_stages(client_uuid);
CREATE INDEX IF NOT EXISTS idx_planner_stages_analysis_id ON public.planner_stages(analysis_id);
CREATE INDEX IF NOT EXISTS idx_planner_steps_stage_id ON public.planner_steps(stage_id, order_index);
CREATE INDEX IF NOT EXISTS idx_planner_steps_goal_id ON public.planner_steps(goal_id);
CREATE INDEX IF NOT EXISTS idx_planner_steps_status ON public.planner_steps(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_source_analysis_id_fkey'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_source_analysis_id_fkey
      FOREIGN KEY (source_analysis_id) REFERENCES public.interview_analyses(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_goals_source_analysis_id ON public.goals(source_analysis_id);
