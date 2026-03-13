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

const MAX_CONVERSATION_MESSAGES = 720;
const PRESERVED_CONVERSATION_HEAD = 64;

const getConversationEntryKey = (entry: ClinicalState['conversation'][number], index: number): string => {
  const id = (entry as { id?: unknown }).id;
  if (typeof id === 'string' && id.trim()) return id;
  return `${entry.role}:${entry.timestamp}:${entry.content.slice(0, 64)}:${index}`;
};

const compactConversation = (conversation: ClinicalState['conversation']): ClinicalState['conversation'] => {
  const all = Array.isArray(conversation) ? conversation : [];
  if (all.length <= MAX_CONVERSATION_MESSAGES) return all;

  const head = all.slice(0, Math.min(PRESERVED_CONVERSATION_HEAD, all.length));
  const tailBudget = Math.max(0, MAX_CONVERSATION_MESSAGES - head.length);
  const tail = all.slice(-tailBudget);
  const merged: ClinicalState['conversation'] = [];
  const seen = new Set<string>();

  for (let index = 0; index < head.length; index += 1) {
    const entry = head[index];
    const key = getConversationEntryKey(entry, index);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  for (let index = 0; index < tail.length; index += 1) {
    const entry = tail[index];
    const key = getConversationEntryKey(entry, head.length + index);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  if (merged.length <= MAX_CONVERSATION_MESSAGES) return merged;
  return merged.slice(-MAX_CONVERSATION_MESSAGES);
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
