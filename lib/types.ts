export type IntentPath = "A_purpose" | "B_problem" | "C_domains";

export interface ClientRow {
  client_uuid: string;
  display_name?: string | null;
  login?: string | null;
  created_at: string;
}

export interface EntryIntentRow {
  id: string;
  client_uuid: string;
  raw_answer?: string | null;
  classified_path?: IntentPath | null;
  confirmed: boolean;
  created_at: string;
}

export interface InitClientResponse {
  client_uuid: string;
  display_name?: string | null;
  login?: string | null;
}

export interface ClassifyIntentResponse {
  id: string;
  classified_path: IntentPath;
}

export interface InterviewQuestion {
  order: number;
  source_index: number;
  text: string;
}

export interface InterviewConfigRow {
  id: string;
  interview_id: string;
  block_number: number;
  block_name: string;
  is_conditional: boolean;
  trigger_question: string | null;
  questions: InterviewQuestion[];
  active: boolean;
}

export interface InterviewSessionRow {
  id: string;
  client_uuid: string;
  interview_id: string;
  current_block: number;
  block4_triggered: boolean;
  block4_trigger_description: string | null;
  answers: any;
  status: string;
  created_at: string;
}

export interface InterviewQuestionResult {
  sessionId: string;
  blockNumber: number;
  order: number;
  text: string;
  isLast: boolean;
  totalInBlock: number;
  completed: boolean;
}

export type ProblemPhase = "point_a" | "point_b" | "clarify" | "choice" | "cbt_gate";

/** Почему предложен переход в КПТ — используется как подсказка агенту и в UI. */
export type CbtTriggerReason =
  | "recurring_pattern_language"
  | "self_critical_generalization"
  | "explicit_fear"
  | "procrastination_from_fear"
  | "pattern_across_contexts"
  | "why_i_do_this"
  | null;

export interface ProblemDiagnosisSessionRow {
  id: string;
  client_uuid: string;
  point_a_description?: string | null;
  point_b_description?: string | null;
  problem_summary?: string | null;
  routed_to?: string | null;
  session_log: any;
  created_at: string;
}

export interface ProblemMessage {
  role: "agent" | "user";
  text: string;
  phase: ProblemPhase;
}

export interface ProblemState {
  sessionId: string;
  phase: ProblemPhase;
  prompt: string;
  choices?: { value: string; label: string }[];
  completed: boolean;
  routedTo?: string;
  /** Агент заметил КПТ-сигналы и предложил переключить формат. */
  cbtSuggested?: boolean;
  cbtTriggerReason?: CbtTriggerReason;
  /** Пользователь уже отклонил предложение — больше не предлагаем в этой сессии. */
  cbtDeclined?: boolean;
}

export type DomainKey =
  | "relationships"
  | "money"
  | "health"
  | "purpose"
  | "safety"
  | "belonging";

export type DomainRoutedTo = "free_chat_chosen" | "paid_booked" | "dismissed" | null;

export interface DomainChoice {
  value: DomainRoutedTo;
  label: string;
}

export interface DomainState {
  screeningId?: string;
  screenComplete: boolean;
  selectedDomains: DomainKey[];
  activeDomain: DomainKey | null;
  questionnaireComplete: boolean;
  signalsDetected: boolean;
  choices: DomainChoice[];
  completed: boolean;
  routedTo?: DomainRoutedTo;
}

export interface DomainScreeningQuestion {
  id: string;
  domain: DomainKey;
  question: string;
  order: number;
}

export interface LimitingBeliefConfig {
  id: string;
  domain: DomainKey;
  belief_text: string;
  related_question: string;
}

export interface DomainFlagRow {
  id: string;
  client_uuid: string;
  domain: DomainKey;
  description?: string | null;
  evidence?: any;
  status?: string | null;
  created_at: string;
}

export interface SignalDetectionRow {
  id: string;
  client_uuid: string;
  domain: DomainKey;
  signal_type: string;
  evidence?: any;
  confidence?: number | null;
  created_at: string;
}

export interface BookingRequestRow {
  id: string;
  client_uuid: string;
  domain: DomainKey;
  method_name?: string | null;
  contact_info?: string | null;
  status: string;
  created_at: string;
}

export interface ProfileSnapshotRow {
  id: string;
  client_uuid: string;
  version: number;
  data: any;
  source: string;
  created_at: string;
}

export interface TensionFlagRow {
  id: string;
  client_uuid: string;
  type?: string | null;
  description: string;
  evidence?: any;
  confidence?: number | null;
  status: string;
}

export interface SynthesisState {
  completed: boolean;
  profileId?: string;
  tensionsDetected: boolean;
  tensionCount: number;
}

export interface TensionState {
  currentIndex: number;
  total: number;
  tensionId: string;
  description: string;
  evidence?: any;
  completed: boolean;
}

export interface InterviewSessionWithAnswers extends InterviewSessionRow {
  allQuestions?: InterviewQuestion[];
  currentQuestionText?: string;
}

export interface Idea {
  title: string;
  description: string;
  tags: string[];
}

