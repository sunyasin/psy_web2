-- 20260926000005_planner_steps_drop_strategy_title.sql
-- Шаги этапа всегда принадлежат стратегии, выбранной для этого этапа,
-- поэтому strategy_title хранится только в planner_stages.

-- Чистим legacy-данные: оставляем только шаги выбранной стратегии этапа.
DELETE FROM public.planner_steps ps
USING public.planner_stages st
WHERE ps.stage_id = st.id
  AND ps.strategy_title IS DISTINCT FROM st.strategy_title;

-- Шаги без привязанного этапа удаляем, чтобы не осталось сирот.
DELETE FROM public.planner_steps ps
WHERE NOT EXISTS (
  SELECT 1 FROM public.planner_stages st WHERE st.id = ps.stage_id
);

ALTER TABLE IF EXISTS public.planner_steps
  DROP COLUMN IF EXISTS strategy_title;
