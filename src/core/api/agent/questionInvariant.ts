const INTERROGATIVE_START_PATTERN =
  /^(is|are|do|did|have|has|can|could|will|would|should|what|which|when|where|who|whom|whose|why|how|any)\b/i;

const cleanPrompt = (prompt: string): string =>
  String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeSingleQuestionPrompt = (prompt: string): string => {
  const normalized = cleanPrompt(prompt);
  if (!normalized) return '';

  const firstQuestionIndex = normalized.indexOf('?');
  if (firstQuestionIndex < 0) {
    const stripped = normalized.replace(/[.!;:,]+$/g, '').trim();
    if (!stripped) return '';
    if (INTERROGATIVE_START_PATTERN.test(stripped)) {
      return `${stripped}?`;
    }
    return '';
  }

  const uptoFirstQuestion = normalized.slice(0, firstQuestionIndex + 1);
  const sentenceBoundary = Math.max(
    uptoFirstQuestion.lastIndexOf('.'),
    uptoFirstQuestion.lastIndexOf('!')
  );
  const candidate = uptoFirstQuestion
    .slice(sentenceBoundary + 1)
    .replace(/\s+/g, ' ')
    .trim();

  if (!candidate) return '';
  return candidate.endsWith('?') ? candidate : `${candidate}?`;
};

export const hasSingleQuestionPrompt = (prompt: string): boolean => {
  const normalized = cleanPrompt(prompt);
  if (!normalized) return false;
  const marks = normalized.match(/\?/g) || [];
  return marks.length === 1 && normalized.endsWith('?');
};

