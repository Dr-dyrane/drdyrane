export type ConsultationStatus = 'idle' | 'intake' | 'active' | 'lens' | 'emergency' | 'complete';
export type AppTheme = 'system' | 'dark' | 'light';
export type AppView = 'consult' | 'history' | 'about';
export type SheetType = 'profile' | 'notifications' | null;

export interface SOAPState {
  S: Record<string, unknown>;
  O: Record<string, unknown>;
  A: Record<string, unknown>;
  P: Record<string, unknown>;
}

export interface PillarData {
  diagnosis: string;
  management: string;
  prognosis: string;
  prevention: string;
}

export interface ClerkingSchema {
  hpc: string;
  pmh: string;
  dh: string;
  sh: string;
  fh: string;
}

export interface SessionRecord {
  id: string;
  timestamp: number;
  updated_at: number;
  visit_label: string;
  diagnosis: string;
  complaint?: string;
  notes?: string;
  status: ConsultationStatus;
  soap: SOAPState;
  profile_snapshot?: UserProfile;
  clerking?: ClerkingSchema;
  snapshot: ConsultationSnapshot;
  pillars?: PillarData;
}

export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string;
  age?: number;
  sex?: 'female' | 'male' | 'intersex' | 'other' | 'prefer_not_to_say';
  pronouns?: string;
  allergies?: string;
  chronic_conditions?: string;
  medications?: string;
  updated_at: number;
}

export interface AppSettings {
  haptics_enabled: boolean;
  audio_enabled: boolean;
  reduced_motion: boolean;
  notifications_enabled: boolean;
  text_scale: 'sm' | 'md' | 'lg';
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  created_at: number;
  read: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'doctor' | 'patient' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    soap_updates?: Partial<SOAPState>;
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    probability?: number;
    thinking?: string;
    statement?: string;
    question?: string;
    lens_trigger?: string | null;
  };
}

export interface ResponseOptions {
  mode: 'single' | 'multiple' | 'freeform' | 'confirm';
  ui_variant?: 'stack' | 'grid' | 'binary' | 'scale' | 'chips' | 'segmented' | 'ladder';
  scale?: {
    min: number;
    max: number;
    step?: number;
    low_label?: string;
    high_label?: string;
  };
  options: Array<{
    id: string;
    text: string;
    category?: string;
    priority?: number;
    requires_confirmation?: boolean;
  }>;
  context_hint?: string;
  allow_custom_input?: boolean;
}

export interface GatedQuestionSegment {
  id: string;
  prompt: string;
}

export interface GatedQuestionAnswer {
  segment_id: string;
  prompt: string;
  response: string;
}

export interface QuestionGateState {
  active: boolean;
  source_question: string;
  segments: GatedQuestionSegment[];
  current_index: number;
  answers: GatedQuestionAnswer[];
}

export interface AgentState {
  phase: 'intake' | 'assessment' | 'differential' | 'resolution' | 'followup';
  confidence: number; // 0-100
  focus_area: string;
  pending_actions: string[];
  last_decision: string;
}

export interface ConsultationSnapshot {
  soap: SOAPState;
  ddx: string[];
  status: ConsultationStatus;
  redFlag: boolean;
  pillars: PillarData | null;
  conversation: ConversationMessage[];
  agent_state: AgentState;
  probability: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  thinking?: string;
  clerking: ClerkingSchema;
}

export interface ClinicalState {
  sessionId: string;
  view: AppView;
  soap: SOAPState;
  ddx: string[];
  status: ConsultationStatus;
  theme: AppTheme;
  redFlag: boolean;
  pillars: PillarData | null;
  currentQuestion: {
    question: string;
    options: string[];
  } | null;

  // New agent-driven fields
  conversation: ConversationMessage[];
  agent_state: AgentState;
  response_options: ResponseOptions | null;
  selected_options: string[];
  lastFeedback?: string;
  probability: number; // 0-100 certainty
  urgency: 'low' | 'medium' | 'high' | 'critical';
  thinking?: string; // AI's current clinical focus
  question_gate: QuestionGateState | null;
  profile: UserProfile;
  settings: AppSettings;
  notifications: AppNotification[];
  active_sheet: SheetType;
  clerking: ClerkingSchema;
  isHxOpen: boolean; // Controls the Hx drawer
  history: ClinicalState[];
  archives: SessionRecord[];
}
