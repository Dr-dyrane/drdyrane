export type LlmProvider = 'anthropic' | 'openai';

export type ConversationEntry = {
  role: 'doctor' | 'patient' | 'system';
  content: string;
};

export type ConsultRequest = {
  patientInput: string;
  state: {
    soap: Record<string, unknown>;
    agent_state: Record<string, unknown>;
    ddx: string[];
    urgency: string;
    probability: number;
    profile: Record<string, unknown>;
    memory_dossier?: string;
    conversation: ConversationEntry[];
  };
};

export type OptionsRequest = {
  lastQuestion: string;
  agentState: Record<string, unknown>;
  currentSOAP: Record<string, unknown>;
  recentConversation?: ConversationEntry[];
};

export type VisionRequest = {
  imageDataUrl: string;
  clinicalContext?: string;
  lensPrompt?: string;
};

export type ScanPlanRequest = {
  analysis?: VisionPayload | Record<string, unknown>;
  clinicalContext?: string;
  lens?: 'general' | 'lab' | 'radiology';
};


export type ConsultPayload = {
  statement?: string;
  question?: string;
  soap_updates?: {
    S?: Record<string, unknown>;
    O?: Record<string, unknown>;
    A?: Record<string, unknown>;
    P?: Record<string, unknown>;
  };
  ddx?: string[];
  agent_state?: {
    phase?: string;
    confidence?: number;
    focus_area?: string;
    pending_actions?: string[];
    last_decision?: string;
    positive_findings?: string[];
    negative_findings?: string[];
    must_not_miss_checkpoint?: {
      required?: boolean;
      status?: 'idle' | 'pending' | 'cleared' | 'escalate';
      last_question?: string;
      last_response?: string;
      updated_at?: number;
    };
  };
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  probability?: number;
  thinking?: string;
  needs_options?: boolean;
  lens_trigger?: string | null;
  status?: 'idle' | 'intake' | 'active' | 'lens' | 'emergency' | 'complete';
  diagnosis?: {
    label?: string;
    icd10?: string;
    confidence?: number;
    rationale?: string;
  };
  differentials?: Array<{
    label?: string;
    icd10?: string;
    likelihood?: 'high' | 'medium' | 'low' | string;
    rationale?: string;
  }>;
  management?: string[];
  investigations?: string[];
  counseling?: string[];
  red_flags?: string[];
};

export type OptionsPayload = {
  mode?: 'single' | 'multiple' | 'freeform' | 'confirm';
  ui_variant?: 'stack' | 'grid' | 'binary' | 'segmented' | 'scale' | 'ladder' | 'chips';
  scale?: {
    min?: number;
    max?: number;
    step?: number;
    low_label?: string;
    high_label?: string;
  };
  options?: Array<{
    id?: string;
    text?: string;
    category?: string;
    priority?: number;
    requires_confirmation?: boolean;
  }>;
  context_hint?: string;
  allow_custom_input?: boolean;
};

export type VisionPayload = {
  summary?: string;
  findings?: string[];
  red_flags?: string[];
  confidence?: number;
  recommendation?: string;
  spot_diagnosis?: {
    label?: string;
    icd10?: string;
    confidence?: number;
    rationale?: string;
  };
  differentials?: Array<{
    label?: string;
    icd10?: string;
    likelihood?: 'high' | 'medium' | 'low' | string;
    rationale?: string;
  }>;
  treatment_summary?: string;
  treatment_lines?: string[];
  investigations?: string[];
  counseling?: string[];
};

export type ChiefComplaintEngineId =
  | 'fever'
  | 'chest_pain'
  | 'shortness_of_breath'
  | 'headache'
  | 'abdominal_pain'
  | 'vomiting_nausea'
  | 'diarrhea'
  | 'rash'
  | 'joint_pain'
  | 'weakness_fatigue'
  | 'bleeding'
  | 'altered_mental_status'
  | 'general';

export interface ChiefComplaintEngine {
  id: ChiefComplaintEngineId;
  label: string;
  starterQuestion: string;
  mustNotMiss: string[];
  matchers: RegExp[];
}

export type EngineContractDefaults = {
  fallbackIcd10: string;
  management: string[];
  investigations: string[];
  counseling: string[];
  redFlags: string[];
};

export type RankedLlmDiagnosis = {
  diagnosis: string;
  score: number;
  emergency: boolean;
  followUpQuestion?: string;
  pendingActions: string[];
};

export type OrchestratedCandidate = {
  diagnosis: string;
  score: number;
  emergency: boolean;
  followUpQuestion?: string;
  pendingActions: string[];
  source: 'profile' | 'llm';
};

export type AgentPhase = NonNullable<NonNullable<ConsultPayload['agent_state']>['phase']>;

export type EvidencePattern = {
  pattern: RegExp;
  weight: number;
};

export type SuppressionPattern = {
  pattern: RegExp;
  penalty: number;
};

export type DiseaseProfile = {
  id: string;
  label: string;
  icd10: string;
  source: 'who_priority' | 'medscape_core';
  minScore: number;
  emergency?: boolean;
  requiredAny?: RegExp[];
  support: EvidencePattern[];
  suppress?: SuppressionPattern[];
  followUpQuestion: string;
  pendingActions: string[];
};

export type RankedDisease = {
  profile: DiseaseProfile;
  score: number;
};

export type QuestionIntent = 'most_limiting' | 'symptom_change' | 'pattern' | 'danger_signs';

export type PrescriptionRequest = {
  diagnosis: string;
  icd10?: string;
  age?: number;
  weight_kg?: number;
  sex?: string;
  pregnancy?: boolean;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  soap?: Record<string, unknown>;
};

export type PrescriptionResponse = {
  prescriptions: Array<{
    medication: string;
    form: string;
    dose_per_kg?: number | null;
    max_dose?: number | null;
    unit: string;
    frequency: string;
    duration: string;
    note?: string;
  }>;
  rationale: string;
};
