import { ClinicalState } from '../types/clinical';
import {
  loadSessionEnvelope,
  persistSessionState,
} from './sessionStore';

interface SessionSyncDiff {
  changed_keys: string[];
  conversation_delta: number;
  ddx_changed: boolean;
}

interface SessionSyncMessage {
  type: 'persist' | 'noop';
  payload?: {
    state: ClinicalState;
    meta: {
      savedAt: number;
      revision: number;
      stateHash: string;
    };
    diff: SessionSyncDiff;
  };
}

interface SessionSyncOptions {
  onDiff?: (diff: SessionSyncDiff) => void;
}

let worker: Worker | null = null;
let throttleTimer: number | null = null;
let pendingState: ClinicalState | null = null;
let initialized = false;

const createWorker = (): Worker =>
  new Worker(new URL('../workers/sessionSync.worker.ts', import.meta.url), { type: 'module' });

const compactConversation = (conversation: ClinicalState['conversation']): ClinicalState['conversation'] => {
  const all = Array.isArray(conversation) ? conversation : [];
  if (all.length <= 140) return all;

  const firstPatientMessage = all.find((entry) => entry.role === 'patient');
  const tail = all.slice(-128);
  if (!firstPatientMessage) return tail;

  if (tail.some((entry) => entry.id === firstPatientMessage.id)) {
    return tail;
  }

  return [firstPatientMessage, ...tail].slice(-140);
};

const compactState = (state: ClinicalState): ClinicalState => ({
  ...state,
  history: [],
  archives: state.archives.slice(0, 80),
  conversation: compactConversation(state.conversation),
  notifications: state.notifications.slice(0, 80),
});

const persistWithFallback = (
  state: ClinicalState,
  meta?: { savedAt?: number; revision?: number; stateHash?: string }
): void => {
  try {
    persistSessionState(state, meta);
  } catch {
    persistSessionState(compactState(state), meta);
  }
};

const flushPendingState = (): void => {
  throttleTimer = null;
  const current = pendingState;
  pendingState = null;
  if (!current) return;

  if (!worker) {
    persistWithFallback(current);
    return;
  }

  worker.postMessage({
    type: 'sync',
    payload: { state: current },
  });
};

export const initSessionSyncWorker = (options?: SessionSyncOptions): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (!worker) {
    try {
      worker = createWorker();
    } catch {
      worker = null;
      initialized = true;
      return () => {};
    }
  }

  if (!initialized && worker) {
    const envelope = loadSessionEnvelope();
    worker.postMessage({
      type: 'init',
      payload: {
        revision: envelope?.revision || 0,
        stateHash: envelope?.stateHash || '',
      },
    });
    initialized = true;
  }

  if (worker) {
    worker.onmessage = (event: MessageEvent<SessionSyncMessage>) => {
      const message = event.data;
      if (!message || message.type !== 'persist' || !message.payload) return;
      const { state, meta, diff } = message.payload;
      persistWithFallback(state, meta);
      options?.onDiff?.(diff);
    };
  }

  return () => {
    if (throttleTimer !== null) {
      window.clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    pendingState = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
    initialized = false;
  };
};

export const queueSessionSync = (state: ClinicalState): void => {
  pendingState = state;
  if (throttleTimer !== null || typeof window === 'undefined') {
    return;
  }
  throttleTimer = window.setTimeout(flushPendingState, 120);
};
