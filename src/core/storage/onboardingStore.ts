interface PersistedOnboardingState {
  completed: boolean;
  last_prompted_at?: number;
  updated_at: number;
}

const ONBOARDING_STORAGE_KEY = 'dr_dyrane.v1.onboarding_state';

const defaultState = (): PersistedOnboardingState => ({
  completed: false,
  updated_at: Date.now(),
});

export const loadOnboardingState = (): PersistedOnboardingState => {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PersistedOnboardingState>;
    return {
      completed: Boolean(parsed.completed),
      last_prompted_at:
        typeof parsed.last_prompted_at === 'number' ? parsed.last_prompted_at : undefined,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : Date.now(),
    };
  } catch {
    return defaultState();
  }
};

export const saveOnboardingState = (state: PersistedOnboardingState): void => {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore persistence failure.
  }
};

export const syncOnboardingCompletion = (completed: boolean): PersistedOnboardingState => {
  const current = loadOnboardingState();
  const next: PersistedOnboardingState = {
    ...current,
    completed,
    updated_at: Date.now(),
  };
  saveOnboardingState(next);
  return next;
};

export const markOnboardingPrompted = (): PersistedOnboardingState => {
  const current = loadOnboardingState();
  const next: PersistedOnboardingState = {
    ...current,
    completed: false,
    last_prompted_at: Date.now(),
    updated_at: Date.now(),
  };
  saveOnboardingState(next);
  return next;
};

