import { ResponseOptions } from '../../types/clinical';

const SCALE_RANGE_PATTERN = /(?:scale(?:\s+of)?|rate|rating|score)?[^0-9]{0,20}(\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2})(?:\s*-\s*)?/i;
const MALFORMED_SCALE_PATTERN = /(?:scale(?:\s+of)?|rate|rating|score)[^0-9]{0,20}(\d{1,2})\s*-\s*(\d{1,2})\s*-/i;
const SCALE_KEYWORD_PATTERN = /\b(on a scale|scale of|rate|rating|score|severity|intensity|worst|best)\b/i;
const SCALE_QUESTION_PATTERN = /\b(?:how would you rate|rate your|rate the|what score|score from)\b/i;

const toFiniteInteger = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
};

const normalizeRange = (min: number, max: number): { min: number; max: number } | null => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  if (lower < 0 || upper > 20 || lower === upper) return null;
  return { min: lower, max: upper };
};

export const parseScaleRange = (question: string): { min: number; max: number } | null => {
  const normalized = (question || '').toLowerCase();
  if (!normalized) return null;

  const malformed = normalized.match(MALFORMED_SCALE_PATTERN);
  if (malformed) {
    const left = toFiniteInteger(malformed[1]);
    const right = toFiniteInteger(malformed[2]);
    if (left !== null && right !== null) {
      return normalizeRange(left, right);
    }
  }

  const standard = normalized.match(SCALE_RANGE_PATTERN);
  if (!standard) return null;
  const min = toFiniteInteger(standard[1]);
  const max = toFiniteInteger(standard[2]);
  if (min === null || max === null) return null;
  return normalizeRange(min, max);
};

export const isScaleIntentQuestion = (question: string): boolean => {
  const normalized = (question || '').toLowerCase();
  if (!normalized) return false;
  if (parseScaleRange(normalized)) return true;
  return SCALE_KEYWORD_PATTERN.test(normalized) || SCALE_QUESTION_PATTERN.test(normalized);
};

export const buildNumericScaleOptions = (
  min: number,
  max: number
): ResponseOptions['options'] => {
  const range = normalizeRange(min, max);
  const resolved = range || { min: 1, max: 10 };
  const total = Math.min(12, resolved.max - resolved.min + 1);
  const start = resolved.max - total + 1;

  return Array.from({ length: total }, (_, index) => {
    const value = start + index;
    return {
      id: `scale-${value}`,
      text: String(value),
      category: 'severity',
      priority: total - index,
    };
  });
};

export const isNumericScaleOptionSet = (options: ResponseOptions['options']): boolean => {
  if (!options || options.length < 4) return false;
  return options.every((option) => /^-?\d+$/.test(option.text.trim()));
};
