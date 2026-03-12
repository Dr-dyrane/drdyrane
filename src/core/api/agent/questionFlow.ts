import { GatedQuestionSegment } from '../../types/clinical';

const FALLBACK_QUESTION = 'What symptom is bothering you the most right now?';
const LEADING_QUESTION_PATTERN =
  /^(who|what|when|where|why|how|is|are|do|did|have|has|can|could|would|will|should)\b/i;
const QUESTION_START_PATTERN =
  /\b(who|what|when|where|why|how|is|are|do|did|have|has|can|could|would|will|should)\b/i;
const CONNECTOR_SPLIT_PATTERN =
  /\s*(?:,|;)?\s+(?:and|also|plus)\s+(?=(?:are|is|do|did|have|has|can|could|would|will|should|what|when|where|which|why|how)\b)/gi;
const COMMA_SPLIT_PATTERN =
  /\s*,\s+(?=(?:are|is|do|did|have|has|can|could|would|will|should|what|when|where|which|why|how)\b)/gi;

export const getFallbackQuestion = (): string => FALLBACK_QUESTION;

const extractFocusedQuestion = (question: string): string => {
  const normalized = question.trim();
  if (!normalized.includes('?')) return normalized;

  if (LEADING_QUESTION_PATTERN.test(normalized)) {
    return normalized;
  }

  const matches = Array.from(
    normalized.matchAll(
      new RegExp(QUESTION_START_PATTERN.source, 'gi')
    )
  );
  if (matches.length === 0) return normalized;

  const questionMarkIndex = normalized.lastIndexOf('?');
  const validMatches = matches.filter((match) => (match.index ?? 0) < questionMarkIndex);
  const anchor = validMatches.length > 0 ? validMatches[validMatches.length - 1] : matches[0];
  const startIndex = anchor.index ?? 0;

  return normalized
    .slice(startIndex)
    .replace(/^(and|also|plus)\s+/i, '')
    .trim();
};

export const sanitizeQuestion = (rawQuestion: string): string => {
  const cleaned = (rawQuestion || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\?/g, '?')
    .trim();

  if (!cleaned) return '';

  const withoutUiArtifacts = cleaned
    .replace(/\bselect (one|an?) option[^.?!]*[.?!]?/gi, '')
    .replace(/\bor type your own answer[.?!]?/gi, '')
    .replace(/\bchoose from the options below[.?!]?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const focused = extractFocusedQuestion(withoutUiArtifacts);
  if (!focused) return '';

  if (focused.endsWith('?')) return focused;
  if (LEADING_QUESTION_PATTERN.test(focused)) {
    return `${focused}?`;
  }

  return focused;
};

export const extractQuestionFromContent = (content: string): string => {
  const normalized = (content || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const questionMatches = normalized.match(/[^?]+\?/g);
  if (!questionMatches || questionMatches.length === 0) return '';
  return questionMatches[questionMatches.length - 1].trim();
};

export const extractBundledSegments = (question: string): GatedQuestionSegment[] => {
  const cleaned = sanitizeQuestion(question);
  if (!cleaned) return [];

  const sentenceSegments = cleaned.match(/[^?]+\?/g)?.map((item) => item.trim()) || [];

  let rawSegments =
    sentenceSegments.length > 1
      ? sentenceSegments
      : cleaned
          .split(CONNECTOR_SPLIT_PATTERN)
          .map((item) => item.trim())
          .filter(Boolean);

  if (rawSegments.length <= 1 && cleaned.length > 135) {
    rawSegments = cleaned
      .split(COMMA_SPLIT_PATTERN)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const normalizedSegments = rawSegments
    .map((item) => sanitizeQuestion(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => (item.endsWith('?') ? item : `${item}?`));

  const dedup = normalizedSegments
    .map((item, idx) => ({ id: `segment-${idx + 1}`, prompt: item }))
    .filter(
      (segment, index, all) =>
        all.findIndex((other) => other.prompt.toLowerCase() === segment.prompt.toLowerCase()) ===
        index
    );

  if (dedup.length <= 1) return [];
  return dedup.slice(0, 4);
};
