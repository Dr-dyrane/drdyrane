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
  isLikelyRepeatedQuestion,
} from './agent/repetitionGuard';
import { buildAutoClerking } from './agent/clerkingAutoFill';

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
const YES_ANSWER_PATTERN = /\b(yes|yeah|yep|affirmative|correct|sure)\b/i;
const NO_ANSWER_PATTERN = /\b(no|none|nothing else|nope)\b/i;
const UNSURE_ANSWER_PATTERN = /\b(not sure|unsure|unknown|maybe)\b/i;

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
    if (stateForTurn.status !== 'idle' && stateForTurn.status !== 'intake') return false;
    if (stateForTurn.conversation.length > 0) return false;
    if (NON_COMPLAINT_OPENER_PATTERN.test(input) && input.trim().split(/\s+/).length <= 4) return false;
    return true;
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
    return YES_ANSWER_PATTERN.test(answer) && !NO_ANSWER_PATTERN.test(answer);
  }

  private isNegativeOrUncertainAnswer(answer: string): boolean {
    return NO_ANSWER_PATTERN.test(answer) || UNSURE_ANSWER_PATTERN.test(answer);
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
            allow_custom_input: false,
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
            allow_custom_input: false,
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
    let doctorMessage = buildDoctorMessageFromResult(conversationResult.message);
    const question = this.ensureProgressiveQuestion(
      doctorMessage.metadata?.question || getFallbackQuestion(),
      stateForTurn.conversation,
      conversationResult.agent_state.phase
    );
    doctorMessage = createDoctorMessage(
      question,
      conversationResult.message.metadata?.statement
    );

    let questionGate: QuestionGateState | null = null;
    let responseOptions: ResponseOptions | null = null;

    if (conversationResult.lens_trigger) {
      responseOptions = null;
    } else if (conversationResult.needs_options || (conversationResult.status === 'active' && question)) {
      responseOptions = await this.resolveQuestionOptions(
        question,
        conversationResult.agent_state,
        { ...stateForTurn.soap, ...conversationResult.soap_updates },
        stateForTurn.profile
      );

      questionGate = this.buildStackedSymptomSurvey(question, responseOptions);
      if (questionGate) {
        responseOptions = {
          ...responseOptions,
          allow_custom_input: false,
          context_hint:
            responseOptions.context_hint ||
            `Step 1 of ${questionGate.segments.length}: Choose the symptom that stands out most.`,
        };
      }
    }

    nextConversation.push(doctorMessage);
    const nextSoap = { ...stateForTurn.soap, ...conversationResult.soap_updates };
    const nextClerking = buildAutoClerking(
      stateForTurn.clerking,
      nextSoap,
      nextConversation,
      stateForTurn.profile
    );
    const autoComplete = this.shouldAutoCompleteEncounter(
      conversationResult.status,
      conversationResult.ddx,
      conversationResult.probability,
      nextSoap,
      nextConversation
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
      agent_state: conversationResult.agent_state,
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
    const recentQuestions = getRecentDoctorQuestions(conversation, 3);
    if (
      !isLikelyRepeatedQuestion(sanitized, recentQuestions) &&
      !isLikelyAnsweredTopicQuestion(sanitized, conversation)
    ) {
      return sanitized;
    }
    return getPhaseFallbackQuestion(phase, conversation.length);
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
        { id: 'dominant_symptom', prompt: question },
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
    return getPhaseFallbackQuestion(phase, this.state.conversation.length);
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
    const subjectiveDensity = Object.keys(soap.S || {}).length;
    const supportSignals = [
      /fever|pyrexia|temperature/.test(subjective),
      /chills?|rigors?/.test(subjective),
      /headache|retro[-\s]?orbital|behind (my )?eyes?/.test(subjective),
      /body aches?|myalgia|weak(ness)?/.test(subjective),
      /nausea|vomit/.test(subjective),
      /cough|breathless|shortness of breath/.test(subjective),
      /abdominal pain|diarrh|dysuria/.test(subjective),
    ].filter(Boolean).length;
    const leadClearOfSecond = !secondDx || leadDx !== secondDx;
    const isMalariaLead = leadDx.includes('malaria');
    const malariaFastTrack =
      isMalariaLead &&
      supportSignals >= 3 &&
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

  if (isOptionSelection) {
    return coordinator.processOptionSelection(Array.isArray(input) ? input : [input]);
  }

  return coordinator.processPatientInput(input as string);
};
