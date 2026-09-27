-- 20260926000008_add_goal_decomposition_analysis.sql
-- Декомпозиция отдельной цели со страницы идеи.
--
-- Цель — не создавать ещё одно интервью: анализ привязывается к уже существующей
-- завершённой сессии большого интервью (interview_analyses.interview_session_id NOT NULL),
-- а связь «анализ → цели, для которых он построен» живёт на goals.
--
-- source_analysis_id не переиспользуется: он уже хранит «анализ, из которого взяли цель»
-- и не уникален (один анализ порождает до 5 целей).

ALTER TABLE public.interview_analyses
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'short';

COMMENT ON COLUMN public.interview_analyses.kind IS 'Тип анализа: short | goal_decomposition. NOT NULL DEFAULT нужен, чтобы записи, созданные без kind, попадали в общие выборки';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS decomposition_analysis_id UUID
  REFERENCES public.interview_analyses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.goals.decomposition_analysis_id IS 'Анализ декомпозиции этой цели (kind=goal_decomposition). Не связан с source_analysis_id, который хранит происхождение цели';

CREATE INDEX IF NOT EXISTS idx_goals_decomposition_analysis_id
  ON public.goals(decomposition_analysis_id);

-- Две цели не могут ссылаться на одну декомпозицию.
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_one_decomposition_per_goal
  ON public.goals(decomposition_analysis_id)
  WHERE decomposition_analysis_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_analyses_kind
  ON public.interview_analyses(kind);

-- Запись-маркер в справочнике интервью: несёт промпт (копия промпта 'short') и
-- interview_id, по которому декомпозиция отличается от обычного короткого анализа.
-- visible = false — чтобы строка не показывалась как интервью в UI.
INSERT INTO public.interview (code, name, prompt, visible)
SELECT 'decomposition', 'Декомпозиция цели', prompt, false
FROM public.interview
WHERE code = 'short'
  AND NOT EXISTS (
    SELECT 1 FROM public.interview WHERE code = 'decomposition'
  );
