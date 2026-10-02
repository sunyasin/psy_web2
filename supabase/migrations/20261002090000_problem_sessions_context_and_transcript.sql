-- 20261002090000_problem_sessions_context_and_transcript.sql
-- Путь B (problem_diagnosis_agent): контекст саботажа и беседа хранятся раздельно.
--
-- До этого изменения:
--   * session_log JSONB — смешивал две разные вещи: контекст саботажа (is_context)
--     и переписку. Контекст приходилось вырезать из лога на каждом чтении.
--   * контекст записывался только при первом INSERT, а разговор — дописывался
--     по мере общения; при перезагрузке страницы история не восстанавливалась,
--     потому что startProblemDiagnosis всегда создавал новую сессию.
--   * routed_to CHECK не содержал 'dismiss', хотя такой вариант есть в UI.
--     UPDATE с 'dismiss' падал по констрейнту, ошибка не проверялась —
--     переписка молча терялась.
--
-- Теперь:
--   context      — контекст (анализ саботажа), неизменяемый в течение сессии.
--   session_log  — читаемая расшифровка беседы для человека: "(дата) Q: ..., A: ...".
--   phase / turn — позиция в сценарии, нужна для продолжения диалога.
--   goal_id      — сессия принадлежит цели, по ней переиспользуется диалог.

ALTER TABLE public.problem_diagnosis_sessions
  ADD COLUMN IF NOT EXISTS context TEXT,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS turn INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cbt_declined BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.problem_diagnosis_sessions.context IS 'Контекст сессии: результат анализа саботажа для цели. Не часть переписки';
COMMENT ON COLUMN public.problem_diagnosis_sessions.session_log IS 'Расшифровка беседы в читаемом виде: "(дата+время) Q: вопрос, A: ответ"';
COMMENT ON COLUMN public.problem_diagnosis_sessions.phase IS 'Текущая фаза сценария: point_a | point_b | clarify | choice | cbt_gate';
COMMENT ON COLUMN public.problem_diagnosis_sessions.turn IS 'Номер хода внутри фазы';
COMMENT ON COLUMN public.problem_diagnosis_sessions.goal_id IS 'Цель, к которой привязана сессия. По ней диалог переиспользуется между визитами';
COMMENT ON COLUMN public.problem_diagnosis_sessions.cbt_declined IS 'Пользователь отказался от предложения КПТ — больше не предлагаем в этой сессии';

-- 'dismiss' есть в UI (кнопка "Не сейчас"), но отсутствовал в CHECK:
-- UPDATE падал, а ошибка не проверялась — беседа молча не сохранялась.
ALTER TABLE public.problem_diagnosis_sessions
  DROP CONSTRAINT IF EXISTS problem_diagnosis_sessions_routed_to_check;

ALTER TABLE public.problem_diagnosis_sessions
  ADD CONSTRAINT problem_diagnosis_sessions_routed_to_check
  CHECK (routed_to IS NULL OR routed_to IN (
    'domain_module',
    'goal_agent',
    'free_diagnosis',
    'paid_booking',
    'dismiss'
  ));

-- Поиск незакрытой сессии клиента идёт на каждом входе на страницу.
CREATE INDEX IF NOT EXISTS idx_problem_sessions_client_goal_open
  ON public.problem_diagnosis_sessions(client_uuid, goal_id)
  WHERE routed_to IS NULL;