import React, { createContext, useContext, useReducer, useEffect } from 'react';

export type SOAPState = {
  S: Record<string, any>;
  O: Record<string, any>;
  A: Record<string, any>;
  P: Record<string, any>;
};

export type PillarData = {
  diagnosis: string;
  management: string;
  prognosis: string;
  prevention: string;
};

export type ConsultationStatus = 'idle' | 'intake' | 'active' | 'lens' | 'emergency' | 'complete';
export type AppTheme = 'dark' | 'light';
export type AppView = 'consult' | 'history' | 'about';

export interface SessionRecord {
  id: string;
  timestamp: number;
  diagnosis: string;
  status: ConsultationStatus;
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
  history: ClinicalState[]; // State stack for undo/back within session
  archives: SessionRecord[]; // Persistent past session summary
}

type Action =
  | { type: 'START_INTAKE' }
  | { type: 'SET_INPUT'; payload: string }
  | { type: 'SET_ANSWER'; payload: string }
  | { type: 'TRIGGER_EMERGENCY' }
  | { type: 'SET_AI_RESPONSE'; payload: Partial<ClinicalState> }
  | { type: 'COMPLETE_CONSULTATION'; payload: PillarData }
  | { type: 'GO_BACK' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_VIEW'; payload: AppView }
  | { type: 'RESET' };

const initialState: ClinicalState = {
  sessionId: crypto.randomUUID(),
  view: 'consult',
  soap: { S: {}, O: {}, A: {}, P: {} },
  ddx: [],
  status: 'idle',
  theme: 'dark',
  redFlag: false,
  pillars: null,
  currentQuestion: null,
  history: [],
  archives: [],
};

const ClinicalContext = createContext<{
  state: ClinicalState;
  dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

function clinicalReducer(state: ClinicalState, action: Action): ClinicalState {
  const pushHistory = (newState: ClinicalState): ClinicalState => {
    // Only push if status or question changed significantly to avoid infinite loops
    return { ...newState, history: [...state.history, state] };
  };

  switch (action.type) {
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' };
    
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    
    case 'GO_BACK': {
      if (state.history.length === 0 && state.status === 'idle') return state;
      
      const previous = state.history.length > 0 
        ? state.history[state.history.length - 1]
        : { ...initialState, archives: state.archives, theme: state.theme };

      return { 
        ...previous, 
        theme: state.theme,
        view: state.view,
        archives: state.archives,
        history: state.history.slice(0, -1)
      };
    }

    case 'START_INTAKE':
      return pushHistory({ ...state, status: 'intake', view: 'consult' });
    
    case 'SET_AI_RESPONSE':
      return pushHistory({ ...state, ...action.payload });
    
    case 'TRIGGER_EMERGENCY':
      return pushHistory({ ...state, status: 'emergency', redFlag: true });
    
    case 'COMPLETE_CONSULTATION':
      return pushHistory({ ...state, status: 'complete', pillars: action.payload });
    
    case 'RESET': {
      const isRecordable = state.status === 'complete' || state.status === 'emergency';
      const archivesUpdate = isRecordable ? [{
        id: state.sessionId,
        timestamp: Date.now(),
        diagnosis: state.pillars?.diagnosis || (state.redFlag ? 'Emergency Triage' : 'Incomplete'),
        status: state.status
      }, ...state.archives] : state.archives;

      return { 
        ...initialState, 
        sessionId: crypto.randomUUID(), 
        archives: archivesUpdate,
        theme: state.theme,
        view: 'consult'
      };
    }
    default:
      return state;
  }
}

export const ClinicalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(clinicalReducer, initialState, (initial) => {
    const saved = localStorage.getItem('dr_dyrane_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // Ensure properties exist to prevent crashes
        if (!parsed.archives) parsed.archives = [];
        if (!parsed.history) parsed.history = [];

        // Migration: transition old history to archives if needed
        if (parsed.history.length > 0 && !parsed.history[0].sessionId) {
            parsed.archives = [...parsed.history, ...parsed.archives];
            parsed.history = [];
        }
        return parsed;
      } catch (e) {
        return initial;
      }
    }
    return initial;
  });

  useEffect(() => {
    localStorage.setItem('dr_dyrane_session', JSON.stringify(state));
  }, [state]);

  return (
    <ClinicalContext.Provider value={{ state, dispatch }}>
      {children}
    </ClinicalContext.Provider>
  );
};

export const useClinical = () => {
  const context = useContext(ClinicalContext);
  if (!context) {
    throw new Error('useClinical must be used within a ClinicalProvider');
  }
  return context;
};
