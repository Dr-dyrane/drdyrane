import {
  ClinicalState,
  ClinicalOutputContract,
  ConversationMessage,
  QuestionGateState,
  ResponseOptions,
} from '../types/clinical';
import { callConversationEngine } from './conversationEngine';
import { generateResponseOptions } from './optionsEngine';
import { isEmergencyInput } from './agent/emergencyRules';
import {
  buildDoctorMessageFromResult,
  createDoctorMessage,
  createPatientMessage,
} from './agent/messageFactory';
import { buildLocalOptions, isStructuredLocalQuestion } from './agent/localOptions';
import { isOptionSetRelevant } from './agent/optionQuality';
import {
  getFallbackQuestion,
  sanitizeQuestion,
} from './agent/questionFlow';
import { recordInvariantEvent, resetInvariantAudit } from './agent/invariantAudit';
import {
  extractProfileUpdates,
  getProfileDelta,
  mergeProfile,
} from './agent/profileMemory';
import { buildClinicalPlan } from './agent/clinicalPlan';
import {
  getPhaseFallbackQuestion,
  getRecentDoctorQuestions,
  isLikelyAnsweredTopicQuestion,
  isLoopingGenericPrompt,
  isRecentlyAnsweredQuestionIntent,
  isLikelyRepeatedQuestion,
} from './agent/repetitionGuard';
import { buildAutoClerking } from './agent/clerkingAutoFill';
import { deriveFindingMemory } from './agent/encounterMemory';

const PROFILE_MEMORY_NOTIFICATION = {
  title: 'Profile Memory Updated',
  body: 'New patient details were captured and saved for future clinical context.',
};

const INTERRUPTION_FALLBACK_BASE = {
  statement: 'Thank you. I am still with you.',
};

const GATE_FINALIZATION_FALLBACK = {
  question: 'I can continue safely. What changed most since symptoms began?',
  statement: 'Noted.',
};

const OPTION_STACK_MIN_CHOICES = 8;
const STACKED_BINARY_TIMEOUT_SECONDS = 10;
const PRESENTING_COMPLAINT_BINARY_TIMEOUT_SECONDS = 10;
const PRESENTING_COMPLAINT_MAX_ADDITIONAL = 3;
const ASSISTIVE_OPTION_SOFT_CAP = 4;
const HYBRID_CHAT_FIRST_MODE = true;
const ENABLE_STACKED_SYMPTOM_GATE = false;
const STRICT_OPTION_CONTRACT_MODE = import.meta.env.VITE_CONSULT_OPTION_CONTRACT_STRICT !== 'false';
const STACKED_SYMPTOM_SURVEY_PATTERN =
  /(which|what).*(associated symptom|symptom).*(stand out|most|prominent)|most prominent symptom with fever|associated symptom stands out/i;
const SYMPTOM_SURVEY_SIGNAL_PATTERN =
  /(headache|chills?|rigors?|nausea|vomit|aches?|fatigue|sweating|abdominal pain|diarrh|cough)/i;
const DURATION_PHRASE_PATTERN =
  /\b(for\s+\d+\s*(?:hours?|hrs?|days?|weeks?|w(?:eeks?)?|months?|mos?|years?|yrs?)|since\s+[^,.;!?]+|today|yesterday|last night|this morning|this evening)\b/i;
