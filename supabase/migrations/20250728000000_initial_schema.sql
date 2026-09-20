-- 20250728000000_initial_schema.sql
-- Миграция: первичная схема БД для прототипа "Икигай-коуч"
-- Соответствует ТЗ TZ_prototip_ikigai_coach.md (v0.1, 28.07.2026)
-- Стек: Supabase Postgres, без Auth-модуля

-- ============================================================================
-- 1. Идентификация клиента (без auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
  client_uuid UUID PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE clients IS 'Клиенты без авторизации, идентифицируются по client_uuid из localStorage';

-- ============================================================================
-- 2. Анкета и интервью
-- ============================================================================

CREATE TABLE IF NOT EXISTS interview_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_number INT NOT NULL,
  block_name TEXT NOT NULL,
  is_conditional BOOLEAN DEFAULT false,
  trigger_question TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE interview_config IS 'Конфигурация блоков анкеты интервью (раздел 4.3 ТЗ)';
COMMENT ON COLUMN interview_config.questions IS 'Массив: [{order, source_index, text}]';

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  current_block INT DEFAULT 1,
  block4_triggered BOOLEAN DEFAULT false,
  block4_trigger_description TEXT,
  answers JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE interview_sessions IS 'Сессии адаптивного интервью (6 блоков, раздел 4 ТЗ)';
COMMENT ON COLUMN interview_sessions.answers IS 'Структура: {block_number: {question_order: answer_text}}';

-- ============================================================================
-- 3. Маршрутизация и путей B / C
-- ============================================================================

CREATE TABLE IF NOT EXISTS entry_intent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  raw_answer TEXT,
  classified_path TEXT CHECK (classified_path IN ('A_purpose', 'B_problem', 'C_domains')),
  confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE entry_intent IS 'Намерения при входе и маршрутизация по путям A/B/C (раздел 3 ТЗ)';

CREATE TABLE IF NOT EXISTS problem_diagnosis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  point_a_description TEXT,
  point_b_description TEXT,
  problem_summary TEXT,
  routed_to TEXT CHECK (routed_to IN ('domain_module', 'goal_agent', 'free_diagnosis', 'paid_booking')),
  session_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE problem_diagnosis_sessions IS 'Сессии Пути B: разбор проблемы точка А/точка Б (раздел 3.3)';

CREATE TABLE IF NOT EXISTS domain_screening_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  flagged BOOLEAN DEFAULT false
);

COMMENT ON TABLE domain_screening_answers IS 'Ответы короткого скрининга по 6 доменам (Путь C, шаг 1, раздел 3.4)';

CREATE TABLE IF NOT EXISTS limiting_beliefs_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  belief_text TEXT NOT NULL,
  related_question TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE limiting_beliefs_config IS 'Конфиг ограничивающих убеждений по доменам (Путь C, шаг 3)';

CREATE TABLE IF NOT EXISTS domain_deep_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  belief_config_id UUID REFERENCES limiting_beliefs_config(id) ON DELETE CASCADE,
  answer TEXT NOT NULL
);

COMMENT ON TABLE domain_deep_answers IS 'Ответы подробного опросника по доменам (Путь C, шаг 3)';

CREATE TABLE IF NOT EXISTS signal_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (
    signal_type IN (
      'self_sabotage',
      'procrastination',
      'fear_phobia',
      'toxic_relationship',
      'codependency',
      'rescuer_syndrome',
      'impostor_syndrome',
      'substance_food_addiction',
      'emotional_discomfort_repeated'
    )
  ),
  evidence JSONB DEFAULT '{}'::jsonb,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE signal_detections IS 'Сигналы саботажа/зависимостей и т.п. (Путь C, шаг 4, раздел 3.4)';

-- ============================================================================
-- 4. Профиль и синтез
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  version INT DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT CHECK (source IN ('initial_interview', 'checkin_update', 'reflection')),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE profile_snapshots IS 'Версионируемые снимки профиля клиента (values, constraints, skills, ikigai_map, dreams)';

CREATE TABLE IF NOT EXISTS tension_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  type TEXT,
  description TEXT,
  evidence JSONB DEFAULT '{}'::jsonb,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT DEFAULT 'detected' CHECK (status IN ('detected', 'user_confirmed', 'dismissed'))
);

COMMENT ON TABLE tension_flags IS 'Противоречия между целями и поведением (раздел 5.1 ТЗ)';

-- ============================================================================
-- 5. Саботаж и КПТ
-- ============================================================================

CREATE TABLE IF NOT EXISTS self_sabotage_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  pattern_description TEXT NOT NULL,
  domains JSONB DEFAULT '[]'::jsonb,
  evidence_refs JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'detected' CHECK (
    status IN (
      'detected',
      'user_acknowledged',
      'in_cbt_session',
      'escalated_to_paid',
      'dismissed'
    )
  )
);

COMMENT ON TABLE self_sabotage_flags IS 'Флаги самосаботажа, обнаруженные правилом/LLM (раздел 5.2)';

CREATE TABLE IF NOT EXISTS cbt_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  related_flag_id UUID,
  domain TEXT,
  session_log JSONB DEFAULT '[]'::jsonb,
  outcome TEXT CHECK (outcome IN ('resolved', 'needs_followup', 'escalated')),
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE cbt_sessions IS 'Сессии бесплатной КПТ-диагностики (раздел 5.3)';

