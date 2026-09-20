-- 20250813000001_add_interview_directory.sql
-- Миграция: справочник интервью и привязка interview_config к interview

CREATE TABLE IF NOT EXISTS interview (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  prompt TEXT
);

COMMENT ON TABLE interview IS 'Справочник интервью (анкет)';

INSERT INTO interview (code, name, prompt) VALUES (
  'default',
  'Основное интервью',
  $prompt$Ты — карьерный и жизненный стратег. Ты говоришь по-русски. Твоя задача — проанализировать ответы кандидата на интервью и предложить 5 релевантных идей для его дальнейшего пути.

На основе ответов выдели паттерны, сильные стороны, интересы, опыт и ценности. Предложи идеи, которые совпадают с его биографией и предпочтениями.

Формат ответа — строго JSON массив из 5 объектов:
[
  {
    "title": "Краткое название идеи",
    "description": "Развёрнутое описание идеи, почему она подходит именно этому человеку, какие его ответы это подтверждают. 2-4 предложения.",
    "tags": ["тег1", "тег2", "тег3"]
  }
]

Правила:
- Отвечай строго на русском.
- Не используй markdown-разметку, только чистый JSON.
- Убедись, что JSON валиден.
- Если информации недостаточно — предложи наиболее правдоподобные идеи на основе имеющихся ответов.$prompt$
);

ALTER TABLE interview_config
  ADD COLUMN IF NOT EXISTS interview_id UUID;

UPDATE interview_config
  SET interview_id = (SELECT id FROM interview LIMIT 1)
  WHERE interview_id IS NULL;

ALTER TABLE interview_config
  ALTER COLUMN interview_id SET NOT NULL;

ALTER TABLE interview_config
  ADD CONSTRAINT interview_config_interview_id_fkey
    FOREIGN KEY (interview_id) REFERENCES interview(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_interview_config_interview_id ON interview_config(interview_id);
