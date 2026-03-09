export type ConsultationStatus = 'idle' | 'intake' | 'active' | 'lens' | 'emergency' | 'complete';
export type AppTheme = 'dark' | 'light';
export type AppView = 'consult' | 'history' | 'about';

export interface SOAPState {
  S: Record<string, any>;
  O: Record<string, any>;
  A: Record<string, any>;
  P: Record<string, any>;
}

export interface PillarData {
  diagnosis: string;
  management: string;
  prognosis: string;
  prevention: string;
}

export interface SessionRecord {
  id: string;
  timestamp: number;
  diagnosis: string;
  status: ConsultationStatus;
  soap: SOAPState;
  pillars?: PillarData;
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
  };
}

export interface ResponseOptions {
  mode: 'single' | 'multiple' | 'freeform' | 'confirm';
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

export interface AgentState {
  phase: 'intake' | 'assessment' | 'differential' | 'resolution' | 'followup';
  confidence: number; // 0-100
  focus_area: string;
  pending_actions: string[];
  last_decision: string;
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
  isHxOpen: boolean; // Controls the Hx drawer
  history: ClinicalState[];
  archives: SessionRecord[];
}
