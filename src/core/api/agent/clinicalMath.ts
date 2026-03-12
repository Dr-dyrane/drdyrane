export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const normalizePercentage = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return clamp(Math.round(fallback), 0, 100);
  }

  if (parsed >= 0 && parsed <= 1) {
    return clamp(Math.round(parsed * 100), 0, 100);
  }

  return clamp(Math.round(parsed), 0, 100);
};
