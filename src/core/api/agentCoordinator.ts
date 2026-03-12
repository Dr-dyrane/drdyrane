import {
  ClinicalState,
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
const CHECKPOINT_DANGER_SIGNAL_PATTERN =
  /\b(confusion|faint|collapse|seizure|breathless|shortness of breath|unable to breathe|chest pain|persistent vomiting|cannot keep.*down|bleeding|very drowsy)\b/i;
const PATTERN_QUESTION_PATTERN = /\bpattern\b|\bintermittent\b|\bconstant\b|\bday\b|\bnight\b/i;
const DANGER_SIGNS_QUESTION_PATTERN =
  /\bdanger signs?\b|\bbreathlessness\b|\bconfusion\b|\bpersistent vomiting\b|\bbleeding\b/i;
const SYMPTOM_CLUSTER_PROMPT = 'Which symptom cluster stands out most right now?';
const FEVER_PATTERN_DETAIL_PROMPT = 'Within fever pattern, which cue stands out most?';
const HEAD_PAIN_DETAIL_PROMPT = 'Within head/pain pattern, which symptom stands out most?';
const AIRWAY_DETAIL_PROMPT = 'Within airway/throat pattern, which symptom stands out most?';
const GUT_DETAIL_PROMPT = 'Within stomach/gut pattern, which symptom stands out most?';
const GENERAL_DETAIL_PROMPT = 'Within energy/general pattern, which symptom stands out most?';

export class AgentCoordinator {
  private state: ClinicalState;

  constructor(initialState: ClinicalState) {
    this.state = initialState;
  }

  async processPatientInput(input: string): Promise<Partial<ClinicalState>> {
    const normalizedInput = input.trim();
    if (!normalizedInput) return {};

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
      return this.processGatedAnswer(normalizedInput);
    }

    const stateForTurn = this.applyProfileCapture(normalizedInput);
    if (this.shouldStartPresentingComplaintGate(normalizedInput, stateForTurn)) {
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

    const optionTexts = selectedOptions.map((option) => option.text).join(', ');
    const normalizedOptionInput = optionTexts.trim() || selectedOptionIds.join(', ');

    if (this.state.question_gate?.active) {
      return this.processGatedAnswer(normalizedOptionInput);
    }

    return this.processPatientInput(normalizedOptionInput);
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
        ? {
            ...stagedOptionsBase,
            allow_custom_input: true,
            context_hint:
              stagedOptionsBase.context_hint ||
              `Step 1 of ${segments.length}: Capture complaint timing.`,
          }
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

  private async stageNextGateStep(
    gate: QuestionGateState,
    nextIndex: number,
    patientMessage: ConversationMessage,
    profileForTurn: ClinicalState['profile']
  ): Promise<Partial<ClinicalState>> {
    const nextSegment = gate.segments[nextIndex];
    const nextGate: QuestionGateState = {
      ...gate,
      current_index: nextIndex,
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
        ? {
            ...stagedOptionsBase,
            allow_custom_input: true,
            context_hint:
              stagedOptionsBase.context_hint ||
              `Step ${nextIndex + 1} of ${gate.segments.length}: Quick yes/no.`,
          }
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

    const nextConversation: ConversationMessage[] = [...stateForTurn.conversation, patientMessage];
    const nextSoap = { ...stateForTurn.soap, ...conversationResult.soap_updates };
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
    const aiQuestion = this.ensureProgressiveQuestion(
      doctorMessage.metadata?.question || getFallbackQuestion(),
      nextConversation,
      conversationResult.agent_state.phase
    );
    doctorMessage = createDoctorMessage(aiQuestion, conversationResult.message.metadata?.statement);

    const autoComplete = this.shouldAutoCompleteEncounter(
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
        'Before I finalize your diagnosis, I need one safety check.'
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

      questionGate = this.buildStackedSymptomSurvey(aiQuestion, resolvedOptions);
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
        responseOptions = {
          ...responseOptions,
          allow_custom_input: false,
          context_hint:
            responseOptions.context_hint ||
            `Step 1 of ${questionGate.segments.length}: Choose a symptom cluster first.`,
        };
      } else {
        responseOptions = resolvedOptions;
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
        })
      : stateForTurn.pillars;

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
      question_gate: autoComplete ? null : questionGate,
      response_options: autoComplete ? null : responseOptions,
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
    if (isStructuredLocalQuestion(question)) {
      return localFallback;
    }
    try {
      const aiOptions = await generateResponseOptions(question, agentState, currentSOAP);
      if (!isOptionSetRelevant(question, aiOptions)) {
        return localFallback;
      }
      return aiOptions;
    } catch (error) {
      console.error('Option resolution fallback:', error);
      return localFallback;
    }
  }

  private ensureProgressiveQuestion(
    question: string,
    conversation: ClinicalState['conversation'],
    phase: ClinicalState['agent_state']['phase']
  ): string {
    const sanitized = sanitizeQuestion(question) || getFallbackQuestion();
    const hardBlockIntentRepeat = this.shouldHardBlockIntentRepeat(sanitized, conversation);
    const recentQuestions = getRecentDoctorQuestions(conversation, 8);
    const shouldFallback =
      hardBlockIntentRepeat ||
      isLikelyRepeatedQuestion(sanitized, recentQuestions) ||
      isLikelyAnsweredTopicQuestion(sanitized, conversation) ||
      isRecentlyAnsweredQuestionIntent(sanitized, conversation) ||
      isLoopingGenericPrompt(sanitized, conversation);
    if (!shouldFallback) {
      return sanitized;
    }
    const contextualFallback = this.getContextAwareFallbackQuestion(phase, conversation);
    if (contextualFallback) {
      return contextualFallback;
    }
    return getPhaseFallbackQuestion(phase, conversation.length, recentQuestions);
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

    return 'What other detail should I clarify before I summarize your working diagnosis?';
  }

  private shouldHardBlockIntentRepeat(
    question: string,
    conversation: ClinicalState['conversation']
  ): boolean {
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

  private hasRecentlyAnsweredIntent(
    conversation: ClinicalState['conversation'],
    intentPattern: RegExp,
    lookback = 20
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

    return malariaFastTrack || highCertaintyGeneral;
  }

  getState(): ClinicalState {
    return this.state;
  }

  updateState(newState: Partial<ClinicalState>): void {
    this.state = { ...this.state, ...newState };
  }
}

let agentCoordinator: AgentCoordinator | null = null;

export const getAgentCoordinator = (state: ClinicalState): AgentCoordinator => {
  if (!agentCoordinator || agentCoordinator.getState().sessionId !== state.sessionId) {
    agentCoordinator = new AgentCoordinator(state);
  }
  return agentCoordinator;
};

export const processAgentInteraction = async (
  input: string | string[],
  state: ClinicalState,
  isOptionSelection: boolean = false
): Promise<Partial<ClinicalState>> => {
  const coordinator = getAgentCoordinator(state);
  coordinator.updateState(state);

  if (isOptionSelection) {
    return coordinator.processOptionSelection(Array.isArray(input) ? input : [input]);
  }

  return coordinator.processPatientInput(input as string);
};
