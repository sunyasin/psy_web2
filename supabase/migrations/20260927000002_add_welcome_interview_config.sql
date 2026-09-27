-- 20260927000002_add_welcome_interview_config.sql
-- Миграция: добавляет вопросы для входного интервью

INSERT INTO interview_config (interview_id, block_number, block_name, is_conditional, trigger_question, questions, active)
SELECT 
  i.id,
  1,
  'Входное интервью',
  false,
  null,
  '[
    {"order": 1, "source_index": 1, "text": "Что сейчас в жизни вызывает наибольшее внутреннее напряжение?"},
    {"order": 2, "source_index": 2, "text": "Какую проблему вы пытались решить уже много раз, но она возвращается?"},
    {"order": 3, "source_index": 3, "text": "Что вы уже пробовали: психотерапию, медитацию, книги, коучинг, духовные практики?"},
    {"order": 4, "source_index": 4, "text": "Что именно не сработало?"},
    {"order": 5, "source_index": 5, "text": "Если бы можно было изменить одну внутреннюю реакцию — какую?"}
  ]'::jsonb,
  true
FROM interview i WHERE i.code = 'welcome';