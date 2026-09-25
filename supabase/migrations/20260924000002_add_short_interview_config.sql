-- 20260924000002_add_short_interview_config.sql
-- Миграция: добавляет вопросы для короткого интервью (4 вопроса)

INSERT INTO interview_config (interview_id, block_number, block_name, is_conditional, trigger_question, questions, active)
SELECT
  i.id,
  1,
  'Цель и точка Б',
  false,
  null,
  '[
    {"order": 1, "source_index": 1, "text": "Опишите вашу цель, мечту или желаемое состояние."}
  ]'::jsonb,
  true
FROM interview i
WHERE i.code = 'short'
  AND NOT EXISTS (
    SELECT 1 FROM interview_config ic 
    WHERE ic.interview_id = i.id AND ic.block_number = 1
  );

INSERT INTO interview_config (interview_id, block_number, block_name, is_conditional, trigger_question, questions, active)
SELECT
  i.id,
  2,
  'Текущее положение',
  false,
  null,
  '[
    {"order": 1, "source_index": 1, "text": "Опишите как можно подробнее ваше текущее положение во всех областях жизни, которые так или иначе связаны с этой целью."}
  ]'::jsonb,
  true
FROM interview i
WHERE i.code = 'short'
  AND NOT EXISTS (
    SELECT 1 FROM interview_config ic 
    WHERE ic.interview_id = i.id AND ic.block_number = 2
  );

INSERT INTO interview_config (interview_id, block_number, block_name, is_conditional, trigger_question, questions, active)
SELECT
  i.id,
  3,
  'Ресурсы и способности',
  false,
  null,
  '[
    {"order": 1, "source_index": 1, "text": "Опишите как можно подробнее: какими способностями, наклонностями, опытом и в каких областях вы обладаете уже сейчас?"}
  ]'::jsonb,
  true
FROM interview i
WHERE i.code = 'short'
  AND NOT EXISTS (
    SELECT 1 FROM interview_config ic 
    WHERE ic.interview_id = i.id AND ic.block_number = 3
  );

INSERT INTO interview_config (interview_id, block_number, block_name, is_conditional, trigger_question, questions, active)
SELECT
  i.id,
  4,
  'Ограничения и препятствия',
  false,
  null,
  '[
    {"order": 1, "source_index": 1, "text": "Если есть какие-либо объективные физические и психологические, моральные ограничения или препятствия, мешающие хоть немного приблизиться к цели, начать действовать и получить желаемый результат?"}
  ]'::jsonb,
  true
FROM interview i
WHERE i.code = 'short'
  AND NOT EXISTS (
    SELECT 1 FROM interview_config ic 
    WHERE ic.interview_id = i.id AND ic.block_number = 4
  );