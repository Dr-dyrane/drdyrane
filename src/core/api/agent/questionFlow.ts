import { GatedQuestionSegment } from '../../types/clinical';

const FALLBACK_QUESTION = 'What symptom is bothering you the most right now?';
const LEADING_QUESTION_PATTERN =
  /^(who|what|when|where|why|how|is|are|do|did|have|has|can|could|would|will|should)\b/i;
const QUESTION_START_PATTERN =
  /\b(who|what|when|where|why|how|is|are|do|did|have|has|can|could|would|will|should)\b/i;

export const getFallbackQuestion = (): string => FALLBACK_QUESTION;

const extractFocusedQuestion = (question: string): string => {
  const normalized = question.trim();
  if (!normalized.includes('?')) return normalized;

  if (LEADING_QUESTION_PATTERN.test(normalized)) {
    return normalized;
  }

  const clauseStartMatch = [...normalized.matchAll(/(?:^|[.?!]\s+)(who|what|when|where|why|how|is|are|do|did|have|has|can|could|would|will|should)\b/gi)];
  if (clauseStartMatch.length > 0) {
    const lastClause = clauseStartMatch[clauseStartMatch.length - 1];
    const keyword = lastClause[1];
    const clauseStartIndex = lastClause.index ?? 0;
    const fullMatch = lastClause[0] || '';
    const keywordOffset = fullMatch.toLowerCase().lastIndexOf(keyword.toLowerCase());
    const keywordIndex = clauseStartIndex + Math.max(0, keywordOffset);
    if (keywordIndex >= 0) {
      return normalized.slice(keywordIndex).trim();
    }
  }

  const matches = Array.from(
    normalized.matchAll(
      new RegExp(QUESTION_START_PATTERN.source, 'gi')
    )
  );
  if (matches.length === 0) return normalized;

  const questionMarkIndex = normalized.lastIndexOf('?');
  const validMatches = matches.filter((match) => (match.index ?? 0) < questionMarkIndex);
  const anchor = validMatches.length > 0 ? validMatches[0] : matches[0];
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

  // Product rule: always deliver exactly one direct question at a time.
  const singleQuestion =
    focused.match(/[^?]+\?/)?.[0]?.trim() ||
    focused.split('?')[0].trim();

  if (!singleQuestion) return '';

  if (singleQuestion.endsWith('?')) return singleQuestion;
  if (LEADING_QUESTION_PATTERN.test(singleQuestion)) {
    return `${singleQuestion}?`;
  }

  return singleQuestion;
};

export const extractQuestionFromContent = (content: string): string => {
  const normalized = (content || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const questionMatches = normalized.match(/[^?]+\?/g);
  if (!questionMatches || questionMatches.length === 0) return '';
  return questionMatches[questionMatches.length - 1].trim();
};

export const extractBundledSegments = (question: string): GatedQuestionSegment[] => {
  void question;
  return [];
};
