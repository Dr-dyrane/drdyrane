interface CacheEntry<T> {
  value: T;
  created_at: number;
  expires_at: number;
}

interface PromptLogEntry {
  kind: 'conversation' | 'options';
  key: string;
  at: number;
}

const CACHE_KEY = 'dr_dyrane.v1.prompt_cache';
const PROMPT_LOG_KEY = 'dr_dyrane.v1.prompt_log';
const MAX_LOG_ITEMS = 240;

const readCache = (): Record<string, CacheEntry<unknown>> => {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, CacheEntry<unknown>>) => {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

export const getPromptCache = <T>(cacheKey: string): T | null => {
  const cache = readCache();
  const entry = cache[cacheKey] as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expires_at) {
    delete cache[cacheKey];
    writeCache(cache);
    return null;
  }
  return entry.value;
};

export const setPromptCache = <T>(cacheKey: string, value: T, ttlMs: number): void => {
  const cache = readCache();
  cache[cacheKey] = {
    value,
    created_at: Date.now(),
    expires_at: Date.now() + ttlMs,
  };
  writeCache(cache);
};

export const recordPromptUsage = (kind: PromptLogEntry['kind'], key: string): void => {
  const raw = localStorage.getItem(PROMPT_LOG_KEY);
  const list: PromptLogEntry[] = raw ? (JSON.parse(raw) as PromptLogEntry[]) : [];
  list.unshift({ kind, key, at: Date.now() });
  localStorage.setItem(PROMPT_LOG_KEY, JSON.stringify(list.slice(0, MAX_LOG_ITEMS)));
};
