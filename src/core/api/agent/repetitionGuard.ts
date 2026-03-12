import { ConversationMessage, AgentState } from '../../types/clinical';

const QUESTION_NORMALIZE_PATTERN = /[^a-z0-9]+/gi;
const TOPIC_DEFINITIONS: Array<{ topic: string; questionPattern: RegExp; patientPattern: RegExp }> = [
  {
    topic: 'fever',
    questionPattern: /\bfever|hot and cold|chills?\b/i,
    patientPattern: /\bfever|hot and cold|chills?|temperature\b/i,
  },
  {
    topic: 'vomiting',
    questionPattern: /\bvomit|throwing up|nausea\b/i,
    patientPattern: /\bvomit|throwing up|nausea\b/i,
  },
  {
    topic: 'diarrhea',
    questionPattern: /\bdiarrh|bowel movement|loose stool\b/i,
    patientPattern: /\bdiarrh|bowel movement|loose stool\b/i,
  },
  {
    topic: 'cough',
    questionPattern: /\bcough|phlegm|sputum\b/i,
    patientPattern: /\bcough|phlegm|sputum\b/i,
  },
  {
    topic: 'pain',
    questionPattern: /\bpain|ache\b/i,
    patientPattern: /\bpain|ache\b/i,
  },
];

const PHASE_FALLBACKS: Record<AgentState['phase'], string[]> = {
  intake: [
    'What symptom is bothering you most right now?',
    'When did this symptom begin?',
  ],
  assessment: [
    'How severe is this symptom right now?',
    'What makes it worse or better?',
  ],
  differential: [
    'Which associated symptom stands out the most?',
    'Have your symptoms changed since they started?',
  ],
  resolution: [
    'What is your biggest concern right now?',
    'Are you able to keep up with normal daily activity?',
  ],
  followup: [
    'What changed since your last update?',
    'Do you feel better, worse, or unchanged overall?',
  ],
};

export const normalizeQuestionKey = (value: string): string =>
  (value || '')
    .toLowerCase()
    .replace(QUESTION_NORMALIZE_PATTERN, ' ')
    .trim()
    .slice(0, 220);

export const getRecentDoctorQuestions = (
  conversation: ConversationMessage[],
  limit = 4
): string[] =>
  conversation
    .filter((message) => message.role === 'doctor')
    .map((message) => message.metadata?.question || message.content || '')
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(-limit);

export const isLikelyRepeatedQuestion = (
  candidate: string,
  recentQuestions: string[]
): boolean => {
  const nextKey = normalizeQuestionKey(candidate);
  if (!nextKey) return true;
  return recentQuestions.some((question) => normalizeQuestionKey(question) === nextKey);
};

export const getPhaseFallbackQuestion = (
  phase: AgentState['phase'],
  conversationLength: number
): string => {
  const options = PHASE_FALLBACKS[phase] || PHASE_FALLBACKS.assessment;
  return options[conversationLength % options.length];
};

export const isLikelyAnsweredTopicQuestion = (
  candidateQuestion: string,
  conversation: ConversationMessage[]
): boolean => {
  const matchedTopic = TOPIC_DEFINITIONS.find((item) =>
    item.questionPattern.test(candidateQuestion)
  );
  if (!matchedTopic) return false;

  const patientMentions = conversation
    .filter((message) => message.role === 'patient')
    .some((message) => matchedTopic.patientPattern.test(message.content));

  return patientMentions;
};