const NON_COMPLAINT_OPENER_PATTERN = /^(hi|hello|hey|good (morning|afternoon|evening)|thanks?)\b/i;
const YES_ANSWER_PATTERN = /\b(yes|yeah|yep|affirmative|correct|absolutely|certainly)\b/i;
const NO_ANSWER_PATTERN = /\b(no|none|nothing else|nope)\b/i;
const UNSURE_ANSWER_PATTERN = /\b(not sure|unsure|unknown|maybe|don'?t know|cannot tell|idk)\b/i;
const NON_SUBSTANTIVE_PATIENT_RESPONSE_PATTERN = /^(ok|okay|alright|fine|hmm+|uh+h*|ah+h*|k|kk)$/i;
const MOST_LIMITING_QUESTION_PATTERN = /\bmost limiting\b|\bstands?\s*out\b/i;
const SYMPTOM_CHANGE_QUESTION_PATTERN = /\bchanged since\b|\bhow has\b|\bbetter|worse|improved\b/i;
const SUMMARY_CLARIFY_QUESTION_PATTERN =
  /\bwhat other detail should i clarify before i summarize your working diagnosis\b|\bworking diagnosis and plan\b/i;
const SUMMARY_READY_RESPONSE_PATTERN =
  /\bready for summary\b|\bsummary[-\s]?ready\b|\bnothing else\b|\bno more\b|\bthat'?s all\b|\bdone\b|\bproceed\b|^(?:no|none)$/i;
const CHECKPOINT_DANGER_SIGNAL_PATTERN =
  /\b(confusion|faint|collapse|seizure|breathless|shortness of breath|unable to breathe|chest pain|persistent vomiting|cannot keep.*down|bleeding|very drowsy)\b/i;
const PATTERN_QUESTION_PATTERN =
  /\bpattern\b|\bintermittent\b|\bconstant\b|\bday\b|\bnight\b|\bcyclic(al)?\b|\bcycle(s)?\b|\bnocturnal\b|\bevening chills?\b|\bmorning relief\b/i;
const DANGER_SIGNS_QUESTION_PATTERN =
  /\bdanger signs?\b|\bbreathlessness\b|\bconfusion\b|\bpersistent vomiting\b|\bbleeding\b|\bchest pain\b/i;
const SAFETY_CHECK_QUESTION_PATTERN =
  /\bbefore i finalize\b|\bdanger signs?\b|\bconfusion\b|\bfainting\b|\bbreathing trouble\b|\bpersistent vomiting\b|\bbleeding\b/i;
const SYMPTOM_CLUSTER_PROMPT = 'Which symptom cluster stands out most right now?';
const FEVER_PATTERN_DETAIL_PROMPT = 'Within fever pattern, which cue stands out most?';
const HEAD_PAIN_DETAIL_PROMPT = 'Within head/pain pattern, which symptom stands out most?';
const AIRWAY_DETAIL_PROMPT = 'Within airway/throat pattern, which symptom stands out most?';
const GUT_DETAIL_PROMPT = 'Within stomach/gut pattern, which symptom stands out most?';
const GENERAL_DETAIL_PROMPT = 'Within energy/general pattern, which symptom stands out most?';
const SUMMARY_FINALIZE_PROMPT = 'Would you like your working diagnosis and plan now?';
const FINAL_SAFETY_PROMPT =
  'Before I finalize, any danger signs now: confusion, fainting, breathing trouble, chest pain, persistent vomiting, or bleeding?';

type QuestionIntent =
  | 'duration'
  | 'yes_no'
  | 'most_limiting'
  | 'symptom_change'
  | 'pattern'
  | 'danger_signs'
  | 'summary';

const QUESTION_INTENT_PATTERNS: Record<QuestionIntent, RegExp> = {
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

const QUESTION_INTENT_ORDER: Record<QuestionIntent, number> = {
  duration: 1,
  yes_no: 2,
  most_limiting: 3,
  symptom_change: 4,
  pattern: 5,
  danger_signs: 6,
  summary: 7,
};

const REPEAT_INTENT_EXEMPT = new Set<QuestionIntent>(['duration', 'yes_no']);

type OptionIntent = 'danger_signs' | 'timeline' | 'summary' | 'yes_no' | null;
const OPTION_INTENT_HINT_PATTERNS = {
  yes_no: /\byes\b|\bno\b|\bnot sure\b/i,
  timeline: /\bstarted today\b|\b1-2 days\b|\b3-4 days\b|\b5-7 days\b|\bweek\b/i,
  danger_signs:
    /\bnone of these\b|\bbreathlessness\b|\bconfusion\b|\bchest pain\b|\bpersistent vomiting\b|\bbleeding\b/i,
  summary: /\bready for summary\b|\badd one detail\b/i,
};

export class AgentCoordinator {
  private state: ClinicalState;
  private interactionTurn = 0;
  private lastClinicalContract: ClinicalOutputContract | null = null;

  constructor(initialState: ClinicalState) {
    this.state = initialState;
  }

  async processPatientInput(input: string): Promise<Partial<ClinicalState>> {
    const normalizedInput = input.trim();
    if (!normalizedInput) return {};
    this.interactionTurn += 1;

    if (isEmergencyInput(normalizedInput)) {
      return {
        status: 'emergency',
        redFlag: true,
        urgency: 'critical',
        probability: 100,
        question_gate: null,
        response_options: null,
        selected_options: [],
      };
    }

    if (this.state.question_gate?.active) {
      if (HYBRID_CHAT_FIRST_MODE && this.state.question_gate.kind !== 'safety_checkpoint') {
        this.state = {
          ...this.state,
          question_gate: null,
          response_options: null,
          selected_options: [],
        };
      } else {
        return this.processGatedAnswer(normalizedInput);
      }
    }

    if (this.state.question_gate?.active) {
      return this.processGatedAnswer(normalizedInput);
    }

    const stateForTurn = this.applyProfileCapture(normalizedInput);
    if (
      !HYBRID_CHAT_FIRST_MODE &&
      this.shouldStartPresentingComplaintGate(normalizedInput, stateForTurn)
    ) {
      return this.startPresentingComplaintGate(normalizedInput, stateForTurn);
    }
    const patientMessage = createPatientMessage(normalizedInput);

    try {
      return await this.processConversationTurn(normalizedInput, patientMessage, stateForTurn);
    } catch (error) {
      console.error('Agent Coordinator Error:', error);
      const recoveryQuestion = this.getRecoveryQuestion(stateForTurn.agent_state.phase);
      const fallbackDoctorMessage = createDoctorMessage(
        recoveryQuestion,
        INTERRUPTION_FALLBACK_BASE.statement
      );

      const fallbackState: Partial<ClinicalState> = {
        status: 'active',
        conversation: [...this.state.conversation, patientMessage, fallbackDoctorMessage],
        thinking: 'Attempting to reconnect with clinical engine...',
        profile: stateForTurn.profile,
        clerking: buildAutoClerking(
          stateForTurn.clerking,
          stateForTurn.soap,
          [...this.state.conversation, patientMessage, fallbackDoctorMessage],
          stateForTurn.profile
        ),
        question_gate: null,
        response_options: buildLocalOptions(recoveryQuestion, this.state.profile),
        selected_options: [],
      };

      this.state = { ...this.state, ...fallbackState };
      return fallbackState;
    }
  }

  async processOptionSelection(selectedOptionIds: string[]): Promise<Partial<ClinicalState>> {
    if (!this.state.response_options) {
      return {};
    }

    const selectedOptions = this.state.response_options.options.filter((option) =>
      selectedOptionIds.includes(option.id)
    );

    const normalizedOptionInput = this.buildOptionSelectionInput(selectedOptionIds, selectedOptions);

    if (this.state.question_gate?.active) {
      if (HYBRID_CHAT_FIRST_MODE && this.state.question_gate.kind !== 'safety_checkpoint') {
        this.state = {
          ...this.state,
          question_gate: null,
          response_options: null,
          selected_options: [],
        };
        return this.processPatientInput(normalizedOptionInput);
      }
      return this.processGatedAnswer(normalizedOptionInput);
    }

    return this.processPatientInput(normalizedOptionInput);
  }

  private buildOptionSelectionInput(
    selectedOptionIds: string[],
    selectedOptions: ResponseOptions['options']
  ): string {
    if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
      return selectedOptionIds
        .map((id) => id.replace(/[-_]+/g, ' ').trim())
        .filter(Boolean)
        .join(', ');
    }

    const normalizedTexts = selectedOptions
      .map((option) => this.normalizeSelectedOptionText(option))
      .filter(Boolean);

    const deduped = Array.from(new Set(normalizedTexts));
    if (deduped.length > 0) {
      return deduped.join(', ');
    }

    return selectedOptionIds
      .map((id) => id.replace(/[-_]+/g, ' ').trim())
      .filter(Boolean)
      .join(', ');
  }

  private normalizeSelectedOptionText(
    option: ResponseOptions['options'][number]
  ): string {
    const id = (option.id || '').toLowerCase();
    const category = (option.category || '').toLowerCase();
    const text = (option.text || '').trim();

    if (id === 'yes') return 'Yes';
    if (id === 'no') {
      return /none of these/i.test(text) ? 'None of these' : 'No';
    }
    if (id === 'unsure') return 'Not sure';

    if (category === 'summary' || id.startsWith('summary-')) {
      if (id.includes('ready')) return 'Ready for summary';
      if (id.includes('add') || id.includes('detail')) return 'Add one detail';
      if (id.includes('not-sure') || id.includes('unsure')) return 'Not sure';
    }

    return text || id.replace(/[-_]+/g, ' ').trim();
  }

  private applyProfileCapture(input: string): ClinicalState {
    const profileCandidate = extractProfileUpdates(input);
    const capturedProfile = profileCandidate
      ? getProfileDelta(this.state.profile, profileCandidate)
      : null;

    if (!capturedProfile) {
      return this.state;
    }

    const nextState: ClinicalState = {
      ...this.state,
      profile: mergeProfile(this.state.profile, capturedProfile),
      notifications: this.state.settings.notifications_enabled
        ? [
            {
              id: crypto.randomUUID(),
              title: PROFILE_MEMORY_NOTIFICATION.title,
              body: PROFILE_MEMORY_NOTIFICATION.body,
              created_at: Date.now(),
              read: false,
            },
            ...this.state.notifications,
          ].slice(0, 120)
        : this.state.notifications,
    };

    this.state = nextState;
    return nextState;
  }

  private resolveProfileForInput(input: string): ClinicalState['profile'] {
    const profileCandidate = extractProfileUpdates(input);
    const capturedProfile = profileCandidate
      ? getProfileDelta(this.state.profile, profileCandidate)
      : null;
    if (!capturedProfile) {
      return this.state.profile;
    }

    return mergeProfile(this.state.profile, capturedProfile);
  }

  private shouldStartPresentingComplaintGate(input: string, stateForTurn: ClinicalState): boolean {
    const hasCapturedComplaint = this.hasCapturedPresentingComplaint(stateForTurn);
    if (hasCapturedComplaint) return false;

    const statusEligible =
      stateForTurn.status === 'idle' ||
      stateForTurn.status === 'intake' ||
      (stateForTurn.status === 'active' && !hasCapturedComplaint);
    if (!statusEligible) return false;

    if (this.isGreetingOnlyMessage(input)) return false;
    return true;
  }

  private isGreetingOnlyMessage(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) return true;
    return NON_COMPLAINT_OPENER_PATTERN.test(normalized) && normalized.split(/\s+/).length <= 6;
  }

  private hasCapturedPresentingComplaint(stateForTurn: ClinicalState): boolean {
    const patientMessages = stateForTurn.conversation.filter((entry) => entry.role === 'patient');
    const hasClinicalPatientInput = patientMessages.some(
      (entry) => !this.isGreetingOnlyMessage(entry.content || '')
    );
    if (hasClinicalPatientInput) return true;
    if (stateForTurn.ddx.length > 0) return true;
    return Object.keys(stateForTurn.soap?.S || {}).length > 0;
  }

  private extractDurationPhrase(text: string): string | null {
    const match = text.match(DURATION_PHRASE_PATTERN);
    if (!match) return null;
    return match[0].replace(/\s+/g, ' ').trim();
  }

  private extractChiefComplaintText(text: string): string {
    const withoutDuration = text
      .replace(DURATION_PHRASE_PATTERN, '')
      .replace(/\b(i have|i've had|i had|having|with)\b/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, '')
      .trim();
    if (!withoutDuration) return 'this complaint';
    return withoutDuration.slice(0, 120);
  }

  private isAffirmativeAnswer(answer: string): boolean {
    if (UNSURE_ANSWER_PATTERN.test(answer)) return false;
    return YES_ANSWER_PATTERN.test(answer) && !NO_ANSWER_PATTERN.test(answer);
  }

  private isNegativeOrUncertainAnswer(answer: string): boolean {
    return NO_ANSWER_PATTERN.test(answer) || UNSURE_ANSWER_PATTERN.test(answer);
  }

  private ensureCheckpointState(
    checkpoint: ClinicalState['agent_state']['must_not_miss_checkpoint'] | undefined
  ): ClinicalState['agent_state']['must_not_miss_checkpoint'] {
    return {
      required: Boolean(checkpoint?.required),
      status: checkpoint?.status || 'idle',
      last_question: checkpoint?.last_question,
      last_response: checkpoint?.last_response,
      updated_at: checkpoint?.updated_at,
    };
  }

  private withDerivedFindingMemory(
    baseAgentState: ClinicalState['agent_state'],
    snapshot: ClinicalState
  ): ClinicalState['agent_state'] {
    const checkpoint = this.ensureCheckpointState(baseAgentState.must_not_miss_checkpoint);
    const memorySnapshot: ClinicalState = {
      ...snapshot,
      agent_state: {
        ...baseAgentState,
        must_not_miss_checkpoint: checkpoint,
      },
    };
    const findingMemory = deriveFindingMemory(memorySnapshot);

    return {
      ...baseAgentState,
      positive_findings: findingMemory.positive,
      negative_findings: findingMemory.negative,
      must_not_miss_checkpoint: checkpoint,
    };
  }

  private mergePendingActions(existing: string[], additions: string[]): string[] {
    return Array.from(new Set([...existing, ...additions].filter(Boolean))).slice(0, 8);
  }

  private shouldEnforceSafetyCheckpoint(
    status: ClinicalState['status'],
    autoComplete: boolean,
    checkpoint: ClinicalState['agent_state']['must_not_miss_checkpoint']
  ): boolean {
    if (status === 'emergency' || status === 'lens') return false;
    if (!autoComplete && status !== 'complete') return false;
    if (checkpoint.status === 'cleared' || checkpoint.status === 'escalate') return false;
    return true;
  }

  private buildSafetyCheckpointQuestion(ddx: string[]): string {
    const lead = (ddx[0] || '').replace(/\s*\(icd-10:\s*[a-z0-9.-]+\)\s*/gi, '').trim();
    if (lead) {
      return `Before I finalize ${lead}, any danger signs now: confusion, fainting, breathing trouble, chest pain, persistent vomiting, or bleeding?`;
    }
    return 'Before I finalize, any danger signs now: confusion, fainting, breathing trouble, chest pain, persistent vomiting, or bleeding?';
  }

  private classifySafetyCheckpointAnswer(answer: string): 'clear' | 'positive' | 'uncertain' {
    if (!answer) return 'uncertain';
    const normalized = answer.trim().toLowerCase();
    if (UNSURE_ANSWER_PATTERN.test(normalized)) return 'uncertain';
    if (CHECKPOINT_DANGER_SIGNAL_PATTERN.test(normalized)) return 'positive';
    if (NO_ANSWER_PATTERN.test(normalized)) return 'clear';
    if (this.isAffirmativeAnswer(normalized)) return 'positive';
    return 'uncertain';
  }

  private async processSafetyCheckpointAnswer(
    answerText: string,
    gate: QuestionGateState,
    nextAnswers: QuestionGateState['answers'],
    patientMessage: ConversationMessage,
    profileForTurn: ClinicalState['profile']
  ): Promise<Partial<ClinicalState>> {
    const safetyDecision = this.classifySafetyCheckpointAnswer(answerText);
    const now = Date.now();
    const checkpointQuestion = gate.source_question || this.buildSafetyCheckpointQuestion(this.state.ddx);

    if (safetyDecision === 'positive') {
      const escalationQuestion = 'Can you access emergency care right now?';
      const doctorMessage = createDoctorMessage(
        escalationQuestion,
        'That could indicate a must-not-miss emergency. Please seek urgent in-person care immediately.'
      );
      const conversation = [...this.state.conversation, patientMessage, doctorMessage];
      const nextAgentState = this.withDerivedFindingMemory(
        {
          ...this.state.agent_state,
          pending_actions: this.mergePendingActions(this.state.agent_state.pending_actions, [
            'Immediate emergency referral',
            'Stabilize airway-breathing-circulation and urgent transfer',
          ]),
          last_decision: 'Must-not-miss checkpoint positive; escalated to emergency care',
          must_not_miss_checkpoint: {
            required: false,
            status: 'escalate',
            last_question: checkpointQuestion,
            last_response: answerText,
            updated_at: now,
          },
        },
        {
          ...this.state,
          conversation,
          profile: profileForTurn,
        }
      );
      const nextState: Partial<ClinicalState> = {
        status: 'emergency',
        redFlag: true,
        urgency: 'critical',
        conversation,
        profile: profileForTurn,
        clerking: buildAutoClerking(this.state.clerking, this.state.soap, conversation, profileForTurn),
        agent_state: nextAgentState,
        thinking: 'Safety checkpoint flagged high-risk danger signs; emergency escalation advised.',
        question_gate: null,
        response_options: null,
        selected_options: [],
      };
      this.state = { ...this.state, ...nextState };
      return nextState;
    }

    if (safetyDecision === 'clear') {
      const conversation = [...this.state.conversation, patientMessage];
      const nextAgentState = this.withDerivedFindingMemory(
        {
          ...this.state.agent_state,
          must_not_miss_checkpoint: {
            required: false,
            status: 'cleared',
            last_question: checkpointQuestion,
            last_response: answerText,
            updated_at: now,
          },
          pending_actions: this.mergePendingActions(this.state.agent_state.pending_actions, [
            'Must-not-miss danger signs reviewed and excluded',
          ]),
          last_decision: 'Safety checkpoint cleared; ready for final diagnosis output',
        },
        {
          ...this.state,
          conversation,
          profile: profileForTurn,
        }
      );
      const finalPlan = buildClinicalPlan({
        ddx: this.state.ddx,
        soap: this.state.soap,
        urgency: this.state.urgency,
        profile: profileForTurn,
        contract: this.lastClinicalContract || undefined,
      });
      const nextState: Partial<ClinicalState> = {
        status: 'complete',
        conversation,
        profile: profileForTurn,
        clerking: buildAutoClerking(this.state.clerking, this.state.soap, conversation, profileForTurn),
        pillars: finalPlan,
        agent_state: nextAgentState,
        question_gate: null,
        response_options: null,
        selected_options: [],
      };
      this.state = { ...this.state, ...nextState };
      return nextState;
    }

    const clarificationQuestion = this.buildSafetyCheckpointQuestion(this.state.ddx);
    const clarificationDoctor = createDoctorMessage(
      clarificationQuestion,
      'I need one clear safety check before I finalize your plan.'
    );
    const clarificationGate: QuestionGateState = {
      ...gate,
      kind: 'safety_checkpoint',
      source_question: clarificationQuestion,
      current_index: 0,
      answers: nextAnswers,
      segments: [{ id: 'must_not_miss_excluded', prompt: clarificationQuestion }],
    };
    const responseOptions = await this.resolveQuestionOptions(
      clarificationQuestion,
      this.state.agent_state,
      this.state.soap,
      profileForTurn
    );
    const conversation = [...this.state.conversation, patientMessage, clarificationDoctor];
    const nextAgentState = this.withDerivedFindingMemory(
      {
        ...this.state.agent_state,
        pending_actions: this.mergePendingActions(this.state.agent_state.pending_actions, [
          'Await clear must-not-miss checkpoint response',
        ]),
        last_decision: 'Safety checkpoint unclear; requesting explicit yes/no confirmation',
        must_not_miss_checkpoint: {
          required: true,
          status: 'pending',
          last_question: clarificationQuestion,
          last_response: answerText,
          updated_at: now,
        },
      },
      {
        ...this.state,
        conversation,
        profile: profileForTurn,
      }
    );
    const nextState: Partial<ClinicalState> = {
      status: 'active',
      conversation,
      profile: profileForTurn,
      clerking: buildAutoClerking(this.state.clerking, this.state.soap, conversation, profileForTurn),
      question_gate: clarificationGate,
      response_options: {
        ...responseOptions,
        allow_custom_input: true,
        context_hint: 'Safety check before final diagnosis.',
      },
      selected_options: [],
      agent_state: nextAgentState,
    };
    this.state = { ...this.state, ...nextState };
    return nextState;
  }

  private buildPresentingComplaintsSummary(
    answers: QuestionGateState['answers']
  ): string {
    const chiefComplaint =
      answers.find((entry) => entry.segment_id === 'chief_complaint')?.response || 'Chief complaint not specified';
    const chiefDuration =
      answers.find((entry) => entry.segment_id === 'chief_duration')?.response || 'Duration not specified';

    const lines = [`1. Complaint: ${chiefComplaint} | Duration: ${chiefDuration}`];
    let ordinal = 2;

    for (let idx = 1; idx <= PRESENTING_COMPLAINT_MAX_ADDITIONAL; idx += 1) {
      const complaint = answers.find((entry) => entry.segment_id === `other_detail_${idx}`)?.response;
      if (!complaint) continue;
      const duration =
        answers.find((entry) => entry.segment_id === `other_duration_${idx}`)?.response ||
        'Duration not specified';
      lines.push(`${ordinal}. Complaint: ${complaint} | Duration: ${duration}`);
      ordinal += 1;
    }

    return ['Presenting complaints with duration:', ...lines].join('\n');
  }

  private async startPresentingComplaintGate(
    input: string,
    stateForTurn: ClinicalState
  ): Promise<Partial<ClinicalState>> {
    const chiefComplaint = this.extractChiefComplaintText(input);
    const chiefDuration = this.extractDurationPhrase(input);
    const answers: QuestionGateState['answers'] = [
      {
        segment_id: 'chief_complaint',
        prompt: 'Primary presenting complaint',
        response: chiefComplaint,
      },
    ];
    const segments: QuestionGateState['segments'] = [];

    if (chiefDuration) {
      answers.push({
        segment_id: 'chief_duration',
        prompt: 'Duration of primary complaint',
        response: chiefDuration,
      });
    } else {
      segments.push({
        id: 'chief_duration',
        prompt: 'How long has this complaint been present?',
      });
    }

    segments.push({
      id: 'other_confirm_1',
      prompt: 'Any other complaint right now?',
      timeout_seconds: PRESENTING_COMPLAINT_BINARY_TIMEOUT_SECONDS,
    });

    const gate: QuestionGateState = {
      active: true,
      kind: 'presenting_complaints',
      source_question: 'Presenting complaints capture',
      segments,
      current_index: 0,
      answers,
      additional_count: 0,
      max_additional: PRESENTING_COMPLAINT_MAX_ADDITIONAL,
    };

    const firstSegment = gate.segments[gate.current_index];
    const patientMessage = createPatientMessage(input);
    const stagedDoctor = createDoctorMessage(firstSegment.prompt, 'Noted.');
    const stagedOptionsBase = await this.resolveQuestionOptions(
      firstSegment.prompt,
      stateForTurn.agent_state,
      stateForTurn.soap,
      stateForTurn.profile
    );
    const stagedOptions =
      typeof firstSegment.timeout_seconds === 'number' && firstSegment.timeout_seconds > 0
        ? this.buildTimedBinaryOptions(firstSegment.prompt, `Step 1 of ${segments.length}: Quick yes/no.`)
        : stagedOptionsBase;

    const conversation = [...stateForTurn.conversation, patientMessage, stagedDoctor];
    const stagedState: Partial<ClinicalState> = {
      status: 'active',
      conversation,
      profile: stateForTurn.profile,
      clerking: buildAutoClerking(stateForTurn.clerking, stateForTurn.soap, conversation, stateForTurn.profile),
      question_gate: gate,
      response_options: stagedOptions,
      selected_options: [],
    };

    this.state = { ...stateForTurn, ...stagedState };
    return stagedState;
  }

  private buildTimedBinaryOptions(question: string, contextHint: string): ResponseOptions {
    const normalized = question.toLowerCase();
    const negativeLabel = /danger signs?|breathlessness|confusion|persistent vomiting|bleeding|chest pain/.test(
      normalized
    )
      ? 'None of these'
      : 'No';

    return {
      mode: 'single',
      ui_variant: 'segmented',
      options: [
        { id: 'yes', text: 'Yes', category: 'confirmation', priority: 10 },
        { id: 'no', text: negativeLabel, category: 'confirmation', priority: 9 },
        { id: 'unsure', text: 'Not sure', category: 'confirmation', priority: 8 },
      ],
      allow_custom_input: true,
      context_hint: contextHint,
    };
  }

  private async stageNextGateStep(
    gate: QuestionGateState,
    nextIndex: number,
    patientMessage: ConversationMessage,
    profileForTurn: ClinicalState['profile']
  ): Promise<Partial<ClinicalState>> {
    const maxIndex = Math.max(0, gate.segments.length - 1);
    const safeIndex = Math.max(gate.current_index, Math.min(nextIndex, maxIndex));
    const nextSegment = gate.segments[safeIndex];
    if (!nextSegment) {
      return this.finalizeGateToConversation(
        'Stacked symptom survey summary: Unable to continue gate step; resuming conversation.',
        patientMessage,
        profileForTurn
      );
    }
    const nextGate: QuestionGateState = {
      ...gate,
      current_index: safeIndex,
    };

    const stagedDoctor = createDoctorMessage(nextSegment.prompt, 'Noted');
    const stagedOptionsBase =
      nextSegment.input_mode === 'freeform'
        ? null
        : await this.resolveQuestionOptions(
            nextSegment.prompt,
            this.state.agent_state,
            this.state.soap,
            profileForTurn
          );
    const stagedOptions =
      stagedOptionsBase && typeof nextSegment.timeout_seconds === 'number' && nextSegment.timeout_seconds > 0
        ? this.buildTimedBinaryOptions(
            nextSegment.prompt,
            `Step ${safeIndex + 1} of ${gate.segments.length}: Quick yes/no.`
          )
        : stagedOptionsBase;
    const conversation = [...this.state.conversation, patientMessage, stagedDoctor];
    const stagedState: Partial<ClinicalState> = {
      conversation,
      profile: profileForTurn,
      clerking: buildAutoClerking(this.state.clerking, this.state.soap, conversation, profileForTurn),
      question_gate: nextGate,
      response_options: stagedOptions,
      selected_options: [],
      status: 'active',
    };

    this.state = { ...this.state, ...stagedState };
    return stagedState;
  }

  private async finalizeGateToConversation(
    stackedInput: string,
    patientMessage: ConversationMessage,
    profileForTurn: ClinicalState['profile']
  ): Promise<Partial<ClinicalState>> {
    const stateForTurn: ClinicalState = {
      ...this.state,
      profile: profileForTurn,
      question_gate: null,
      response_options: null,
      selected_options: [],
      conversation: this.state.conversation,
    };

    this.state = stateForTurn;

    try {
      return await this.processConversationTurn(stackedInput, patientMessage, stateForTurn);
    } catch (error) {
      console.error('Question gate finalization failed:', error);
      const fallbackDoctorMessage = createDoctorMessage(
        GATE_FINALIZATION_FALLBACK.question,
        GATE_FINALIZATION_FALLBACK.statement
      );
      const fallbackConversation = [...this.state.conversation, patientMessage, fallbackDoctorMessage];
      const fallbackState: Partial<ClinicalState> = {
        status: 'active',
        conversation: fallbackConversation,
        profile: profileForTurn,
        clerking: buildAutoClerking(
          this.state.clerking,
          this.state.soap,
          fallbackConversation,
          profileForTurn
        ),
        question_gate: null,
        response_options: buildLocalOptions(GATE_FINALIZATION_FALLBACK.question, profileForTurn),
        selected_options: [],
      };
      this.state = { ...this.state, ...fallbackState };
      return fallbackState;
    }
  }

  private async processConversationTurn(
    input: string,
    patientMessage: ConversationMessage,
    stateForTurn: ClinicalState
  ): Promise<Partial<ClinicalState>> {
    const conversationResult = await callConversationEngine(input, stateForTurn);
    this.lastClinicalContract = conversationResult.clinical_contract;

    const nextConversation: ConversationMessage[] = [...stateForTurn.conversation, patientMessage];
    const nextSoap = {
      S: {
        ...(stateForTurn.soap.S || {}),
        ...(conversationResult.soap_updates?.S || {}),
      },
      O: {
        ...(stateForTurn.soap.O || {}),
        ...(conversationResult.soap_updates?.O || {}),
      },
      A: {
        ...(stateForTurn.soap.A || {}),
        ...(conversationResult.soap_updates?.A || {}),
      },
      P: {
        ...(stateForTurn.soap.P || {}),
        ...(conversationResult.soap_updates?.P || {}),
      },
    };
    const incomingCheckpoint = this.ensureCheckpointState(
      conversationResult.agent_state.must_not_miss_checkpoint ||
        stateForTurn.agent_state.must_not_miss_checkpoint
    );
    const baseAgentState: ClinicalState['agent_state'] = {
      ...stateForTurn.agent_state,
      ...conversationResult.agent_state,
      pending_actions: conversationResult.agent_state.pending_actions || stateForTurn.agent_state.pending_actions,
      positive_findings:
        conversationResult.agent_state.positive_findings || stateForTurn.agent_state.positive_findings,
      negative_findings:
        conversationResult.agent_state.negative_findings || stateForTurn.agent_state.negative_findings,
      must_not_miss_checkpoint: incomingCheckpoint,
    };

    let doctorMessage = buildDoctorMessageFromResult(conversationResult.message);
    let aiQuestion = this.ensureProgressiveQuestion(
      doctorMessage.metadata?.question || getFallbackQuestion(),
      nextConversation,
      conversationResult.agent_state.phase
    );
    const patientRequestedSummary =
      this.isSummaryReadyInput(input) && this.hasSummaryPromptContext(nextConversation);
    if (patientRequestedSummary && !conversationResult.lens_trigger) {
      const dangerSignsCovered =
        incomingCheckpoint.status === 'cleared' ||
        this.hasRecentlyAnsweredIntent(nextConversation, DANGER_SIGNS_QUESTION_PATTERN, 28);
      aiQuestion = dangerSignsCovered ? SUMMARY_FINALIZE_PROMPT : FINAL_SAFETY_PROMPT;
    }
    doctorMessage = createDoctorMessage(aiQuestion, conversationResult.message.metadata?.statement);

    const forcedSummaryAutoComplete = this.shouldForceSummaryAutoComplete(
      input,
      conversationResult.status,
      conversationResult.ddx,
      nextConversation,
      incomingCheckpoint
    );
    if (forcedSummaryAutoComplete) {
      recordInvariantEvent('intent_progression_corrected', 'summary_fast_track');
    }

    const autoComplete = forcedSummaryAutoComplete || this.shouldAutoCompleteEncounter(
      conversationResult.status,
      conversationResult.ddx,
      conversationResult.probability,
      nextSoap,
      nextConversation
    );
    const requiresSafetyCheckpoint = this.shouldEnforceSafetyCheckpoint(
      conversationResult.status,
      autoComplete,
      incomingCheckpoint
    );

    if (requiresSafetyCheckpoint && !conversationResult.lens_trigger) {
      const safetyQuestion = this.buildSafetyCheckpointQuestion(conversationResult.ddx);
      const safetyDoctorMessage = createDoctorMessage(
        safetyQuestion,
        'I need one final safety check.'
      );
      nextConversation.push(safetyDoctorMessage);

      const checkpointAgentState = this.withDerivedFindingMemory(
        {
          ...baseAgentState,
          pending_actions: this.mergePendingActions(baseAgentState.pending_actions, [
            'Confirm must-not-miss danger signs still excluded',
          ]),
          last_decision: 'Final diagnosis held until must-not-miss safety checkpoint is cleared',
          must_not_miss_checkpoint: {
            required: true,
            status: 'pending',
            last_question: safetyQuestion,
            last_response: incomingCheckpoint.last_response,
            updated_at: Date.now(),
          },
        },
        {
          ...stateForTurn,
          conversation: nextConversation,
          soap: nextSoap,
        }
      );

      const checkpointGate: QuestionGateState = {
        active: true,
        kind: 'safety_checkpoint',
        source_question: safetyQuestion,
        segments: [{ id: 'must_not_miss_excluded', prompt: safetyQuestion }],
        current_index: 0,
        answers: [],
      };
      const checkpointOptions = await this.resolveQuestionOptions(
        safetyQuestion,
        checkpointAgentState,
        nextSoap,
        stateForTurn.profile
      );
      const nextClerking = buildAutoClerking(
        stateForTurn.clerking,
        nextSoap,
        nextConversation,
        stateForTurn.profile
      );
      const checkpointState: Partial<ClinicalState> = {
        conversation: nextConversation,
        soap: nextSoap,
        ddx: conversationResult.ddx,
        profile: stateForTurn.profile,
        clerking: nextClerking,
        agent_state: checkpointAgentState,
        urgency: conversationResult.urgency,
        probability: conversationResult.probability,
        thinking: 'Running mandatory must-not-miss safety exclusion before final output.',
        status: 'active',
        pillars: null,
        question_gate: checkpointGate,
        response_options: {
          ...checkpointOptions,
          allow_custom_input: true,
          context_hint: 'Safety checkpoint before final diagnosis.',
        },
        selected_options: [],
      };

      this.state = { ...stateForTurn, ...checkpointState };
      return checkpointState;
    }

    let questionGate: QuestionGateState | null = null;
    let responseOptions: ResponseOptions | null = null;

    if (conversationResult.lens_trigger) {
      responseOptions = null;
    } else if (conversationResult.needs_options || (conversationResult.status === 'active' && aiQuestion)) {
      const resolvedOptions = await this.resolveQuestionOptions(
        aiQuestion,
        baseAgentState,
        nextSoap,
        stateForTurn.profile
      );
      const alignedResolvedOptions = this.ensureOptionIntentAlignment(
        aiQuestion,
        resolvedOptions,
        stateForTurn.profile
      );

      questionGate =
        !HYBRID_CHAT_FIRST_MODE && ENABLE_STACKED_SYMPTOM_GATE
          ? this.buildStackedSymptomSurvey(aiQuestion, alignedResolvedOptions)
          : null;
      if (questionGate) {
        const firstSegment = questionGate.segments[0];
        const firstPrompt = firstSegment?.prompt || aiQuestion;
        doctorMessage = createDoctorMessage(
          firstPrompt,
          conversationResult.message.metadata?.statement
        );
        responseOptions = await this.resolveQuestionOptions(
          firstPrompt,
          baseAgentState,
          nextSoap,
          stateForTurn.profile
        );
        responseOptions = this.ensureOptionIntentAlignment(
          firstPrompt,
          responseOptions,
          stateForTurn.profile
        );
        responseOptions = this.buildAssistiveOptions(responseOptions, firstPrompt);
      } else {
        responseOptions = this.buildAssistiveOptions(alignedResolvedOptions, aiQuestion);
      }
    }

    nextConversation.push(doctorMessage);
    const nextAgentState = this.withDerivedFindingMemory(
      {
        ...baseAgentState,
        must_not_miss_checkpoint: autoComplete
          ? {
              required: false,
              status: incomingCheckpoint.status === 'cleared' ? 'cleared' : incomingCheckpoint.status,
              last_question: incomingCheckpoint.last_question,
              last_response: incomingCheckpoint.last_response,
              updated_at: Date.now(),
            }
          : incomingCheckpoint,
      },
      {
        ...stateForTurn,
        conversation: nextConversation,
        soap: nextSoap,
      }
    );
    const nextClerking = buildAutoClerking(
      stateForTurn.clerking,
      nextSoap,
      nextConversation,
      stateForTurn.profile
    );
    const nextStatus: ClinicalState['status'] = conversationResult.lens_trigger
      ? 'lens'
      : autoComplete
        ? 'complete'
        : conversationResult.status;
    const nextPillars = autoComplete
      ? buildClinicalPlan({
          ddx: conversationResult.ddx,
          soap: nextSoap,
          urgency: conversationResult.urgency,
          profile: stateForTurn.profile,
          contract: conversationResult.clinical_contract,
        })
      : stateForTurn.pillars;
    const resolvedQuestionGate = autoComplete ? null : questionGate;
    const resolvedResponseOptions = autoComplete
      ? null
      : this.enforceRuntimeOptionInvariant(
          responseOptions,
          nextConversation,
          resolvedQuestionGate,
          stateForTurn.profile
        );

    const newState: Partial<ClinicalState> = {
      conversation: nextConversation,
      soap: nextSoap,
      ddx: conversationResult.ddx,
      profile: stateForTurn.profile,
      clerking: nextClerking,
      agent_state: nextAgentState,
      urgency: conversationResult.urgency,
      probability: conversationResult.probability,
      thinking: conversationResult.thinking,
      status: nextStatus,
      pillars: nextPillars,
      question_gate: resolvedQuestionGate,
      response_options: resolvedResponseOptions,
      selected_options: [],
    };

    this.state = { ...stateForTurn, ...newState };
    return newState;
  }

  private async processGatedAnswer(answerText: string): Promise<Partial<ClinicalState>> {
    const gate = this.state.question_gate;
    if (!gate || !gate.active) {
      return this.processPatientInput(answerText);
    }

    const currentSegment = gate.segments[gate.current_index];
    if (!currentSegment) {
      this.state = { ...this.state, question_gate: null };
      return this.processPatientInput(answerText);
    }

    const patientMessage = createPatientMessage(answerText);
    const profileForTurn = this.resolveProfileForInput(answerText);
    const nextAnswers = [
      ...gate.answers,
      {
        segment_id: currentSegment.id,
        prompt: currentSegment.prompt,
        response: answerText,
      },
    ];

    if (gate.kind === 'safety_checkpoint') {
      return this.processSafetyCheckpointAnswer(
        answerText,
        gate,
        nextAnswers,
        patientMessage,
        profileForTurn
      );
    }

    if (gate.kind === 'presenting_complaints') {
      const normalizedAnswer = answerText.trim().toLowerCase();
      const currentId = currentSegment.id;
      const maxAdditional = gate.max_additional || PRESENTING_COMPLAINT_MAX_ADDITIONAL;
      const additionalCount = gate.additional_count || 0;

      if (/^other_confirm_\d+$/i.test(currentId)) {
        const wantsMore = this.isAffirmativeAnswer(normalizedAnswer);
        const stopLoop = this.isNegativeOrUncertainAnswer(normalizedAnswer) || !wantsMore;

        if (stopLoop || additionalCount >= maxAdditional) {
          const stackedInput = this.buildPresentingComplaintsSummary(nextAnswers);
          return this.finalizeGateToConversation(stackedInput, patientMessage, profileForTurn);
        }

        const ordinal = additionalCount + 1;
        const dynamicSegments = [
          {
            id: `other_detail_${ordinal}`,
            prompt: 'What is the other complaint?',
            input_mode: 'freeform' as const,
          },
          {
            id: `other_duration_${ordinal}`,
            prompt: 'How long has this complaint been present?',
          },
          {
            id: `other_confirm_${ordinal + 1}`,
            prompt: 'Any other complaint right now?',
            timeout_seconds: PRESENTING_COMPLAINT_BINARY_TIMEOUT_SECONDS,
          },
        ];
        const nextGate: QuestionGateState = {
          ...gate,
          answers: nextAnswers,
          additional_count: ordinal,
          segments: [
            ...gate.segments.slice(0, gate.current_index + 1),
            ...dynamicSegments,
            ...gate.segments.slice(gate.current_index + 1),
          ],
        };
        return this.stageNextGateStep(nextGate, gate.current_index + 1, patientMessage, profileForTurn);
      }

      if (/^other_detail_\d+$/i.test(currentId)) {
        const ordinal = Number(currentId.split('_').pop() || '0');
        const inferredDuration = this.extractDurationPhrase(answerText);
        if (inferredDuration) {
          const durationSegmentId = `other_duration_${ordinal}`;
          const nextDurationSegment = gate.segments[gate.current_index + 1];
          if (nextDurationSegment?.id === durationSegmentId) {
            const autoDurationAnswers = [
              ...nextAnswers,
              {
                segment_id: durationSegmentId,
                prompt: nextDurationSegment.prompt,
                response: inferredDuration,
              },
            ];
            const nextGate: QuestionGateState = {
              ...gate,
              answers: autoDurationAnswers,
            };
            const nextIndex = Math.min(gate.current_index + 2, gate.segments.length - 1);
            return this.stageNextGateStep(nextGate, nextIndex, patientMessage, profileForTurn);
          }
        }
      }
    }

    if (gate.kind === 'stacked_symptom') {
      if (currentSegment.id === 'dominant_cluster') {
        const cluster = this.resolveSymptomCluster(answerText);
        const detailPrompt = this.getClusterDetailPrompt(cluster);
        if (!detailPrompt) {
          const nextGate: QuestionGateState = {
            ...gate,
            answers: nextAnswers,
          };
          return this.stageNextGateStep(nextGate, gate.current_index + 1, patientMessage, profileForTurn);
        }

        const dynamicSegments: QuestionGateState['segments'] = [
          {
            id: `cluster_detail_${cluster}`,
            prompt: detailPrompt,
          },
        ];
        if (cluster === 'fever') {
          dynamicSegments.push(
            {
              id: 'fever_cycle_pattern',
              prompt: 'Do episodes start with evening chills, rise at night, then ease by morning?',
              timeout_seconds: STACKED_BINARY_TIMEOUT_SECONDS,
            },
            {
              id: 'mosquito_exposure',
              prompt: 'Any recent mosquito exposure or sleeping without mosquito protection?',
              timeout_seconds: STACKED_BINARY_TIMEOUT_SECONDS,
            }
          );
        }
        const nextGate: QuestionGateState = {
          ...gate,
          answers: nextAnswers,
          segments: [
            ...gate.segments.slice(0, gate.current_index + 1),
            ...dynamicSegments,
            ...gate.segments.slice(gate.current_index + 1),
          ],
        };
        return this.stageNextGateStep(nextGate, gate.current_index + 1, patientMessage, profileForTurn);
      }
    }

    const isLastSegment = gate.current_index >= gate.segments.length - 1;

    if (!isLastSegment) {
      const nextGate: QuestionGateState = {
        ...gate,
        answers: nextAnswers,
      };
      return this.stageNextGateStep(nextGate, gate.current_index + 1, patientMessage, profileForTurn);
    }

    const stackedInput = gate.kind === 'presenting_complaints'
      ? this.buildPresentingComplaintsSummary(nextAnswers)
      : [
          'Stacked symptom survey summary:',
          ...nextAnswers.map((answer, idx) => `${idx + 1}. ${answer.prompt} ${answer.response}`),
        ].join('\n');

    return this.finalizeGateToConversation(stackedInput, patientMessage, profileForTurn);
  }

  private async resolveQuestionOptions(
    question: string,
    agentState: ClinicalState['agent_state'],
    currentSOAP: ClinicalState['soap'],
    profile: ClinicalState['profile']
  ): Promise<ResponseOptions> {
    const localFallback = buildLocalOptions(question, profile);
    const structuredQuestion = isStructuredLocalQuestion(question);
    try {
      const aiOptions = await generateResponseOptions(question, agentState, currentSOAP);
      const alignedOptions = this.ensureOptionIntentAlignment(question, aiOptions, profile);
      if (!isOptionSetRelevant(question, alignedOptions)) {
        return this.ensureOptionIntentAlignment(question, localFallback, profile);
      }
      if (structuredQuestion && alignedOptions.options.length === 0) {
        return this.ensureOptionIntentAlignment(question, localFallback, profile);
      }
      return alignedOptions;
    } catch (error) {
      console.error('Option resolution fallback:', error);
      return this.ensureOptionIntentAlignment(question, localFallback, profile);
    }
  }

  private buildAssistiveOptions(
    responseOptions: ResponseOptions,
    question: string
  ): ResponseOptions {
    const normalizedQuestion = question.toLowerCase();
    const isSafetyQuestion = SAFETY_CHECK_QUESTION_PATTERN.test(normalizedQuestion);
    const preserveAllChoices =
      isSafetyQuestion ||
      responseOptions.mode === 'multiple' ||
      responseOptions.ui_variant === 'scale' ||
      responseOptions.ui_variant === 'ladder' ||
      responseOptions.options.length <= ASSISTIVE_OPTION_SOFT_CAP;

    if (preserveAllChoices) {
      return {
        ...responseOptions,
        allow_custom_input: true,
      };
    }

    const anchorChoices = responseOptions.options.filter((option) =>
      /\bnone\b|\bnot sure\b|\bunsure\b|\bother\b/i.test(option.text)
    );
    const selectedAnchors: ResponseOptions['options'] = [];
    for (const choice of anchorChoices) {
      if (selectedAnchors.some((entry) => entry.id === choice.id)) continue;
      selectedAnchors.push(choice);
      if (selectedAnchors.length >= 1) break;
    }

    const remaining = responseOptions.options.filter(
      (option) => !selectedAnchors.some((anchor) => anchor.id === option.id)
    );
    const primaryChoices = remaining.slice(
      0,
      Math.max(1, ASSISTIVE_OPTION_SOFT_CAP - selectedAnchors.length)
    );
    const capped = [...primaryChoices, ...selectedAnchors];

    return {
      ...responseOptions,
      options: capped,
      allow_custom_input: true,
      context_hint:
        responseOptions.context_hint || 'Quick suggestions. You can also type your response.',
    };
  }

  private hasSingleQuestion(question: string): boolean {
    const normalized = (question || '').trim();
    if (!normalized) return false;
    const marks = normalized.match(/\?/g) || [];
    return marks.length === 1 && normalized.endsWith('?');
  }

  private detectQuestionIntent(question: string): QuestionIntent | null {
    const normalized = (question || '').trim();
    if (!normalized) return null;
    const priorityOrder: QuestionIntent[] = [
      'danger_signs',
      'summary',
      'duration',
      'pattern',
      'most_limiting',
      'symptom_change',
      'yes_no',
    ];
    for (const intent of priorityOrder) {
      if (QUESTION_INTENT_PATTERNS[intent].test(normalized)) return intent;
    }
    return null;
  }

  private getQuestionIntentOrder(intent: QuestionIntent | null): number {
    if (!intent) return 0;
    return QUESTION_INTENT_ORDER[intent] || 0;
  }

  private detectOptionIntent(options: ResponseOptions | null): OptionIntent {
    if (!options || !Array.isArray(options.options)) return null;
    const textBlob = options.options.map((option) => (option.text || '').toLowerCase()).join(' | ');
    if (OPTION_INTENT_HINT_PATTERNS.danger_signs.test(textBlob)) return 'danger_signs';
    if (OPTION_INTENT_HINT_PATTERNS.timeline.test(textBlob)) return 'timeline';
    if (OPTION_INTENT_HINT_PATTERNS.summary.test(textBlob)) return 'summary';
    if (OPTION_INTENT_HINT_PATTERNS.yes_no.test(textBlob)) return 'yes_no';
    return null;
  }

  private hasAnsweredIntent(
    conversation: ClinicalState['conversation'],
    intent: QuestionIntent
  ): boolean {
    return this.hasRecentlyAnsweredIntent(conversation, QUESTION_INTENT_PATTERNS[intent], 40);
  }

  private getMaxIntentOrder(conversation: ClinicalState['conversation']): number {
    let maxOrder = 0;
    const window = conversation.slice(-24);
    for (const entry of window) {
      if (entry.role !== 'doctor') continue;
      const askedQuestion = (entry.metadata?.question || entry.content || '').trim();
      const intent = this.detectQuestionIntent(askedQuestion);
      const order = this.getQuestionIntentOrder(intent);
      if (order > maxOrder) maxOrder = order;
    }
    return maxOrder;
  }

  private getProgressiveInvariantFallback(
    phase: ClinicalState['agent_state']['phase'],
    conversation: ClinicalState['conversation']
  ): string {
    if (this.hasSummaryReadySignal(conversation)) {
      if (!this.hasRecentlyAnsweredIntent(conversation, DANGER_SIGNS_QUESTION_PATTERN, 28)) {
        return FINAL_SAFETY_PROMPT;
      }
      return SUMMARY_FINALIZE_PROMPT;
    }

    const sequence: Array<{ intent: QuestionIntent; question: string }> = [
      { intent: 'most_limiting', question: 'Which one symptom is most limiting right now?' },
      { intent: 'symptom_change', question: 'How has that symptom changed since it began?' },
      { intent: 'pattern', question: 'What pattern do you notice most: day, night, intermittent, or constant?' },
      {
        intent: 'danger_signs',
        question:
          'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
      },
      { intent: 'summary', question: SUMMARY_FINALIZE_PROMPT },
    ];

    for (const step of sequence) {
      if (!this.hasAnsweredIntent(conversation, step.intent)) {
        return step.question;
      }
    }

    return this.getContextAwareFallbackQuestion(phase, conversation) || SUMMARY_FINALIZE_PROMPT;
  }

  private enforceTurnInvariantQuestion(
    question: string,
    phase: ClinicalState['agent_state']['phase'],
    conversation: ClinicalState['conversation']
  ): string {
    const sanitized = sanitizeQuestion(question) || getFallbackQuestion();
    const intent = this.detectQuestionIntent(sanitized);
    const maxObservedOrder = this.getMaxIntentOrder(conversation);
    const intentOrder = this.getQuestionIntentOrder(intent);
    const summaryReady = this.hasSummaryReadySignal(conversation);

    if (!this.hasSingleQuestion(sanitized)) {
      recordInvariantEvent('single_question_enforced', sanitized.slice(0, 140));
      return this.getProgressiveInvariantFallback(phase, conversation);
    }

    if (summaryReady && intent !== 'danger_signs' && intent !== 'summary') {
      if (!this.hasRecentlyAnsweredIntent(conversation, DANGER_SIGNS_QUESTION_PATTERN, 28)) {
        return FINAL_SAFETY_PROMPT;
      }
      return SUMMARY_FINALIZE_PROMPT;
    }

    if (intent && !REPEAT_INTENT_EXEMPT.has(intent) && this.hasAnsweredIntent(conversation, intent)) {
      recordInvariantEvent('intent_repeat_blocked', `${intent}:${sanitized.slice(0, 120)}`);
      return this.getProgressiveInvariantFallback(phase, conversation);
    }

    const terminalStatus = this.state.status === 'complete' || this.state.status === 'emergency';
    if (intentOrder > 0 && intentOrder + 1 < maxObservedOrder && !terminalStatus) {
      recordInvariantEvent('intent_progression_corrected', `${intent || 'unknown'}:${sanitized.slice(0, 120)}`);
      return this.getProgressiveInvariantFallback(phase, conversation);
    }

    if (summaryReady && intent === 'summary') {
      if (!this.hasRecentlyAnsweredIntent(conversation, DANGER_SIGNS_QUESTION_PATTERN, 28)) {
        return FINAL_SAFETY_PROMPT;
      }
      return SUMMARY_FINALIZE_PROMPT;
    }

    return sanitized;
  }

  private ensureOptionIntentAlignment(
    question: string,
    responseOptions: ResponseOptions,
    profile: ClinicalState['profile']
  ): ResponseOptions {
    const questionIntent = this.detectQuestionIntent(question);
    const optionIntent = this.detectOptionIntent(responseOptions);
    if (!questionIntent) return responseOptions;

    let mismatch = false;
    if (questionIntent === 'danger_signs') {
      mismatch = Boolean(optionIntent && optionIntent !== 'danger_signs' && optionIntent !== 'yes_no');
    } else if (questionIntent === 'duration') {
      mismatch = Boolean(optionIntent && optionIntent !== 'timeline');
    } else if (questionIntent === 'yes_no') {
      mismatch = Boolean(optionIntent && !['yes_no', 'danger_signs'].includes(optionIntent));
    } else if (questionIntent === 'summary') {
      mismatch = Boolean(optionIntent && !['summary', 'yes_no'].includes(optionIntent));
    }

    if (!mismatch) return responseOptions;
    return buildLocalOptions(question, profile);
  }

  private isOptionIntentMismatch(question: string, responseOptions: ResponseOptions): boolean {
    const questionIntent = this.detectQuestionIntent(question);
    if (!questionIntent) return false;
    const optionIntent = this.detectOptionIntent(responseOptions);
    if (!optionIntent) {
      return (
        questionIntent === 'danger_signs' ||
        questionIntent === 'duration' ||
        questionIntent === 'yes_no' ||
        questionIntent === 'summary'
      );
    }

    if (questionIntent === 'danger_signs') {
      return optionIntent !== 'danger_signs' && optionIntent !== 'yes_no';
    }
    if (questionIntent === 'duration') {
      return optionIntent !== 'timeline';
    }
    if (questionIntent === 'yes_no') {
      return optionIntent !== 'yes_no' && optionIntent !== 'danger_signs';
    }
    if (questionIntent === 'summary') {
      return optionIntent !== 'summary' && optionIntent !== 'yes_no';
    }
    return false;
  }

  private buildStrictOptionContractOptions(
    question: string,
    profile: ClinicalState['profile'],
    questionIntent: QuestionIntent | null
  ): ResponseOptions {
    if (questionIntent === 'duration') {
      return {
        mode: 'single',
        ui_variant: 'stack',
        options: [
          { id: 'today', text: 'Started today' },
          { id: 'd1-2', text: '1-2 days ago' },
          { id: 'd3-4', text: '3-4 days ago' },
          { id: 'd5-7', text: '5-7 days ago' },
        ],
        allow_custom_input: true,
        context_hint: 'Choose when symptoms began.',
      };
    }
    if (questionIntent === 'danger_signs') {
      return {
        mode: 'single',
        ui_variant: 'grid',
        options: [
          { id: 'none', text: 'None of these' },
          { id: 'breathless', text: 'Breathlessness' },
          { id: 'confusion', text: 'Confusion' },
          { id: 'chest', text: 'Chest pain' },
          { id: 'vomiting', text: 'Persistent vomiting' },
          { id: 'bleeding', text: 'Bleeding' },
        ],
        allow_custom_input: true,
        context_hint: 'Select any danger sign, or choose none.',
      };
    }
    if (questionIntent === 'summary') {
      return {
        mode: 'single',
        ui_variant: 'segmented',
        options: [
          { id: 'summary-ready', text: 'Ready for summary', category: 'summary' },
          { id: 'summary-add-detail', text: 'Add one detail', category: 'summary' },
          { id: 'summary-not-sure', text: 'Not sure', category: 'summary' },
        ],
        allow_custom_input: true,
        context_hint: 'Choose to summarize now or add one last detail.',
      };
    }
    if (questionIntent === 'yes_no') {
      return {
        mode: 'single',
        ui_variant: 'segmented',
        options: [
          { id: 'yes', text: 'Yes' },
          { id: 'no', text: 'No' },
          { id: 'unsure', text: 'Not sure' },
        ],
        allow_custom_input: true,
        context_hint: 'Yes or No.',
      };
    }
    return buildLocalOptions(question, profile);
  }

  private getOptionContractTurnTag(): string {
    return this.interactionTurn > 0 ? `turn:${this.interactionTurn}` : 'turn:sync';
  }

  private getLatestDoctorQuestion(conversation: ClinicalState['conversation']): string {
    for (let i = conversation.length - 1; i >= 0; i -= 1) {
      const entry = conversation[i];
      if (entry.role !== 'doctor') continue;
      const candidate = (entry.metadata?.question || entry.content || '').trim();
      if (candidate) return candidate;
    }
    return '';
  }

  private getActiveGatePrompt(gate: QuestionGateState | null | undefined): string {
    if (!gate || !gate.active) return '';
    const segment = gate.segments[gate.current_index];
    const prompt = (segment?.prompt || gate.source_question || '').trim();
    return prompt;
  }

  private enforceRuntimeOptionInvariant(
    responseOptions: ResponseOptions | null,
    conversation: ClinicalState['conversation'],
    gate: QuestionGateState | null | undefined,
    profile: ClinicalState['profile']
  ): ResponseOptions | null {
    if (!responseOptions) return null;
    const activePrompt = this.getActiveGatePrompt(gate);
    const latestQuestion = activePrompt || this.getLatestDoctorQuestion(conversation);
    if (!latestQuestion) return responseOptions;

    const questionIntent = this.detectQuestionIntent(latestQuestion);
    const questionIntentLabel = questionIntent || 'none';
    const incomingOptionIntent = this.detectOptionIntent(responseOptions) || 'none';
    const turnTag = this.getOptionContractTurnTag();
    const aligned = this.ensureOptionIntentAlignment(latestQuestion, responseOptions, profile);
    if (aligned !== responseOptions) {
      const alignedOptionIntent = this.detectOptionIntent(aligned) || 'none';
      recordInvariantEvent(
        'options_corrected',
        `aligned:${questionIntentLabel}:${incomingOptionIntent}->${alignedOptionIntent}`
      );
      recordInvariantEvent(
        'option_contract_enforced',
        `${turnTag}:aligned:${questionIntentLabel}:${incomingOptionIntent}->${alignedOptionIntent}`
      );
    }
    if (!this.isOptionIntentMismatch(latestQuestion, aligned)) {
      return aligned;
    }

    const fallback = buildLocalOptions(latestQuestion, profile);
    const fallbackOptionIntent = this.detectOptionIntent(fallback) || 'none';
    recordInvariantEvent(
      'options_corrected',
      `fallback:${questionIntentLabel}:${this.detectOptionIntent(aligned) || 'none'}->${fallbackOptionIntent}`
    );
    if (!this.isOptionIntentMismatch(latestQuestion, fallback)) {
      recordInvariantEvent(
        'option_contract_enforced',
        `${turnTag}:fallback:${questionIntentLabel}:${this.detectOptionIntent(aligned) || 'none'}->${fallbackOptionIntent}`
      );
      return fallback;
    }

    const strictFallback = STRICT_OPTION_CONTRACT_MODE
      ? this.buildStrictOptionContractOptions(latestQuestion, profile, questionIntent)
      : fallback;
    const strictFallbackIntent = this.detectOptionIntent(strictFallback) || 'none';

    if (!this.isOptionIntentMismatch(latestQuestion, strictFallback)) {
      recordInvariantEvent(
        'option_contract_enforced',
        `${turnTag}:strict:${questionIntentLabel}:${fallbackOptionIntent}->${strictFallbackIntent}`
      );
      return strictFallback;
    }

    recordInvariantEvent(
      'option_contract_failed',
      `${turnTag}:strict:${questionIntentLabel}:${fallbackOptionIntent}->${strictFallbackIntent}`
    );
    return strictFallback;
  }

  private ensureProgressiveQuestion(
    question: string,
    conversation: ClinicalState['conversation'],
    phase: ClinicalState['agent_state']['phase']
  ): string {
    const sanitized = sanitizeQuestion(question) || getFallbackQuestion();
    const hardBlockIntentRepeat = this.shouldHardBlockIntentRepeat(sanitized, conversation);
    const immediateRepeat = this.isImmediateRepeatedIntent(sanitized, conversation);
    const loopRisk = this.hasRecentIntentLoopRisk(sanitized, conversation);
    const recentQuestions = getRecentDoctorQuestions(conversation, 8);
    const lastQuestion = recentQuestions[recentQuestions.length - 1];
    const fallbackReasons: string[] = [];
    if (hardBlockIntentRepeat) fallbackReasons.push('hard_repeat');
    if (immediateRepeat) fallbackReasons.push('immediate_repeat');
    if (loopRisk) fallbackReasons.push('loop_risk');
    if (isLikelyRepeatedQuestion(sanitized, recentQuestions)) fallbackReasons.push('near_duplicate');
    if (isLikelyAnsweredTopicQuestion(sanitized, conversation)) fallbackReasons.push('answered_topic');
    if (isRecentlyAnsweredQuestionIntent(sanitized, conversation)) fallbackReasons.push('answered_intent');
    if (isLoopingGenericPrompt(sanitized, conversation)) fallbackReasons.push('generic_loop');
    if (this.isNearDuplicateQuestion(sanitized, lastQuestion)) fallbackReasons.push('duplicate_last');
    const shouldFallback =
      hardBlockIntentRepeat ||
      immediateRepeat ||
      loopRisk ||
      fallbackReasons.includes('near_duplicate') ||
      fallbackReasons.includes('answered_topic') ||
      fallbackReasons.includes('answered_intent') ||
      fallbackReasons.includes('generic_loop') ||
      fallbackReasons.includes('duplicate_last');
    if (!shouldFallback) {
      return this.enforceTurnInvariantQuestion(sanitized, phase, conversation);
    }
    recordInvariantEvent(
      'duplicate_question_blocked',
      `${fallbackReasons.join(',') || 'fallback'}:${sanitized.slice(0, 120)}`
    );
    const contextualFallback = this.getContextAwareFallbackQuestion(phase, conversation);
    const candidate =
      contextualFallback || getPhaseFallbackQuestion(phase, conversation.length, recentQuestions);
    if (this.isNearDuplicateQuestion(candidate, lastQuestion)) {
      return this.enforceTurnInvariantQuestion(
        this.getProgressiveInvariantFallback(phase, conversation),
        phase,
        conversation
      );
    }
    return this.enforceTurnInvariantQuestion(candidate, phase, conversation);
  }

  private normalizeQuestionFingerprint(question: string): string {
    return question
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isNearDuplicateQuestion(question: string, referenceQuestion?: string): boolean {
    if (!referenceQuestion) return false;
    const next = this.normalizeQuestionFingerprint(question);
    const prev = this.normalizeQuestionFingerprint(referenceQuestion);
    if (!next || !prev) return false;
    if (next === prev) return true;
    if (next.includes(prev) || prev.includes(next)) return true;
    if (
      PATTERN_QUESTION_PATTERN.test(next) &&
      PATTERN_QUESTION_PATTERN.test(prev)
    ) {
      return true;
    }
    if (
      DANGER_SIGNS_QUESTION_PATTERN.test(next) &&
      DANGER_SIGNS_QUESTION_PATTERN.test(prev)
    ) {
      return true;
    }
    if (
      MOST_LIMITING_QUESTION_PATTERN.test(next) &&
      MOST_LIMITING_QUESTION_PATTERN.test(prev)
    ) {
      return true;
    }
    if (
      SYMPTOM_CHANGE_QUESTION_PATTERN.test(next) &&
      SYMPTOM_CHANGE_QUESTION_PATTERN.test(prev)
    ) {
      return true;
    }
    return false;
  }

  private getContextAwareFallbackQuestion(
    phase: ClinicalState['agent_state']['phase'],
    conversation: ClinicalState['conversation']
  ): string | null {
    const patientMentions = conversation
      .filter((entry) => entry.role === 'patient')
      .map((entry) => entry.content.toLowerCase())
      .slice(-6)
      .join(' ');

    if (/\bnone stand out|nothing stands out|no other symptom\b/.test(patientMentions)) {
      if (/\bcough\b/.test(patientMentions) && /\bchest pain\b/.test(patientMentions)) {
        return 'Is the chest pain worse with deep breathing, cough, movement, or unchanged?';
      }
      if (/\bcough\b/.test(patientMentions)) {
        return 'With your cough, are you also having sputum, wheeze, or shortness of breath?';
      }
      if (/\bfever\b/.test(patientMentions)) {
        if (!this.hasRecentlyAnsweredIntent(conversation, PATTERN_QUESTION_PATTERN, 24)) {
          return 'Do fever episodes come in cycles (evening chills, night spike, morning relief) or stay constant?';
        }
        if (!this.hasRecentlyAnsweredIntent(conversation, DANGER_SIGNS_QUESTION_PATTERN, 24)) {
          return 'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?';
        }
        return this.buildDifferentialProgressQuestion(conversation);
      }
      return phase === 'differential'
        ? this.buildDifferentialProgressQuestion(conversation)
        : 'What is the one symptom worrying you most right now?';
    }

    if (phase === 'differential') {
      return this.buildDifferentialProgressQuestion(conversation);
    }

    const recentQuestions = getRecentDoctorQuestions(conversation, 8);
    return getPhaseFallbackQuestion(phase, conversation.length, recentQuestions);
  }

  private buildDifferentialProgressQuestion(
    conversation: ClinicalState['conversation']
  ): string {
    const sequence: Array<{ pattern: RegExp; question: string }> = [
      {
        pattern: MOST_LIMITING_QUESTION_PATTERN,
        question: 'Which one symptom is most limiting right now?',
      },
      {
        pattern: SYMPTOM_CHANGE_QUESTION_PATTERN,
        question: 'How has that symptom changed since it began?',
      },
      {
        pattern: PATTERN_QUESTION_PATTERN,
        question: 'What pattern do you notice most: day, night, intermittent, or constant?',
      },
      {
        pattern: DANGER_SIGNS_QUESTION_PATTERN,
        question:
          'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
      },
    ];

    for (const step of sequence) {
      if (!this.hasRecentlyAnsweredIntent(conversation, step.pattern, 24)) {
        return step.question;
      }
    }

    return 'I can summarize now. Would you like your working diagnosis and plan?';
  }

  private shouldHardBlockIntentRepeat(
    question: string,
    conversation: ClinicalState['conversation']
  ): boolean {
    if (SUMMARY_CLARIFY_QUESTION_PATTERN.test(question)) {
      return this.hasRecentlyAnsweredIntent(conversation, SUMMARY_CLARIFY_QUESTION_PATTERN, 24);
    }
    if (PATTERN_QUESTION_PATTERN.test(question)) {
      return this.hasRecentlyAnsweredIntent(conversation, PATTERN_QUESTION_PATTERN, 24);
    }
    if (DANGER_SIGNS_QUESTION_PATTERN.test(question)) {
      return this.hasRecentlyAnsweredIntent(conversation, DANGER_SIGNS_QUESTION_PATTERN, 24);
    }
    if (MOST_LIMITING_QUESTION_PATTERN.test(question)) {
      return this.hasRecentlyAnsweredIntent(conversation, MOST_LIMITING_QUESTION_PATTERN, 24);
    }
    if (SYMPTOM_CHANGE_QUESTION_PATTERN.test(question)) {
      return this.hasRecentlyAnsweredIntent(conversation, SYMPTOM_CHANGE_QUESTION_PATTERN, 24);
    }
    return false;
  }

  private isImmediateRepeatedIntent(
    question: string,
    conversation: ClinicalState['conversation']
  ): boolean {
    const intent = this.detectQuestionIntent(question);
    if (!intent || REPEAT_INTENT_EXEMPT.has(intent)) return false;

    for (let i = conversation.length - 1; i >= 0; i -= 1) {
      const entry = conversation[i];
      if (entry.role !== 'doctor') continue;
      const lastAskedQuestion = (entry.metadata?.question || entry.content || '').trim();
      if (!lastAskedQuestion) return false;
      const lastIntent = this.detectQuestionIntent(lastAskedQuestion);
      const sameIntent = lastIntent === intent;
      const sameQuestion = this.isNearDuplicateQuestion(question, lastAskedQuestion);
      if (!sameIntent && !sameQuestion) return false;

      for (let j = i + 1; j < conversation.length; j += 1) {
        const followup = conversation[j];
        if (followup.role === 'doctor') break;
        if (
          followup.role === 'patient' &&
          this.isSubstantivePatientResponse(followup.content || '')
        ) {
          return true;
        }
      }
      return false;
    }

    return false;
  }

  private hasRecentIntentLoopRisk(
    question: string,
    conversation: ClinicalState['conversation']
  ): boolean {
    const intent = this.detectQuestionIntent(question);
    if (!intent || REPEAT_INTENT_EXEMPT.has(intent)) return false;
    if (!this.hasAnsweredIntent(conversation, intent)) return false;

    const recentDoctorIntents = conversation
      .slice(-14)
      .filter((entry) => entry.role === 'doctor')
      .map((entry) => this.detectQuestionIntent((entry.metadata?.question || entry.content || '').trim()))
      .filter((value): value is QuestionIntent => Boolean(value));

    const occurrences = recentDoctorIntents.filter((value) => value === intent).length;
    return occurrences >= 2;
  }

  private hasRecentlyAnsweredIntent(
    conversation: ClinicalState['conversation'],
    intentPattern: RegExp,
    lookback = 40
  ): boolean {
    const window = conversation.slice(-lookback);
    for (let i = window.length - 1; i >= 0; i -= 1) {
      const entry = window[i];
      if (entry.role !== 'doctor') continue;
      const askedQuestion = (entry.metadata?.question || entry.content || '').trim();
      if (!intentPattern.test(askedQuestion)) continue;

      for (let j = i + 1; j < window.length; j += 1) {
        const followup = window[j];
        if (followup.role === 'doctor') break;
        if (
          followup.role === 'patient' &&
          this.isSubstantivePatientResponse(followup.content || '')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private isSubstantivePatientResponse(response: string): boolean {
    const normalized = response.trim();
    if (!normalized) return false;
    if (UNSURE_ANSWER_PATTERN.test(normalized)) return false;
    if (NON_SUBSTANTIVE_PATIENT_RESPONSE_PATTERN.test(normalized)) return false;
    return /[a-z0-9]/i.test(normalized);
  }

  private resolveSymptomCluster(answerText: string): 'fever' | 'head_pain' | 'airway' | 'gut' | 'general' | 'none' {
    const normalized = answerText.toLowerCase();
    if (/fever|chill|rigor|sweat|night|intermittent/.test(normalized)) return 'fever';
    if (/head|pain|ache|eye/.test(normalized)) return 'head_pain';
    if (/cough|throat|airway|catarrh|nose|breath/.test(normalized)) return 'airway';
    if (/stomach|gut|abdominal|nausea|vomit|diarrh|appetite|taste/.test(normalized)) return 'gut';
    if (/none/.test(normalized)) return 'none';
    if (/fatigue|weak|general|energy|stress/.test(normalized)) return 'general';
    return 'general';
  }

  private getClusterDetailPrompt(cluster: 'fever' | 'head_pain' | 'airway' | 'gut' | 'general' | 'none'): string | null {
    if (cluster === 'fever') return FEVER_PATTERN_DETAIL_PROMPT;
    if (cluster === 'head_pain') return HEAD_PAIN_DETAIL_PROMPT;
    if (cluster === 'airway') return AIRWAY_DETAIL_PROMPT;
    if (cluster === 'gut') return GUT_DETAIL_PROMPT;
    if (cluster === 'general') return GENERAL_DETAIL_PROMPT;
    return null;
  }

  private shouldCreateStackedSymptomSurvey(
    question: string,
    responseOptions: ResponseOptions
  ): boolean {
    if (responseOptions.mode !== 'single') return false;
    if (responseOptions.options.length < OPTION_STACK_MIN_CHOICES) return false;

    const prompt = question.toLowerCase();
    if (!STACKED_SYMPTOM_SURVEY_PATTERN.test(prompt)) return false;

    const optionTexts = responseOptions.options.map((option) => option.text.toLowerCase());
    const symptomSignals = optionTexts.filter((text) => SYMPTOM_SURVEY_SIGNAL_PATTERN.test(text)).length;
    return symptomSignals >= 4;
  }

  private buildStackedSymptomSurvey(
    question: string,
    responseOptions: ResponseOptions
  ): QuestionGateState | null {
    if (!this.shouldCreateStackedSymptomSurvey(question, responseOptions)) {
      return null;
    }

    return {
      active: true,
      kind: 'stacked_symptom',
      source_question: question,
      segments: [
        { id: 'dominant_cluster', prompt: SYMPTOM_CLUSTER_PROMPT },
        {
          id: 'onset_48h',
          prompt: 'Did this standout symptom begin within the last 48 hours?',
          timeout_seconds: STACKED_BINARY_TIMEOUT_SECONDS,
        },
        {
          id: 'worsening',
          prompt: 'Has this standout symptom clearly worsened since it started?',
          timeout_seconds: STACKED_BINARY_TIMEOUT_SECONDS,
        },
      ],
      current_index: 0,
      answers: [],
    };
  }

  private getRecoveryQuestion(phase: ClinicalState['agent_state']['phase']): string {
    return getPhaseFallbackQuestion(
      phase,
      this.state.conversation.length,
      getRecentDoctorQuestions(this.state.conversation, 8)
    );
  }

  private shouldAutoCompleteEncounter(
    status: ClinicalState['status'],
    ddx: string[],
    probability: number,
    soap: ClinicalState['soap'],
    conversation: ClinicalState['conversation']
  ): boolean {
    if (status === 'complete') return true;
    if (status === 'emergency' || status === 'lens') return false;

    const patientTurns = conversation.filter((entry) => entry.role === 'patient').length;
    if (patientTurns < 2) return false;

    const leadRaw = (ddx[0] || '').toLowerCase();
    const secondRaw = (ddx[1] || '').toLowerCase();
    const leadDx = leadRaw.replace(/\s*\(icd-10:\s*[a-z0-9.-]+\)\s*/gi, '').trim();
    const secondDx = secondRaw.replace(/\s*\(icd-10:\s*[a-z0-9.-]+\)\s*/gi, '').trim();
    const hasIcd10Lead = /\(icd-10:\s*[a-z0-9.-]+\)/i.test(ddx[0] || '');
    const subjective = JSON.stringify(soap.S || {}).toLowerCase();
    const narrative = conversation
      .filter((entry) => entry.role === 'patient')
      .map((entry) => entry.content || '')
      .join(' ')
      .toLowerCase();
    const evidenceCorpus = `${subjective} ${narrative}`;
    const subjectiveDensity = Object.keys(soap.S || {}).length;
    const supportSignals = [
      /fever|pyrexia|temperature/.test(evidenceCorpus),
      /chills?|rigors?/.test(evidenceCorpus),
      /headache|retro[-\s]?orbital|behind (my )?eyes?/.test(evidenceCorpus),
      /body aches?|myalgia|weak(ness)?/.test(evidenceCorpus),
      /nausea|vomit/.test(evidenceCorpus),
      /cough|breathless|shortness of breath/.test(evidenceCorpus),
      /abdominal pain|diarrh|dysuria/.test(evidenceCorpus),
    ].filter(Boolean).length;
    const malariaPatternSignals = [
      /intermittent|cyclic|cycles|comes and goes|on and off/.test(evidenceCorpus),
      /night|nocturnal|worse at night|evening chills/.test(evidenceCorpus),
      /morning relief|morning off|better in the morning/.test(evidenceCorpus),
      /mosquito|sleeping without net|insect bites?|high mosquito exposure/.test(evidenceCorpus),
    ].filter(Boolean).length;
    const leadClearOfSecond = !secondDx || leadDx !== secondDx;
    const isMalariaLead = leadDx.includes('malaria');
    const malariaFastTrack =
      isMalariaLead &&
      supportSignals >= 3 &&
      malariaPatternSignals >= 2 &&
      probability >= 76 &&
      hasIcd10Lead;
    const highCertaintyGeneral =
      probability >= 84 &&
      hasIcd10Lead &&
      leadClearOfSecond &&
      patientTurns >= 3 &&
      subjectiveDensity >= 4 &&
      supportSignals >= 3;
    const summaryReady = this.hasSummaryReadySignal(conversation);
    const dangerSignsCovered =
      this.hasRecentlyAnsweredIntent(conversation, DANGER_SIGNS_QUESTION_PATTERN, 28) ||
      /no immediate danger signs|no danger signs|none of these/.test(evidenceCorpus);
    const hasLeadDiagnosis = Boolean(leadDx);
    const summaryFastTrack =
      summaryReady &&
      hasLeadDiagnosis &&
      patientTurns >= 4 &&
      dangerSignsCovered;

    return malariaFastTrack || highCertaintyGeneral || summaryFastTrack;
  }

  private isSummaryReadyInput(input: string): boolean {
    const normalized = input.trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (!normalized) return false;
    return SUMMARY_READY_RESPONSE_PATTERN.test(normalized);
  }

  private hasSummaryPromptContext(conversation: ClinicalState['conversation']): boolean {
    const lastDoctorQuestion = this.getLatestDoctorQuestion(conversation).toLowerCase();
    if (
      SUMMARY_CLARIFY_QUESTION_PATTERN.test(lastDoctorQuestion) ||
      /\bwould you like your working diagnosis and plan\b|\bworking diagnosis and plan\b/i.test(
        lastDoctorQuestion
      )
    ) {
      return true;
    }
    return this.hasSummaryReadySignal(conversation);
  }

  private shouldForceSummaryAutoComplete(
    input: string,
    status: ClinicalState['status'],
    ddx: string[],
    conversation: ClinicalState['conversation'],
    checkpoint: ClinicalState['agent_state']['must_not_miss_checkpoint']
  ): boolean {
    if (status === 'emergency' || status === 'lens') return false;
    if (!Array.isArray(ddx) || ddx.length === 0) return false;
    if (checkpoint.status === 'escalate') return false;

    if (!this.isSummaryReadyInput(input)) return false;
    if (!this.hasSummaryPromptContext(conversation)) return false;

    const patientTurns = conversation.filter((entry) => entry.role === 'patient').length;
    if (patientTurns < 2) return false;

    if (checkpoint.status === 'pending' || checkpoint.status === 'cleared') {
      return true;
    }

    return this.hasRecentlyAnsweredIntent(conversation, DANGER_SIGNS_QUESTION_PATTERN, 28);
  }

  private hasSummaryReadySignal(conversation: ClinicalState['conversation']): boolean {
    const window = conversation.slice(-24);
    let summaryAskIndex = -1;

    for (let i = window.length - 1; i >= 0; i -= 1) {
      const entry = window[i];
      if (entry.role !== 'doctor') continue;
      const question = (entry.metadata?.question || entry.content || '').trim().toLowerCase();
      if (SUMMARY_CLARIFY_QUESTION_PATTERN.test(question)) {
        summaryAskIndex = i;
        break;
      }
    }

    if (summaryAskIndex < 0) {
      return window
        .filter((entry) => entry.role === 'patient')
        .some((entry) => /\bready for summary\b/i.test(entry.content || ''));
    }

    for (let i = summaryAskIndex + 1; i < window.length; i += 1) {
      const followup = window[i];
      if (followup.role === 'doctor') break;
      if (followup.role !== 'patient') continue;
      const normalized = (followup.content || '').trim().toLowerCase();
      if (!normalized) continue;
      return SUMMARY_READY_RESPONSE_PATTERN.test(normalized);
    }

    return false;
  }

  getState(): ClinicalState {
    return this.state;
  }

  updateState(newState: Partial<ClinicalState>): void {
    const previousGate = this.state.question_gate;
    const shouldDropIncomingGate =
      HYBRID_CHAT_FIRST_MODE &&
      Boolean(newState.question_gate?.active) &&
      newState.question_gate?.kind !== 'safety_checkpoint';

    if (shouldDropIncomingGate && newState.question_gate?.active) {
      recordInvariantEvent(
        'gate_dropped_chat_first',
        `${newState.question_gate.kind || 'gate'}:${newState.question_gate.current_index}`
      );
    }

    const incomingQuestionGate = shouldDropIncomingGate ? null : newState.question_gate;
    const resolvedResponseOptions = shouldDropIncomingGate
      ? null
      : newState.response_options;

    const gateProgressRegressed =
      Boolean(
        incomingQuestionGate &&
          incomingQuestionGate.active &&
          previousGate?.active &&
          incomingQuestionGate.kind === previousGate.kind &&
          incomingQuestionGate.source_question === previousGate.source_question &&
          incomingQuestionGate.current_index < previousGate.current_index
      );

    if (gateProgressRegressed && previousGate) {
      recordInvariantEvent(
        'gate_progress_preserved',
        `${incomingQuestionGate?.kind || 'gate'}:${incomingQuestionGate?.current_index}->${previousGate.current_index}`
      );
    }

    const resolvedQuestionGate =
      gateProgressRegressed && previousGate
        ? previousGate
        : incomingQuestionGate;

    const incomingConversationLength = Array.isArray(newState.conversation)
      ? newState.conversation.length
      : null;
    const currentConversationLength = this.state.conversation.length;
    const conversationRegressed =
      typeof incomingConversationLength === 'number' &&
      incomingConversationLength < currentConversationLength;

    if (conversationRegressed) {
      recordInvariantEvent(
        'conversation_regression_blocked',
        `${incomingConversationLength}->${currentConversationLength}`
      );
    }

    const shouldKeepCurrentOptions = gateProgressRegressed || conversationRegressed;

    const mergedConversation = Array.isArray(newState.conversation)
      ? newState.conversation.length >= this.state.conversation.length
        ? newState.conversation
        : this.state.conversation
      : this.state.conversation;

    const incomingAgentState = newState.agent_state;
    const mergedAgentState = incomingAgentState
      ? {
          ...this.state.agent_state,
          ...incomingAgentState,
          pending_actions: this.mergePendingActions(
            this.state.agent_state.pending_actions,
            incomingAgentState.pending_actions || []
          ),
          positive_findings: Array.from(
            new Set([
              ...(this.state.agent_state.positive_findings || []),
              ...(incomingAgentState.positive_findings || []),
            ])
          ).slice(0, 24),
          negative_findings: Array.from(
            new Set([
              ...(this.state.agent_state.negative_findings || []),
              ...(incomingAgentState.negative_findings || []),
            ])
          ).slice(0, 24),
          must_not_miss_checkpoint: this.ensureCheckpointState(
            incomingAgentState.must_not_miss_checkpoint ||
              this.state.agent_state.must_not_miss_checkpoint
          ),
        }
      : this.state.agent_state;
    const effectiveQuestionGate =
      resolvedQuestionGate !== undefined
        ? resolvedQuestionGate
        : this.state.question_gate;
    const effectiveProfile = newState.profile || this.state.profile;
    const baseResponseOptions =
      shouldKeepCurrentOptions
        ? this.state.response_options
        : resolvedResponseOptions !== undefined
        ? resolvedResponseOptions
        : this.state.response_options;
    const invariantResponseOptions = this.enforceRuntimeOptionInvariant(
      baseResponseOptions,
      mergedConversation,
      effectiveQuestionGate,
      effectiveProfile
    );
    const optionsCorrected = invariantResponseOptions !== baseResponseOptions;
    const baseSelectedOptions =
      shouldKeepCurrentOptions || newState.selected_options === undefined
        ? this.state.selected_options
        : newState.selected_options;
    const invariantSelectedOptions = optionsCorrected ? [] : baseSelectedOptions;
    if (optionsCorrected && baseSelectedOptions.length > 0) {
      recordInvariantEvent('selections_cleared', `count:${baseSelectedOptions.length}`);
    }

    this.state = {
      ...this.state,
      ...newState,
      question_gate:
        resolvedQuestionGate !== undefined
          ? resolvedQuestionGate
          : this.state.question_gate,
      response_options: invariantResponseOptions,
      selected_options: invariantSelectedOptions,
      conversation: mergedConversation,
      agent_state: mergedAgentState,
    };
  }
}

let agentCoordinator: AgentCoordinator | null = null;
let interactionQueue: Promise<void> = Promise.resolve();

export const getAgentCoordinator = (state: ClinicalState): AgentCoordinator => {
  if (!agentCoordinator || agentCoordinator.getState().sessionId !== state.sessionId) {
    resetInvariantAudit();
    agentCoordinator = new AgentCoordinator(state);
  }
  return agentCoordinator;
};

export const processAgentInteraction = async (
  input: string | string[],
  state: ClinicalState,
  isOptionSelection: boolean = false
): Promise<Partial<ClinicalState>> => {
  const run = async (): Promise<Partial<ClinicalState>> => {
    const coordinator = getAgentCoordinator(state);
    coordinator.updateState(state);

    if (isOptionSelection) {
      return coordinator.processOptionSelection(Array.isArray(input) ? input : [input]);
    }

    return coordinator.processPatientInput(input as string);
  };

  const next = interactionQueue.then(run, run);
  interactionQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};
