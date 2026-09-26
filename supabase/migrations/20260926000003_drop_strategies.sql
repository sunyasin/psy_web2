-- 20260926000003_drop_strategies.sql
-- Стратегии хранятся в interview_analyses.strategy_json, отдельные таблицы больше не нужны.

DROP TABLE IF EXISTS public.step_tracking;
DROP TABLE IF EXISTS public.strategies;
