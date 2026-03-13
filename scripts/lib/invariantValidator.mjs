const INTENT_PATTERNS = {
  duration: /\bhow long|since when|when did\b/i,
  yes_no: /^(is|are|do|did|have|has|can|could|will|would|should|any)\b/i,
  most_limiting: /\bmost limiting\b|\bstands?\s*out\b/i,
  symptom_change: /\bchanged since\b|\bhow has\b|\bbetter|worse|improved\b/i,
  pattern:
    /\bpattern\b|\bintermittent\b|\bconstant\b|\bday\b|\bnight\b|\bcyclic(al)?\b|\bnocturnal\b|\bevening chills?\b|\bmorning relief\b/i,
  danger_signs:
    /\bdanger signs?\b|any\s+red flags?\b|any\s+.*\b(breathlessness|confusion|persistent vomiting|bleeding)\b/i,
  summary: /\bsummary\b|\bworking diagnosis\b|\bfinalize\b|\bplan\b/i,
};

const QUESTION_ORDER = {
  duration: 1,
  yes_no: 2,
  most_limiting: 3,
  symptom_change: 4,
  pattern: 5,
  danger_signs: 6,
  summary: 7,
};

const OPTION_HINT_PATTERNS = {
  yes_no: /\byes\b|\bno\b|\bnot sure\b/i,
  timeline: /\bstarted today\b|\b1-2 days\b|\b3-4 days\b|\b5-7 days\b|\bweek\b/i,
  danger_signs:
    /\bnone of these\b|\bbreathlessness\b|\bconfusion\b|\bchest pain\b|\bpersistent vomiting\b|\bbleeding\b/i,
  summary: /\bready for summary\b|\badd one detail\b/i,
};

const SUMMARY_READY_INPUT_PATTERN =
  /\bready for summary\b|\bnothing else\b|\bno more\b|\bthat'?s all\b|\bdone\b|\bproceed\b|^(?:no|none)$/i;
const REPEAT_INTENT_EXEMPT = new Set(['duration', 'yes_no']);

const isSubstantiveAnswer = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  if (/\b(not sure|unsure|unknown|idk|maybe)\b/.test(normalized)) return false;
  if (/^(ok|okay|fine|alright|hmm+|uh+h*|k|kk)$/.test(normalized)) return false;
  return /[a-z0-9]/.test(normalized);
};

export const hasSingleQuestion = (question) => {
  const normalized = String(question || '').trim();
  if (!normalized) return false;
  const marks = normalized.match(/\?/g) || [];
  return marks.length === 1 && normalized.endsWith('?');
};

export const detectQuestionIntent = (question) => {
  const normalized = String(question || '').trim();
  if (!normalized) return null;
  const priorityOrder = [
    'danger_signs',
    'summary',
    'duration',
    'pattern',
    'most_limiting',
    'symptom_change',
    'yes_no',
  ];
  for (const intent of priorityOrder) {
    const pattern = INTENT_PATTERNS[intent];
    if (pattern.test(normalized)) return intent;
  }
  return null;
};

export const detectOptionIntent = (options) => {
  if (!options || !Array.isArray(options.options)) return null;
  const textBlob = options.options.map((option) => String(option.text || '').toLowerCase()).join(' | ');
  if (OPTION_HINT_PATTERNS.danger_signs.test(textBlob)) return 'danger_signs';
  if (OPTION_HINT_PATTERNS.timeline.test(textBlob)) return 'timeline';
  if (OPTION_HINT_PATTERNS.summary.test(textBlob)) return 'summary';
  if (OPTION_HINT_PATTERNS.yes_no.test(textBlob)) return 'yes_no';
  return null;
};

export class InvariantValidator {
  constructor(options = {}) {
    this.strict = options.strict !== false;
    this.errors = [];
    this.previousIntent = null;
    this.answeredIntents = new Set();
    this.maxQuestionOrder = 0;
    this.summaryRequestedTurn = null;
  }

  addViolation(label, detail) {
    const message = `${label}: ${detail}`;
    this.errors.push(message);
    if (this.strict) {
      throw new Error(message);
    }
  }

  validateTurn({
    scenarioId,
    turnIndex,
    patientInput,
    response,
    options,
  }) {
    const label = `${scenarioId}.turn${turnIndex + 1}`;

    if (!hasSingleQuestion(response.question)) {
      this.addViolation(label, 'one-question rule violated');
    }

    const currentIntent = detectQuestionIntent(response.question);

    if (this.previousIntent && isSubstantiveAnswer(patientInput)) {
      this.answeredIntents.add(this.previousIntent);
    }

    if (
      currentIntent &&
      this.answeredIntents.has(currentIntent) &&
      !REPEAT_INTENT_EXEMPT.has(currentIntent)
    ) {
      this.addViolation(label, `repeated answered intent: ${currentIntent}`);
    }

    const currentOrder = currentIntent ? QUESTION_ORDER[currentIntent] || 0 : 0;
    const terminalStatus = response.status === 'emergency' || response.status === 'complete';
    if (currentOrder > 0 && currentOrder + 1 < this.maxQuestionOrder && !terminalStatus) {
      this.addViolation(label, 'gate/question progression regressed (non-monotonic)');
    }
    this.maxQuestionOrder = Math.max(this.maxQuestionOrder, currentOrder);

    const optionIntent = detectOptionIntent(options);
    if (currentIntent === 'danger_signs' && optionIntent && optionIntent !== 'danger_signs' && optionIntent !== 'yes_no') {
      this.addViolation(label, `option intent mismatch for danger-sign question (${optionIntent})`);
    }
    if (currentIntent === 'duration' && optionIntent && optionIntent !== 'timeline') {
      this.addViolation(label, `option intent mismatch for duration question (${optionIntent})`);
    }
    if (currentIntent === 'yes_no' && optionIntent && !['yes_no', 'danger_signs'].includes(optionIntent)) {
      this.addViolation(label, `option intent mismatch for yes/no question (${optionIntent})`);
    }
    if (currentIntent === 'summary' && optionIntent && !['summary', 'yes_no'].includes(optionIntent)) {
      this.addViolation(label, `option intent mismatch for summary question (${optionIntent})`);
    }

    if (SUMMARY_READY_INPUT_PATTERN.test(String(patientInput || '').toLowerCase())) {
      this.summaryRequestedTurn = turnIndex;
    }
    if (this.summaryRequestedTurn !== null && turnIndex - this.summaryRequestedTurn >= 1) {
      const repeatedSummaryPrompt = detectQuestionIntent(response.question) === 'summary';
      const resolved =
        response.status === 'complete' ||
        response.status === 'emergency' ||
        !repeatedSummaryPrompt;
      if (!resolved) {
        this.addViolation(label, 'summary-ready did not move toward finalize path');
      }
    }

    this.previousIntent = currentIntent;
  }
}
