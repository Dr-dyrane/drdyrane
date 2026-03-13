interface LaunchSpotlightState {
  dismissed_at?: number;
  updated_at: number;
}

const STORAGE_KEY = 'dr_dyrane.v1.launch_spotlight';

const defaultState = (): LaunchSpotlightState => ({
  updated_at: Date.now(),
});

export const loadLaunchSpotlightState = (): LaunchSpotlightState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<LaunchSpotlightState>;
    return {
      dismissed_at:
        typeof parsed.dismissed_at === 'number' ? parsed.dismissed_at : undefined,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : Date.now(),
    };
  } catch {
    return defaultState();
  }
};

export const markLaunchSpotlightDismissed = (): LaunchSpotlightState => {
  const next: LaunchSpotlightState = {
    dismissed_at: Date.now(),
    updated_at: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore persistence failure.
  }
  return next;
};

