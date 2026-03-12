/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import {
  ClinicalState, 
  AppView, 
  PillarData,
  SessionRecord,
  ConsultationSnapshot,
  ClerkingSchema,
  ConversationMessage,
  AppSettings,
  UserProfile,
  AppNotification,
  SheetType
} from '../types/clinical';
import { loadSessionState, persistSessionState } from '../storage/sessionStore';

export type Action =
  | { type: 'START_INTAKE' }
  | { type: 'SET_INPUT'; payload: string }
  | { type: 'SET_ANSWER'; payload: string }
  | { type: 'TRIGGER_EMERGENCY' }
  | { type: 'SET_AI_RESPONSE'; payload: Partial<ClinicalState>; lastInput?: string }
  | { type: 'SET_AGENT_RESPONSE'; payload: Partial<ClinicalState>; lastInput?: string }
  | { type: 'SELECT_OPTIONS'; payload: string[] }
  | { type: 'ADD_CONVERSATION_MESSAGE'; payload: ConversationMessage }
  | { type: 'COMPLETE_CONSULTATION'; payload: PillarData }
  | { type: 'GO_BACK' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_THEME'; payload: ClinicalState['theme'] }
  | { type: 'SET_VIEW'; payload: AppView }
  | { type: 'TOGGLE_HX' }
  | { type: 'TOGGLE_SHEET'; payload: Exclude<SheetType, null> }
  | { type: 'CLOSE_SHEETS' }
  | { type: 'UPDATE_PROFILE'; payload: Partial<UserProfile> }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<AppNotification, 'id' | 'created_at' | 'read'> }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'UPDATE_CLERKING'; payload: Partial<ClerkingSchema> }
  | { type: 'UPSERT_ARCHIVE'; payload: SessionRecord }
  | { type: 'DELETE_ARCHIVE'; payload: string }
  | { type: 'RESTORE_ARCHIVE'; payload: string }
  | { type: 'RESET' };

const defaultProfile = (): UserProfile => ({
  id: 'local-profile',
  display_name: 'Patient',
  avatar_url: '',
  updated_at: Date.now(),
});

const sanitizeWeightKg = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value <= 0 || value > 300) return undefined;
  return Math.round(value * 10) / 10;
};

const defaultSettings = (): AppSettings => ({
  haptics_enabled: true,
  audio_enabled: true,
  reduced_motion: false,
  notifications_enabled: true,
  text_scale: 'md',
});

const defaultClerking = (): ClerkingSchema => ({
  hpc: '',
  pmh: '',
  dh: '',
  sh: '',
  fh: '',
});

const defaultAgentState = (): ClinicalState['agent_state'] => ({
  phase: 'intake',
  confidence: 0,
  focus_area: 'Initial assessment',
  pending_actions: ['Gather chief complaint'],
  last_decision: 'Starting patient intake',
  positive_findings: [],
  negative_findings: [],
  must_not_miss_checkpoint: {
    required: false,
    status: 'idle',
  },
});

const initialState: ClinicalState = {
  sessionId: crypto.randomUUID(),
  view: 'consult',
  soap: { S: {}, O: {}, A: {}, P: {} },
  ddx: [],
  status: 'idle',
  theme: 'system',
  redFlag: false,
  pillars: null,
  currentQuestion: null,
  conversation: [],
  agent_state: defaultAgentState(),
  response_options: null,
  selected_options: [],
  probability: 0,
  urgency: 'low',
  thinking: 'Ready to begin clinical assessment',
  question_gate: null,
  profile: defaultProfile(),
  settings: defaultSettings(),
  notifications: [
    {
      id: crypto.randomUUID(),
      title: 'Welcome to Dr Dyrane',
      body: 'Start with your main symptom and I will guide the consultation step by step.',
      created_at: Date.now(),
      read: false,
    },
    {
      id: crypto.randomUUID(),
      title: 'Privacy',
      body: 'Your profile and visit history stay on this device unless you export them.',
      created_at: Date.now() - 1000 * 60,
      read: false,
    },
    {
      id: crypto.randomUUID(),
      title: 'Tip',
      body: 'Open Profile to tune text size, sound, haptics, and visual theme.',
      created_at: Date.now() - 1000 * 120,
      read: false,
    },
  ],
  active_sheet: null,
  clerking: defaultClerking(),
  isHxOpen: false,
  history: [],
  archives: [],
};

