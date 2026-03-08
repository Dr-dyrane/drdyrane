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
  lastFeedback?: string;
  probability: number; // 0-100 certainty
  urgency: 'low' | 'medium' | 'high' | 'critical';
  thinking?: string; // AI's current clinical focus
  isHxOpen: boolean; // Controls the Hx drawer
  history: ClinicalState[];
  archives: SessionRecord[];
}
