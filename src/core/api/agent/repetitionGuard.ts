import { ConversationMessage, AgentState } from '../../types/clinical';

const QUESTION_NORMALIZE_PATTERN = /[^a-z0-9]+/gi;
const GENERIC_ASSOCIATED_SYMPTOM_PATTERN =
  /(which|what).*(associated symptom|symptom).*(stand out|most|prominent)|most prominent associated symptom/i;
const NONE_STANDS_OUT_PATTERN = /\bnone stand out|none stands out|nothing stands out|no other symptom\b/i;
const QUESTION_INTENT_PATTERNS = {
  most_limiting: /\bmost limiting\b|\bstands? out\b/i,
  symptom_change: /\bchanged since\b|\bhow has\b|\bbetter|worse|improved\b/i,
  pattern: /\bpattern\b|\bintermittent\b|\bconstant\b|\bday\b|\bnight\b/i,
  danger_signs: /\bdanger signs?\b|\bbreathlessness\b|\bconfusion\b|\bpersistent vomiting\b|\bbleeding\b/i,
} as const;
const UNCERTAIN_RESPONSE_PATTERN =
  /\b(not sure|unsure|unknown|maybe|don'?t know|cannot tell|idk)\b/i;
const NON_SUBSTANTIVE_RESPONSE_PATTERN = /^(ok|okay|k|kk|hmm+|uh+h*|ah+h*|alright|fine)$/i;
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
    'Is there any second complaint, and how long has it been present?',
  ],
  assessment: [
    'How severe is this symptom right now?',
    'What makes it worse or better?',
    'Is this symptom constant or does it come and go?',
  ],
  differential: [
    'Which one symptom is most limiting right now?',
    'How has that symptom changed since it began?',
    'What pattern do you notice most: day, night, intermittent, or constant?',
    'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
  ],
  resolution: [
    'What is your biggest concern right now?',
    'Are you able to keep up with normal daily activity?',
    'What result are you most hoping for in the next 24 hours?',
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
  conversationLength: number,
  recentQuestions: string[] = []
): string => {
  const options = PHASE_FALLBACKS[phase] || PHASE_FALLBACKS.assessment;
  const normalizedRecent = new Set(recentQuestions.map((question) => normalizeQuestionKey(question)));
  const turnIndex = Math.max(0, Math.floor(conversationLength / 2));

  for (let offset = 0; offset < options.length; offset += 1) {
    const candidate = options[(turnIndex + offset) % options.length];
    if (!normalizedRecent.has(normalizeQuestionKey(candidate))) {
      return candidate;
    }
  }

  return options[turnIndex % options.length];
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

export const isLoopingGenericPrompt = (
  candidateQuestion: string,
  conversation: ConversationMessage[]
): boolean => {
  if (!GENERIC_ASSOCIATED_SYMPTOM_PATTERN.test(candidateQuestion)) return false;

  const recentDoctorQuestions = getRecentDoctorQuestions(conversation, 3);
  const recentDoctorGenericAsks = recentDoctorQuestions.filter((question) =>
    GENERIC_ASSOCIATED_SYMPTOM_PATTERN.test(question)
  ).length;
  if (recentDoctorGenericAsks >= 1) return true;

  const recentPatientResponses = conversation
    .filter((message) => message.role === 'patient')
    .map((message) => message.content || '')
    .slice(-3);

  return recentPatientResponses.some((response) => NONE_STANDS_OUT_PATTERN.test(response));
};

const detectQuestionIntent = (
  question: string
): keyof typeof QUESTION_INTENT_PATTERNS | null => {
  for (const [intent, pattern] of Object.entries(QUESTION_INTENT_PATTERNS)) {
    if (pattern.test(question)) {
      return intent as keyof typeof QUESTION_INTENT_PATTERNS;
    }
  }
  return null;
};

const isSubstantivePatientResponse = (response: string): boolean => {
  const normalized = response.trim();
  if (!normalized) return false;
  if (UNCERTAIN_RESPONSE_PATTERN.test(normalized)) return false;
  if (NON_SUBSTANTIVE_RESPONSE_PATTERN.test(normalized)) return false;
  return /[a-z0-9]/i.test(normalized);
};

export const isRecentlyAnsweredQuestionIntent = (
  candidateQuestion: string,
  conversation: ConversationMessage[]
): boolean => {
  const intent = detectQuestionIntent(candidateQuestion);
  if (!intent) return false;
  const lookback = conversation.slice(-10);

  for (let i = lookback.length - 1; i >= 0; i -= 1) {
    const entry = lookback[i];
    if (entry.role !== 'doctor') continue;
    const askedQuestion = (entry.metadata?.question || entry.content || '').trim();
    if (!QUESTION_INTENT_PATTERNS[intent].test(askedQuestion)) continue;

    for (let j = i + 1; j < lookback.length; j += 1) {
      const followup = lookback[j];
      if (followup.role === 'doctor') break;
      if (
        followup.role === 'patient' &&
        isSubstantivePatientResponse(followup.content || '')
      ) {
        return true;
      }
    }
  }

  return false;
};
