import { ConversationMessage } from '../../types/clinical';
import {
  extractQuestionFromContent,
  getFallbackQuestion,
  sanitizeQuestion,
} from './questionFlow';

const normalizeStatement = (statement?: string): string | undefined => {
  const trimmed = (statement || '').trim();
  if (!trimmed) return undefined;
  if (/[.!?:;]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
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
  return {
    id: crypto.randomUUID(),
    role: 'doctor',
    content: [normalizedStatement, sanitizedQuestion].filter(Boolean).join(' '),
    timestamp: Date.now(),
    metadata: {
      statement: normalizedStatement,
      question: sanitizedQuestion,
    },
  };
};

export const buildDoctorMessageFromResult = (message: ConversationMessage): ConversationMessage => {
  const statement = normalizeStatement(message.metadata?.statement);
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
