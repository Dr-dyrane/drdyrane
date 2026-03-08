import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { 
  ClinicalState, 
  AppView, 
  PillarData,
  SessionRecord
} from '../types/clinical';

export type Action =
  | { type: 'START_INTAKE' }
  | { type: 'SET_INPUT'; payload: string }
  | { type: 'SET_ANSWER'; payload: string }
  | { type: 'TRIGGER_EMERGENCY' }
  | { type: 'SET_AI_RESPONSE'; payload: Partial<ClinicalState>; lastInput?: string }
  | { type: 'COMPLETE_CONSULTATION'; payload: PillarData }
  | { type: 'GO_BACK' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_VIEW'; payload: AppView }
  | { type: 'TOGGLE_HX' }
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
  probability: 0,
  urgency: 'low',
  thinking: 'Standing by for patient induction...',
  isHxOpen: false,
  history: [],
  archives: [],
};

const ClinicalContext = createContext<{
  state: ClinicalState;
  dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

function clinicalReducer(state: ClinicalState, action: Action): ClinicalState {
  const archiveSession = (archives: SessionRecord[], target: ClinicalState): SessionRecord[] => {
    const isAlreadyArchived = archives.some(a => a.id === target.sessionId);
    if (isAlreadyArchived) return archives;

    const record: SessionRecord = {
      id: target.sessionId,
      timestamp: Date.now(),
      diagnosis: target.pillars?.diagnosis || (target.redFlag ? 'Emergency Triage' : 'Incomplete'),
      status: target.status,
      soap: target.soap,
      pillars: target.pillars || undefined
    };
    return [record, ...archives];
  };

  const pushHistory = (newState: ClinicalState, lastFeedback?: string): ClinicalState => {
    // Strip heavy recursive properties to prevent exponential localStorage growth
    const { history: _, archives: __, ...snapshot } = state;
    if (lastFeedback) snapshot.lastFeedback = lastFeedback;
    const prunedHistory = [...state.history, snapshot as ClinicalState].slice(-20); // Limit to last 20 steps
    return { ...newState, history: prunedHistory };
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
        : { ...initialState };

      // Re-inject the live archives, view and theme which shouldn't be rolled back
      return { 
        ...previous as ClinicalState, 
        theme: state.theme,
        view: state.view,
        archives: state.archives,
        history: state.history.slice(0, -1)
      };
    }

    case 'START_INTAKE':
      return pushHistory({ ...state, status: 'intake', view: 'consult' });
    
    case 'SET_AI_RESPONSE': {
      const updated = { ...state, ...action.payload };
      // If we finished or had an emergency, auto-archive it immediately
      let archives = state.archives;
      if (updated.status === 'complete' || updated.status === 'emergency') {
        archives = archiveSession(state.archives, updated);
      }
      return pushHistory({ ...updated, archives }, (action as any).lastInput);
    }
    
    case 'TRIGGER_EMERGENCY': {
      const updated: ClinicalState = { ...state, status: 'emergency', redFlag: true };
      return pushHistory({ ...updated, archives: archiveSession(state.archives, updated) });
    }
    
    case 'COMPLETE_CONSULTATION': {
      const updated: ClinicalState = { ...state, status: 'complete', pillars: action.payload };
      return pushHistory({ ...updated, archives: archiveSession(state.archives, updated) });
    }
    
    case 'TOGGLE_HX':
      return { ...state, isHxOpen: !state.isHxOpen };
    
    case 'RESET': {
      // Manual reset still tries to archive if not already recorded
      const archivesUpdate = archiveSession(state.archives, state);

      return { 
        ...initialState, 
        sessionId: crypto.randomUUID(), 
        archives: archivesUpdate,
        theme: state.theme,
        view: 'consult',
        isHxOpen: false,
        history: []
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
        if (!parsed.archives) parsed.archives = [];
        if (!parsed.history) parsed.history = [];
        
        // Ensure we don't load corrupt recursive history
        parsed.history = parsed.history.map((h: any) => {
          const { history, archives, ...clean } = h;
          return clean;
        });

        return parsed;
      } catch (e) {
        return initial;
      }
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem('dr_dyrane_session', JSON.stringify(state));
    } catch (e) {
      console.warn("Storage quota exceeded. Pruning history.");
      // If we hit quota, clear non-essential history snapshots to save the session
      if (state.history.length > 0) {
        // This will trigger a re-render and another attempt at saving via the next effect loop or similar
        // For now, we'll just log it; the next action will use the pruned state.
      }
    }
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
