import type { ClinicalState } from '../types/clinical';

interface InitMessage {
  type: 'init';
  payload?: {
    revision?: number;
    stateHash?: string;
  };
}

interface SyncMessage {
  type: 'sync';
  payload: {
    state: ClinicalState;
  };
}

type WorkerMessage = InitMessage | SyncMessage;

interface StateDigest {
  status: string;
  view: string;
  ddx: string[];
  probability: number;
  urgency: string;
  conversation_count: number;
  last_doctor_question: string;
  question_gate: string;
  response_option_count: number;
  selected_option_count: number;
  agent_phase: string;
  profile_updated_at: number;
  archives_count: number;
  notifications_count: number;
}

interface SyncDiff {
  changed_keys: string[];
  conversation_delta: number;
  ddx_changed: boolean;
}

interface PersistMessage {
  type: 'persist';
  payload: {
    state: ClinicalState;
    meta: {
      savedAt: number;
      revision: number;
      stateHash: string;
    };
    diff: SyncDiff;
  };
}

interface NoopMessage {
  type: 'noop';
}

type WorkerResponse = PersistMessage | NoopMessage;

let revision = 0;
let lastHash = '';
let lastDigest: StateDigest | null = null;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',')}}`;
};

const hashString = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const summarizeState = (state: ClinicalState): StateDigest => {
  const conversation = Array.isArray(state.conversation) ? state.conversation : [];
  const lastDoctorQuestion = [...conversation]
    .reverse()
    .find((entry) => entry.role === 'doctor')?.metadata?.question;
  return {
    status: normalizeText(state.status),
    view: normalizeText(state.view),
    ddx: Array.isArray(state.ddx) ? state.ddx : [],
    probability: Number(state.probability) || 0,
    urgency: normalizeText(state.urgency),
    conversation_count: conversation.length,
    last_doctor_question: normalizeText(lastDoctorQuestion),
    question_gate: state.question_gate
      ? `${state.question_gate.kind || 'gate'}:${state.question_gate.current_index}`
      : 'none',
    response_option_count: state.response_options?.options?.length || 0,
    selected_option_count: state.selected_options?.length || 0,
    agent_phase: normalizeText(state.agent_state?.phase),
    profile_updated_at: Number(state.profile?.updated_at) || 0,
    archives_count: state.archives?.length || 0,
    notifications_count: state.notifications?.length || 0,
  };
};

const buildDiff = (previous: StateDigest | null, next: StateDigest): SyncDiff => {
  if (!previous) {
    return {
      changed_keys: Object.keys(next),
      conversation_delta: next.conversation_count,
      ddx_changed: next.ddx.length > 0,
    };
  }

  const changedKeys = Object.keys(next).filter((key) => {
    const previousValue = stableStringify(previous[key as keyof StateDigest]);
    const nextValue = stableStringify(next[key as keyof StateDigest]);
    return previousValue !== nextValue;
  });

  return {
    changed_keys: changedKeys,
    conversation_delta: next.conversation_count - previous.conversation_count,
    ddx_changed: stableStringify(previous.ddx) !== stableStringify(next.ddx),
  };
};

scope.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'init') {
    revision = Number(message.payload?.revision) || 0;
    lastHash = normalizeText(message.payload?.stateHash);
    return;
  }

  if (message.type !== 'sync') return;
  const state = message.payload?.state;
  if (!state) return;

  const serialized = stableStringify(state);
  const stateHash = hashString(serialized);
  if (stateHash === lastHash) {
    const response: WorkerResponse = { type: 'noop' };
    scope.postMessage(response);
    return;
  }

  const digest = summarizeState(state);
  const diff = buildDiff(lastDigest, digest);

  revision += 1;
  const response: WorkerResponse = {
    type: 'persist',
    payload: {
      state,
      meta: {
        savedAt: Date.now(),
        revision,
        stateHash,
      },
      diff,
    },
  };

  lastHash = stateHash;
  lastDigest = digest;
  scope.postMessage(response);
};

export {};