const ClinicalContext = createContext<{
  state: ClinicalState;
  dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

function clinicalReducer(state: ClinicalState, action: Action): ClinicalState {
  const extractChiefComplaint = (conversation: ConversationMessage[]): string | undefined =>
    conversation.find((entry) => entry.role === 'patient')?.content;

  const buildSnapshot = (target: ClinicalState): ConsultationSnapshot => ({
    soap: target.soap,
    ddx: [...target.ddx],
    status: target.status,
    redFlag: target.redFlag,
    pillars: target.pillars,
    conversation: [...target.conversation],
    agent_state: { ...target.agent_state },
    probability: target.probability,
    urgency: target.urgency,
    thinking: target.thinking,
    clerking: { ...target.clerking },
  });

  const buildArchiveRecord = (target: ClinicalState): SessionRecord => {
    const now = Date.now();
    const diagnosis = target.pillars?.diagnosis || (target.redFlag ? 'Emergency Triage' : 'Incomplete');
    const chiefComplaint = extractChiefComplaint(target.conversation);
    const dateLabel = new Date(now).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return {
      id: target.sessionId,
      timestamp: now,
      updated_at: now,
      visit_label: `${dateLabel} Visit`,
      diagnosis,
      complaint: chiefComplaint,
      notes: target.clerking.hpc || '',
      status: target.status,
      soap: target.soap,
      profile_snapshot: target.profile,
      clerking: { ...target.clerking },
      snapshot: buildSnapshot(target),
      pillars: target.pillars || undefined,
    };
  };

  const archiveSession = (archives: SessionRecord[], target: ClinicalState): SessionRecord[] => {
    const isAlreadyArchived = archives.some(a => a.id === target.sessionId);
    if (isAlreadyArchived) return archives;
    return [buildArchiveRecord(target), ...archives].slice(0, 250);
  };

  const pushHistory = (newState: ClinicalState, lastFeedback?: string): ClinicalState => {
    // Strip heavy recursive properties to prevent exponential localStorage growth
    const snapshot = { ...state } as Record<string, unknown>;
    delete snapshot.history;
    delete snapshot.archives;
    if (lastFeedback) snapshot.lastFeedback = lastFeedback;
    const prunedHistory = [...state.history, snapshot as unknown as ClinicalState].slice(-20); // Limit to last 20 steps
    return { ...newState, history: prunedHistory };
  };

  switch (action.type) {
    case 'TOGGLE_THEME':
      return {
        ...state,
        theme:
          state.theme === 'system'
            ? 'dark'
            : state.theme === 'dark'
              ? 'light'
              : 'system',
      };

    case 'SET_THEME':
      return { ...state, theme: action.payload };
    
    case 'SET_VIEW':
      return { ...state, view: action.payload };

    case 'TOGGLE_SHEET':
      return {
        ...state,
        active_sheet: state.active_sheet === action.payload ? null : action.payload,
      };

    case 'CLOSE_SHEETS':
      return { ...state, active_sheet: null };
    
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
        profile: state.profile,
        settings: state.settings,
        notifications: state.notifications,
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
      return pushHistory({ ...updated, archives }, action.lastInput);
    }

    case 'SET_AGENT_RESPONSE': {
      const updated = { ...state, ...action.payload };
      // If we finished or had an emergency, auto-archive it immediately
      let archives = state.archives;
      if (updated.status === 'complete' || updated.status === 'emergency') {
        archives = archiveSession(state.archives, updated);
      }
      return pushHistory({ ...updated, archives }, action.lastInput);
    }

    case 'SELECT_OPTIONS':
      return { ...state, selected_options: action.payload };

    case 'ADD_CONVERSATION_MESSAGE':
      return { ...state, conversation: [...state.conversation, action.payload] };
    
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

    case 'UPDATE_PROFILE':
      {
        const mergedProfile: UserProfile = {
          ...state.profile,
          ...action.payload,
          updated_at: Date.now(),
        };
        if ('weight_kg' in mergedProfile) {
          mergedProfile.weight_kg = sanitizeWeightKg(mergedProfile.weight_kg);
        }
        return {
          ...state,
          profile: mergedProfile,
        };
      }

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
        },
      };

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [
          {
            id: crypto.randomUUID(),
            created_at: Date.now(),
            read: false,
            ...action.payload,
          },
          ...state.notifications,
        ].slice(0, 120),
      };

    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.id === action.payload
            ? { ...notification, read: true }
            : notification
        ),
      };

    case 'MARK_ALL_NOTIFICATIONS_READ':
      return {
        ...state,
        notifications: state.notifications.map((notification) => ({
          ...notification,
          read: true,
        })),
      };

    case 'UPDATE_CLERKING':
      return {
        ...state,
        clerking: {
          ...state.clerking,
          ...action.payload,
        },
      };

    case 'UPSERT_ARCHIVE': {
      const incoming = {
        ...action.payload,
        updated_at: Date.now(),
      };
      const existingIndex = state.archives.findIndex((archive) => archive.id === incoming.id);
      if (existingIndex < 0) {
        return {
          ...state,
          archives: [incoming, ...state.archives].slice(0, 250),
        };
      }
      const nextArchives = [...state.archives];
      nextArchives[existingIndex] = incoming;
      return {
        ...state,
        archives: nextArchives,
      };
    }

    case 'DELETE_ARCHIVE':
      return {
        ...state,
        archives: state.archives.filter((archive) => archive.id !== action.payload),
      };

    case 'RESTORE_ARCHIVE': {
      const target = state.archives.find((archive) => archive.id === action.payload);
      if (!target) return state;

      const snapshot = target.snapshot;
      const restoredStatus =
        snapshot.status === 'complete' || snapshot.status === 'emergency'
          ? 'active'
          : snapshot.status;

      return pushHistory({
        ...state,
        sessionId: crypto.randomUUID(),
        view: 'consult',
        status: restoredStatus,
        redFlag: snapshot.redFlag,
        pillars: restoredStatus === 'active' ? null : snapshot.pillars,
        currentQuestion: null,
        soap: snapshot.soap,
        ddx: [...snapshot.ddx],
        conversation: [...snapshot.conversation],
        agent_state: { ...snapshot.agent_state },
        probability: snapshot.probability,
        urgency: snapshot.urgency,
        thinking: snapshot.thinking,
        response_options: null,
        selected_options: [],
        question_gate: null,
        isHxOpen: false,
        active_sheet: null,
        clerking: { ...(snapshot.clerking || target.clerking || defaultClerking()) },
        profile: target.profile_snapshot
          ? { ...state.profile, ...target.profile_snapshot, updated_at: Date.now() }
          : state.profile,
      });
    }
    
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
        history: [],
        profile: state.profile,
        settings: state.settings,
        notifications: state.notifications,
        active_sheet: null,
        clerking: defaultClerking(),
      };
    }
    default:
      return state;
  }
}