export interface AnalysisResult {
  ideas: Idea[];
  answerCount: number;
}

export type CbtOutcome = "resolved" | "needs_followup" | "escalated";

export interface CbtSessionRow {
  id: string;
  client_uuid: string;
  related_flag_id?: string | null;
  domain?: string | null;
  session_log: any;
  outcome?: CbtOutcome | null;
  model_used?: string | null;
  created_at: string;
}

export interface CbtMessage {
  role: "agent" | "user";
  text: string;
  timestamp: string;
}

export interface CbtState {
  sessionId: string;
  messages: CbtMessage[];
  completed: boolean;
  outcome?: CbtOutcome;
  crisisDetected: boolean;
}

export interface InterviewAnalysisRow {
  id: string;
  client_uuid: string;
  interview_session_id: string;
  source_file?: string | null;
  raw_answers: any;
  model_json?: any;
  model_used?: string | null;
  answer_count: number;
  goal_answer?: string | null;
  created_at: string;
  interview_id?: string | null;
  interview_name?: string | null;
  session_status?: string | null;
  kind?: string | null;
}

export interface ModelIdea {
  title: string;
  description: string;
  quotes: string[];
  why_you: string;
  first_step: {
    action: string;
    days_to_first_test: number;
    difficulty: "low" | "medium" | "hard";
    resources: string[];
  };
  similar_cases: {
    name: string;
    similarity: string;
    approach: string;
  }[];
  market: {
    overview: string;
    competitors: {
      name: string;
      note: string;
    }[];
    helpers: {
      name: string;
      how_helps: string;
    }[];
  };
  risks: {
    financial: string[];
    psychological: string[];
    physical: string[];
    other: string[];
  };
  tags?: string[];
}

export interface GoalRow {
  id: string;
  client_uuid: string;
  title: string;
  horizon?: string | null;
  horizon_months?: number | null;
  smart_json?: any;
  requires_money_as_prerequisite?: boolean;
  planning_track?: string | null;
  origin?: string | null;
  blocks_goal_ids?: any;
  execution_mode?: string | null;
  status?: string | null;
  paused_reason?: string | null;
  source_analysis_id?: string | null;
  decomposition_analysis_id?: string | null;
  has_default_interview?: boolean;
  conflict_analysis?: string | null;
  created_at: string;
}

export interface SelectedIdea {
  analysisId: string;
  title: string;
  description: string;
  tags: string[];
}

export interface ShortAnalysisStrategy {
  name: string;
  steps: ShortAnalysisStep[];
}

export interface ShortAnalysisStep {
  step: number;
  title: string;
  description: string;
  estimated_days: number;
}

export interface ShortAnalysisResult {
  title: string;
  description: string;
  strategies: ShortAnalysisStrategy[];
}

export type PlannerStatus = 'planned' | 'in_progress' | 'finished' | 'canceled' | 'deleted';

export interface PlannerStageRow {
  id: string;
  client_uuid: string;
  goal_id: string;
  analysis_id: string | null;
  idea_index: number;
  strategy_title: string | null;
  title: string;
  description: string | null;
  status: PlannerStatus;
  planned_days: number | null;
  started_at: string | null;
  finished_at: string | null;
  result: string | null;
  spent_amount: number | null;
  model_comments: string | null;
  order_index: number;
}

export interface PlannerStepRow {
  id: string;
  stage_id: string;
  client_uuid: string;
  goal_id: string;
  title: string;
  description: string | null;
  status: PlannerStatus;
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
  result: string | null;
  spent_amount: number | null;
  planned_days: number | null;
  model_comments: string | null;
  progress_percent: number;
  order_index: number;
}

export interface PlannerStageWithSteps extends PlannerStageRow {
  steps: PlannerStepRow[];
}

export interface PlannerGoalSummary {
  id: string;
  title: string;
  status: string | null;
  description: string | null;
  strategy_title: string | null;
  stages_count: number;
  steps_count: number;
  finished_steps_count: number;
  progress_percent: number;
  idea_index: number | null;
  updated_at: string | null;
}

export interface NewResource {
  category: string;
  items: string[];
  rationale: string;
}

export interface NewSupport {
  who: string;
  needed: boolean;
  description: string;
}

export interface NewStep {
  number: number;
  title: string;
  duration: string;
  estimated_days: number;
  description: string;
}

export interface NewTimeToLaunch {
  days_to_first_step: number;
  days_to_result: number;
  note: string;
}

export interface NewAvoid {
  rule: string;
  reason: string;
}

export interface NewStrategy {
  name: string;
  approach: string;
  resources: NewResource[];
  support: NewSupport[];
  steps: NewStep[];
  time_to_launch: NewTimeToLaunch;
  timeline: string;
  budget: string;
  investment: string;
  avoid: NewAvoid[];
  assumptions: string[];
}

export interface NewStage {
  number: number;
  name: string;
  description: string;
  strategies: NewStrategy[];
}

export interface NewResponse {
  title: string;
  description: string;
  tags: string[];
  stages: NewStage[];
}

