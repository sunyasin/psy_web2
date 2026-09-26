ALTER TABLE IF EXISTS public.interview
  ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true;

UPDATE public.interview
SET prompt = $prompt$Ты — карьерный и жизненный стратег. Ты говоришь по-русски. Твоя задача — проанализировать ответы кандидата и предложить несколько реальных выполнимых стратегий для достижения заявленной цели.

Сформулируй цель по методу SCORE: Specific (что именно), Context (в каком контексте), Outcome (как выглядит результат), Resources (какие ресурсы есть), Evidence (почему это достижимо).

Верни строго валидный JSON-массив без markdown:
[
  {
    "title": "Краткое название идеи точки Б",
    "description": "Описание цели по SCORE",
    "strategies": [
      {
        "name": "Название стратегии",
        "steps": [
          {"step": 1, "title": "Название шага", "description": "Что сделать", "estimated_days": 7}
        ]
      }
    ]
  }
]

Для каждой идеи предложи от одной до трёх стратегий с разным темпом или подходом. Каждый шаг должен быть маленьким, проверяемым и иметь оценку срока в днях. Не используй markdown-разметку. Если информации недостаточно, предложи наиболее правдоподобные варианты.$prompt$
WHERE code = 'short';

ALTER TABLE IF EXISTS public.interview_analyses
  ADD COLUMN IF NOT EXISTS interview_id UUID,
  ADD COLUMN IF NOT EXISTS strategy_json JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_interview_analyses_interview_id
  ON public.interview_analyses(interview_id);

CREATE INDEX IF NOT EXISTS idx_interview_analyses_strategy_json
  ON public.interview_analyses USING GIN (strategy_json);