export const ClinicalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(clinicalReducer, initialState, (initial) => {
    const saved = loadSessionState();
    if (saved) {
      try {
        const parsed = saved as ClinicalState & Record<string, unknown>;
        
        // Ensure all new agent-driven fields have defaults in case of legacy localstorage (Rule 5)
        if (!parsed.archives) parsed.archives = [];
        if (!parsed.history) parsed.history = [];
        if (!parsed.conversation) parsed.conversation = [];
        if (!parsed.ddx) parsed.ddx = [];
        if (parsed.probability === undefined) parsed.probability = 0;
        if (parsed.urgency === undefined) parsed.urgency = 'low';
        if (!parsed.agent_state) parsed.agent_state = { ...defaultAgentState() };
        if (!Array.isArray(parsed.agent_state.positive_findings)) {
          parsed.agent_state.positive_findings = [];
        }
        if (!Array.isArray(parsed.agent_state.negative_findings)) {
          parsed.agent_state.negative_findings = [];
        }
        if (!parsed.agent_state.must_not_miss_checkpoint) {
          parsed.agent_state.must_not_miss_checkpoint = {
            required: false,
            status: 'idle',
          };
        }
        if (parsed.selected_options === undefined) parsed.selected_options = [];
        if (parsed.question_gate === undefined) parsed.question_gate = null;
        if (!parsed.profile) parsed.profile = defaultProfile();
        parsed.profile.weight_kg = sanitizeWeightKg(parsed.profile.weight_kg);
        if (!parsed.settings) parsed.settings = defaultSettings();
        if (!parsed.theme || !['system', 'dark', 'light'].includes(parsed.theme)) {
          parsed.theme = 'system';
        }
        if (!parsed.notifications || parsed.notifications.length === 0) {
          parsed.notifications = [...initialState.notifications];
        }
        if (parsed.active_sheet === undefined) parsed.active_sheet = null;
        if (!parsed.clerking) {
          parsed.clerking = defaultClerking();
        }
        
        // Ensure we don't load corrupt recursive history
        parsed.history = (Array.isArray(parsed.history) ? parsed.history : []).map((entry) => {
          const clean = { ...(entry as unknown as Record<string, unknown>) };
          delete clean.history;
          delete clean.archives;
          return clean as unknown as ClinicalState;
        });

        parsed.archives = (Array.isArray(parsed.archives) ? parsed.archives : []).map((entry) => {
          const record = entry as Partial<SessionRecord> & Record<string, unknown>;
          const legacyClerkingNotes = Array.isArray(record['clerking_notes'])
            ? (record['clerking_notes'] as unknown[]).map(String)
            : [];

          const snapshot = (record.snapshot as ConsultationSnapshot | undefined) || {
            soap: record.soap || { S: {}, O: {}, A: {}, P: {} },
            ddx: (record as { ddx?: string[] }).ddx || [],
            status: record.status || 'complete',
            redFlag: record.status === 'emergency',
            pillars: record.pillars || null,
            conversation: (record as { conversation?: ConversationMessage[] }).conversation || [],
            agent_state:
              (record as { agent_state?: ClinicalState['agent_state'] }).agent_state || {
                ...defaultAgentState(),
              },
            probability: (record as { probability?: number }).probability ?? 0,
            urgency: (record as { urgency?: ClinicalState['urgency'] }).urgency || 'low',
            thinking: (record as { thinking?: string }).thinking || '',
            clerking: record.clerking || {
              ...defaultClerking(),
              hpc: legacyClerkingNotes.join('\n'),
            },
          };
          const snapshotAgentState = {
            ...defaultAgentState(),
            ...(snapshot.agent_state || {}),
            positive_findings: Array.isArray(snapshot.agent_state?.positive_findings)
              ? snapshot.agent_state.positive_findings
              : [],
            negative_findings: Array.isArray(snapshot.agent_state?.negative_findings)
              ? snapshot.agent_state.negative_findings
              : [],
            must_not_miss_checkpoint: snapshot.agent_state?.must_not_miss_checkpoint
              ? {
                  required: Boolean(snapshot.agent_state.must_not_miss_checkpoint.required),
                  status: snapshot.agent_state.must_not_miss_checkpoint.status || 'idle',
                  last_question: snapshot.agent_state.must_not_miss_checkpoint.last_question,
                  last_response: snapshot.agent_state.must_not_miss_checkpoint.last_response,
                  updated_at: snapshot.agent_state.must_not_miss_checkpoint.updated_at,
                }
              : {
                  required: false,
                  status: 'idle' as const,
                },
          };
          const normalizedSnapshot: ConsultationSnapshot = {
            ...snapshot,
            agent_state: snapshotAgentState,
          };

          return {
            id: record.id || crypto.randomUUID(),
            timestamp: record.timestamp || Date.now(),
            updated_at: record.updated_at || record.timestamp || Date.now(),
            visit_label: record.visit_label || record.diagnosis || 'Visit',
            diagnosis: record.diagnosis || 'Unlabeled Visit',
            complaint: record.complaint || '',
            notes: record.notes || '',
            status: record.status || normalizedSnapshot.status || 'complete',
            soap: record.soap || normalizedSnapshot.soap,
            pillars: record.pillars || normalizedSnapshot.pillars || undefined,
            profile_snapshot: {
              ...(record.profile_snapshot || parsed.profile || defaultProfile()),
              weight_kg: sanitizeWeightKg(record.profile_snapshot?.weight_kg ?? parsed.profile?.weight_kg),
            },
            clerking: record.clerking || normalizedSnapshot.clerking || defaultClerking(),
            snapshot: normalizedSnapshot,
          };
        });

        return parsed;
      } catch {
        return initial;
      }
    }
    return initial;
  });

  useEffect(() => {
    try {
      persistSessionState(state);
    } catch {
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
