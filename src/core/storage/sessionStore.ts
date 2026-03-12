import { ClinicalState } from '../types/clinical';

export interface PersistedSessionEnvelope {
  version: number;
  savedAt: number;
  revision?: number;
  stateHash?: string;
  state: ClinicalState;
}

interface PersistSessionMeta {
  savedAt?: number;
  revision?: number;
  stateHash?: string;
}

const SESSION_STORAGE_KEY = 'dr_dyrane.v2.session';
const LEGACY_SESSION_STORAGE_KEYS = ['dr_dyrane_session'];
const STORAGE_VERSION = 2;

const parseSession = (raw: string): ClinicalState | null => {
  try {
    const parsed = JSON.parse(raw) as PersistedSessionEnvelope | ClinicalState;
    if ((parsed as PersistedSessionEnvelope).state) {
      const envelope = parsed as PersistedSessionEnvelope;
      if (envelope.version <= STORAGE_VERSION) {
        return envelope.state;
      }
      return null;
    }
    return parsed as ClinicalState;
  } catch {
    return null;
  }
};

export const loadSessionState = (): ClinicalState | null => {
  const primary = localStorage.getItem(SESSION_STORAGE_KEY);
  if (primary) {
    return parseSession(primary);
  }

  for (const legacyKey of LEGACY_SESSION_STORAGE_KEYS) {
    const legacy = localStorage.getItem(legacyKey);
    if (!legacy) continue;
    const session = parseSession(legacy);
    if (session) {
      persistSessionState(session);
      localStorage.removeItem(legacyKey);
      return session;
    }
  }

  return null;
};

export const loadSessionEnvelope = (): PersistedSessionEnvelope | null => {
  const primary = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!primary) return null;
  try {
    const parsed = JSON.parse(primary) as PersistedSessionEnvelope | ClinicalState;
    if ((parsed as PersistedSessionEnvelope).state) {
      const envelope = parsed as PersistedSessionEnvelope;
      if (envelope.version <= STORAGE_VERSION) {
        return envelope;
      }
      return null;
    }

    return {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      state: parsed as ClinicalState,
    };
  } catch {
    return null;
  }
};

export const persistSessionState = (
  state: ClinicalState,
  meta?: PersistSessionMeta
): void => {
  const envelope: PersistedSessionEnvelope = {
    version: STORAGE_VERSION,
    savedAt: meta?.savedAt || Date.now(),
    revision: meta?.revision,
    stateHash: meta?.stateHash,
    state,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(envelope));
};

export const clearSessionState = (): void => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  for (const legacyKey of LEGACY_SESSION_STORAGE_KEYS) {
    localStorage.removeItem(legacyKey);
  }
};
