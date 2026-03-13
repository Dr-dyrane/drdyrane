import { ConversationMessage } from '../../types/clinical';
import {
  extractQuestionFromContent,
  getFallbackQuestion,
  sanitizeQuestion,
} from './questionFlow';

const FILLER_STATEMENT_PATTERN = /^(noted|ok(?:ay)?|alright|understood)\.?$/i;

const normalizeStatement = (statement?: string): string | undefined => {
  const trimmed = (statement || '').trim();
  if (!trimmed) return undefined;
  const declarative = trimmed
    .replace(/\?+/g, '.')
    .replace(/\s+\./g, '.')
    .replace(/\.{2,}/g, '.')
    .trim();
  if (!declarative) return undefined;
  if (/[.!:;]$/.test(declarative)) return declarative;
  return `${declarative}.`;
};

export const createPatientMessage = (input: string): ConversationMessage => ({
  id: crypto.randomUUID(),
  role: 'patient',
  content: input,
  timestamp: Date.now(),
});

export const createDoctorMessage = (
  question: string,
  statement?: string
): ConversationMessage => {
  const sanitizedQuestion = sanitizeQuestion(question) || getFallbackQuestion();
  const normalizedStatement = normalizeStatement(statement);
  const statementForMessage =
    normalizedStatement && FILLER_STATEMENT_PATTERN.test(normalizedStatement)
      ? undefined
      : normalizedStatement;
  return {
    id: crypto.randomUUID(),
    role: 'doctor',
    content: [statementForMessage, sanitizedQuestion].filter(Boolean).join(' '),
    timestamp: Date.now(),
    metadata: {
      statement: statementForMessage,
      question: sanitizedQuestion,
    },
  };
};

export const buildDoctorMessageFromResult = (message: ConversationMessage): ConversationMessage => {
  const normalizedStatement = normalizeStatement(message.metadata?.statement);
  const statement =
    normalizedStatement && FILLER_STATEMENT_PATTERN.test(normalizedStatement)
      ? undefined
      : normalizedStatement;
  const candidateQuestion =
    message.metadata?.question?.trim() || extractQuestionFromContent(message.content);
  const question = sanitizeQuestion(candidateQuestion || getFallbackQuestion()) || getFallbackQuestion();

  return {
    ...message,
    id: message.id || crypto.randomUUID(),
    role: 'doctor',
    content: [statement, question].filter(Boolean).join(' '),
    metadata: {
      ...message.metadata,
      statement: statement || undefined,
      question,
    },
  };
};
