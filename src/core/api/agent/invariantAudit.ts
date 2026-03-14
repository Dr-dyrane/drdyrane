export type InvariantEventType =
  | 'duplicate_question_blocked'
  | 'single_question_enforced'
  | 'intent_repeat_blocked'
  | 'intent_progression_corrected'
  | 'gate_progress_preserved'
  | 'conversation_regression_blocked'
  | 'gate_dropped_chat_first'
  | 'option_contract_enforced'
  | 'option_contract_failed'
  | 'options_corrected'
  | 'selections_cleared';

export interface InvariantAuditEvent {
  id: string;
  type: InvariantEventType;
  timestamp: number;
  detail?: string;
}

export interface InvariantAuditSnapshot {
  counts: Record<InvariantEventType, number>;
  total: number;
  last_timestamp?: number;
  events: InvariantAuditEvent[];
}

const MAX_AUDIT_EVENTS = 80;

const createEmptyCounts = (): Record<InvariantEventType, number> => ({
  duplicate_question_blocked: 0,
  single_question_enforced: 0,
  intent_repeat_blocked: 0,
  intent_progression_corrected: 0,
  gate_progress_preserved: 0,
  conversation_regression_blocked: 0,
  gate_dropped_chat_first: 0,
  option_contract_enforced: 0,
  option_contract_failed: 0,
  options_corrected: 0,
  selections_cleared: 0,
});

const state: InvariantAuditSnapshot = {
  counts: createEmptyCounts(),
  total: 0,
  events: [],
};

const cloneSnapshot = (): InvariantAuditSnapshot => ({
  counts: { ...state.counts },
  total: state.total,
  last_timestamp: state.last_timestamp,
  events: state.events.map((event) => ({ ...event })),
});

const exposeAuditDebugHandle = (): void => {
  if (typeof window === 'undefined') return;
  const host = window as Window & {
    __drDyraneInvariantAudit?: {
      getSnapshot: () => InvariantAuditSnapshot;
      reset: () => void;
    };
  };
  host.__drDyraneInvariantAudit = {
    getSnapshot: cloneSnapshot,
    reset: () => resetInvariantAudit(),
  };
};

export const recordInvariantEvent = (
  type: InvariantEventType,
  detail?: string
): void => {
  const now = Date.now();
  state.counts[type] += 1;
  state.total += 1;
  state.last_timestamp = now;
  state.events = [
    {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: now,
      detail: detail?.trim() || undefined,
    },
    ...state.events,
  ].slice(0, MAX_AUDIT_EVENTS);
};

export const getInvariantAuditSnapshot = (): InvariantAuditSnapshot => cloneSnapshot();

export const resetInvariantAudit = (): void => {
  state.counts = createEmptyCounts();
  state.total = 0;
  state.last_timestamp = undefined;
  state.events = [];
};

exposeAuditDebugHandle();