-- ============================================================================
-- 6. Домены жизни и бронирование
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (
    domain IN (
      'relationships',
      'money',
      'health',
      'purpose',
      'safety',
      'belonging'
    )
  ),
  description TEXT,
  evidence JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'detected' CHECK (
    status IN (
      'detected',
      'free_chat_chosen',
      'paid_booked',
      'dismissed'
    )
  ),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE domain_flags IS 'Универсальные флаги проблем по доменам жизни (раздел 7 ТЗ)';

CREATE TABLE IF NOT EXISTS booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  method_name TEXT,
  contact_info TEXT,
  status TEXT DEFAULT 'requested',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE booking_requests IS 'Заглушка бронирования платных сессий (раздел 7.1)';

-- ============================================================================
-- 7. Цели, OKR, планы, трекинг
-- ============================================================================

CREATE TABLE IF NOT EXISTS need_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  goal_id UUID,
  stated_goal TEXT,
  laddering_chain JSONB DEFAULT '[]'::jsonb,
  underlying_needs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE need_analyses IS 'Laddering-диалог: прояснение глубинных потребностей (need_deconstruction_agent)';

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  horizon TEXT CHECK (horizon IN ('5y', '3y', '1y')),
  horizon_months INT,
  smart_json JSONB DEFAULT '{}'::jsonb,
  requires_money_as_prerequisite BOOLEAN DEFAULT false,
  planning_track TEXT CHECK (planning_track IN ('standard_ai_plan', 'nlp_method')),
  origin TEXT DEFAULT 'primary' CHECK (origin IN ('primary', 'emergent')),
  blocks_goal_ids JSONB DEFAULT '[]'::jsonb,
  execution_mode TEXT CHECK (execution_mode IN ('parallel', 'sequential_priority')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'achieved', 'abandoned')),
  paused_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE goals IS 'Цели клиента, включая эмерджентные и множественные активные цели (раздел 7.4 ТЗ)';

CREATE TABLE IF NOT EXISTS goal_capacity_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  new_goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  relation_type TEXT CHECK (relation_type IN ('blocking', 'independent', 'resource_conflict')),
  workload_snapshot JSONB DEFAULT '{}'::jsonb,
  user_choice TEXT CHECK (user_choice IN ('parallel', 'prioritize_new', 'keep_existing_priority')),
  affected_goal_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE goal_capacity_decisions IS 'Лог решений goal_capacity_agent (раздел 7.4)';

CREATE TABLE IF NOT EXISTS okrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  key_results JSONB DEFAULT '[]'::jsonb,
  period TEXT
);

COMMENT ON TABLE okrs IS 'SMART/OKR контейнер для целей';

CREATE TABLE IF NOT EXISTS plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  okr_id UUID REFERENCES okrs(id) ON DELETE CASCADE,
  period_type TEXT CHECK (period_type IN ('month', 'week')),
  period_key TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT DEFAULT 'pending'
);

COMMENT ON TABLE plan_items IS 'Задачи плана: декомпозиция год→месяц→неделя (plan_agent)';

CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID REFERENCES clients(client_uuid) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  raw_input TEXT,
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  plan_adjustment JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE check_ins IS 'Еженедельные отчёты и их анализ (checkin_agent)';

-- ============================================================================
-- 8. Индексы для частых запросов
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_client_uuid ON interview_sessions(client_uuid);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_entry_intent_client_uuid ON entry_intent(client_uuid);
CREATE INDEX IF NOT EXISTS idx_problem_diagnosis_sessions_client_uuid ON problem_diagnosis_sessions(client_uuid);
CREATE INDEX IF NOT EXISTS idx_domain_screening_answers_client_uuid ON domain_screening_answers(client_uuid);
CREATE INDEX IF NOT EXISTS idx_domain_screening_answers_domain ON domain_screening_answers(domain);
CREATE INDEX IF NOT EXISTS idx_domain_deep_answers_client_uuid ON domain_deep_answers(client_uuid);
CREATE INDEX IF NOT EXISTS idx_signal_detections_client_uuid ON signal_detections(client_uuid);
CREATE INDEX IF NOT EXISTS idx_profile_snapshots_client_uuid ON profile_snapshots(client_uuid);
CREATE INDEX IF NOT EXISTS idx_tension_flags_client_uuid ON tension_flags(client_uuid);
CREATE INDEX IF NOT EXISTS idx_self_sabotage_flags_client_uuid ON self_sabotage_flags(client_uuid);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_client_uuid ON cbt_sessions(client_uuid);
CREATE INDEX IF NOT EXISTS idx_domain_flags_client_uuid ON domain_flags(client_uuid);
CREATE INDEX IF NOT EXISTS idx_domain_flags_domain ON domain_flags(domain);
CREATE INDEX IF NOT EXISTS idx_booking_requests_client_uuid ON booking_requests(client_uuid);
CREATE INDEX IF NOT EXISTS idx_need_analyses_client_uuid ON need_analyses(client_uuid);
CREATE INDEX IF NOT EXISTS idx_goals_client_uuid ON goals(client_uuid);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goal_capacity_decisions_client_uuid ON goal_capacity_decisions(client_uuid);
CREATE INDEX IF NOT EXISTS idx_okrs_goal_id ON okrs(goal_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_client_uuid ON plan_items(client_uuid);
CREATE INDEX IF NOT EXISTS idx_plan_items_okr_id ON plan_items(okr_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_period ON plan_items(period_type, period_key);
CREATE INDEX IF NOT EXISTS idx_check_ins_client_uuid ON check_ins(client_uuid);
CREATE INDEX IF NOT EXISTS idx_check_ins_period ON check_ins(period_key);
