export type IntentPath = "A_purpose" | "B_problem" | "C_domains";

export interface ClientRow {
  client_uuid: string;
  display_name?: string | null;
  email?: string | null;
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
  email?: string | null;
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

export type ProblemPhase = "point_a" | "point_b" | "clarify" | "choice";

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
  ideas: any;
  model_used?: string | null;
  answer_count: number;
  created_at: string;
  interview_id?: string | null;
  interview_name?: string | null;
  session_status?: string | null;
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
  conflict_analysis?: string | null;
  created_at: string;
}

export interface SelectedIdea {
  analysisId: string;
  title: string;
  description: string;
  tags: string[];
}

