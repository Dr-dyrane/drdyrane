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
import { buildLocalOptions } from './agent/localOptions';
import { isOptionSetRelevant } from './agent/optionQuality';
import {
  extractBundledSegments,
  getFallbackQuestion,
} from './agent/questionFlow';
import {
  extractProfileUpdates,
  getProfileDelta,
  mergeProfile,
} from './agent/profileMemory';

const PROFILE_MEMORY_NOTIFICATION = {
  title: 'Profile Memory Updated',
  body: 'New patient details were captured and saved for future clinical context.',
};

const INTERRUPTION_FALLBACK = {
  question: 'I had a brief interruption. What symptom feels worst right now?',
  statement: 'Thank you. I am still with you.',
};

const GATE_FINALIZATION_FALLBACK = {
  question: 'I can continue safely. What changed most since symptoms began?',
  statement: 'Noted.',
};

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
    const patientMessage = createPatientMessage(normalizedInput);

    try {
      return await this.processConversationTurn(normalizedInput, patientMessage, stateForTurn);
    } catch (error) {
      console.error('Agent Coordinator Error:', error);
      const fallbackDoctorMessage = createDoctorMessage(
        INTERRUPTION_FALLBACK.question,
        INTERRUPTION_FALLBACK.statement
      );

      const fallbackState: Partial<ClinicalState> = {
        status: 'active',
        conversation: [...this.state.conversation, patientMessage, fallbackDoctorMessage],
        thinking: 'Attempting to reconnect with clinical engine...',
        profile: stateForTurn.profile,
        question_gate: null,
        response_options: buildLocalOptions(INTERRUPTION_FALLBACK.question, this.state.profile),
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

  private async processConversationTurn(
    input: string,
    patientMessage: ConversationMessage,
    stateForTurn: ClinicalState
  ): Promise<Partial<ClinicalState>> {
    const conversationResult = await callConversationEngine(input, stateForTurn);

    const nextConversation: ConversationMessage[] = [...stateForTurn.conversation, patientMessage];
    let doctorMessage = buildDoctorMessageFromResult(conversationResult.message);
    const question = doctorMessage.metadata?.question || getFallbackQuestion();
    const segments = conversationResult.lens_trigger ? [] : extractBundledSegments(question);

    let questionGate: QuestionGateState | null = null;
    let responseOptions: ResponseOptions | null = null;

    if (conversationResult.lens_trigger) {
      responseOptions = null;
    } else if (segments.length > 1) {
      const firstSegment = segments[0];
      doctorMessage = createDoctorMessage(
        firstSegment.prompt,
        conversationResult.message.metadata?.statement
      );
      questionGate = {
        active: true,
        source_question: question,
        segments,
        current_index: 0,
        answers: [],
      };
      responseOptions = await this.resolveQuestionOptions(
        firstSegment.prompt,
        conversationResult.agent_state,
        { ...stateForTurn.soap, ...conversationResult.soap_updates },
        stateForTurn.profile
      );
    } else if (conversationResult.needs_options || (conversationResult.status === 'active' && question)) {
      responseOptions = await this.resolveQuestionOptions(
        question,
        conversationResult.agent_state,
        { ...stateForTurn.soap, ...conversationResult.soap_updates },
        stateForTurn.profile
      );
    }

    nextConversation.push(doctorMessage);

    const newState: Partial<ClinicalState> = {
      conversation: nextConversation,
      soap: { ...stateForTurn.soap, ...conversationResult.soap_updates },
      ddx: conversationResult.ddx,
      profile: stateForTurn.profile,
      agent_state: conversationResult.agent_state,
      urgency: conversationResult.urgency,
      probability: conversationResult.probability,
      thinking: conversationResult.thinking,
      status: conversationResult.lens_trigger ? 'lens' : conversationResult.status,
      question_gate: questionGate,
      response_options: responseOptions,
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

    const isLastSegment = gate.current_index >= gate.segments.length - 1;

    if (!isLastSegment) {
      const nextIndex = gate.current_index + 1;
      const nextSegment = gate.segments[nextIndex];
      const nextGate: QuestionGateState = {
        ...gate,
        current_index: nextIndex,
        answers: nextAnswers,
      };

      const stagedDoctor = createDoctorMessage(nextSegment.prompt, 'Noted');
      const stagedOptions = await this.resolveQuestionOptions(
        nextSegment.prompt,
        this.state.agent_state,
        this.state.soap,
        profileForTurn
      );
      const stagedState: Partial<ClinicalState> = {
        conversation: [...this.state.conversation, patientMessage, stagedDoctor],
        profile: profileForTurn,
        question_gate: nextGate,
        response_options: stagedOptions,
        selected_options: [],
        status: 'active',
      };

      this.state = { ...this.state, ...stagedState };
      return stagedState;
    }

    const stackedInput = nextAnswers
      .map((answer, idx) => `${idx + 1}. ${answer.prompt} ${answer.response}`)
      .join('\n');

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
      const fallbackState: Partial<ClinicalState> = {
        status: 'active',
        conversation: [...this.state.conversation, patientMessage, fallbackDoctorMessage],
        question_gate: null,
        response_options: buildLocalOptions(GATE_FINALIZATION_FALLBACK.question, this.state.profile),
        selected_options: [],
      };
      this.state = { ...this.state, ...fallbackState };
      return fallbackState;
    }
  }

  private async resolveQuestionOptions(
    question: string,
    agentState: ClinicalState['agent_state'],
    currentSOAP: ClinicalState['soap'],
    profile: ClinicalState['profile']
  ): Promise<ResponseOptions> {
    const localFallback = buildLocalOptions(question, profile);
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
