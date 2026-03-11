import {
  ClinicalState,
  ConversationMessage,
  GatedQuestionSegment,
  QuestionGateState,
  ResponseOptions,
} from '../types/clinical';
import { callConversationEngine } from './conversationEngine';
import { generateResponseOptions } from './optionsEngine';

export class AgentCoordinator {
  private state: ClinicalState;

  constructor(initialState: ClinicalState) {
    this.state = initialState;
  }

  async processPatientInput(input: string): Promise<Partial<ClinicalState>> {
    const normalizedInput = input.trim();
    if (!normalizedInput) return {};

    // Emergency check first
    if (this.isEmergencyInput(normalizedInput)) {
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

    const profileCandidate = this.extractProfileUpdates(normalizedInput);
    const capturedProfile = profileCandidate ? this.getProfileDelta(profileCandidate) : null;
    const stateForTurn = capturedProfile
      ? {
          ...this.state,
          profile: this.mergeProfile(capturedProfile),
          notifications: this.state.settings.notifications_enabled
            ? [
                {
                  id: crypto.randomUUID(),
                  title: 'Profile Memory Updated',
                  body: 'New patient details were captured and saved for future clinical context.',
                  created_at: Date.now(),
                  read: false,
                },
                ...this.state.notifications,
              ].slice(0, 120)
            : this.state.notifications,
        }
      : this.state;
    this.state = stateForTurn;

    const patientMessage = this.createPatientMessage(normalizedInput);

    try {
      return await this.processConversationTurn(normalizedInput, patientMessage, stateForTurn);
    } catch (error) {
      console.error("Agent Coordinator Error:", error);
      const fallbackQuestion = 'I had a brief interruption. What symptom feels worst right now?';
      const fallbackDoctorMessage = this.createDoctorMessage(
        fallbackQuestion,
        'Thank you. I am still with you.'
      );

      const fallbackState: Partial<ClinicalState> = {
        status: 'active',
        conversation: [...this.state.conversation, patientMessage, fallbackDoctorMessage],
        thinking: 'Attempting to reconnect with clinical engine...',
        profile: stateForTurn.profile,
        question_gate: null,
        response_options: this.buildLocalOptions(fallbackQuestion),
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

    const selectedOptions = this.state.response_options.options.filter(
      opt => selectedOptionIds.includes(opt.id)
    );

    const optionTexts = selectedOptions.map(opt => opt.text).join(', ');
    const normalizedOptionInput = optionTexts.trim() || selectedOptionIds.join(', ');

    if (this.state.question_gate?.active) {
      return this.processGatedAnswer(normalizedOptionInput);
    }

    return this.processPatientInput(normalizedOptionInput);
  }

  private async processConversationTurn(
    input: string,
    patientMessage: ConversationMessage,
    stateForTurn: ClinicalState
  ): Promise<Partial<ClinicalState>> {
    const conversationResult = await callConversationEngine(input, stateForTurn);

    const nextConversation: ConversationMessage[] = [...stateForTurn.conversation, patientMessage];
    let doctorMessage = this.buildDoctorMessageFromResult(conversationResult.message);
    const question = doctorMessage.metadata?.question || this.getFallbackQuestion();
    const segments = conversationResult.lens_trigger || !conversationResult.needs_options
      ? []
      : this.extractBundledSegments(question);

    let questionGate: QuestionGateState | null = null;
    let responseOptions: ResponseOptions | null = null;

    if (conversationResult.lens_trigger) {
      responseOptions = null;
    } else if (segments.length > 1) {
      const firstSegment = segments[0];
      doctorMessage = this.createDoctorMessage(
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
      responseOptions = this.buildLocalOptions(firstSegment.prompt);
    } else if (conversationResult.needs_options) {
      responseOptions = await generateResponseOptions(
        question,
        conversationResult.agent_state,
        { ...stateForTurn.soap, ...conversationResult.soap_updates }
      );
    } else if (conversationResult.status === 'active' && question) {
      responseOptions = this.buildLocalOptions(question);
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

    const patientMessage = this.createPatientMessage(answerText);
    const profileCandidate = this.extractProfileUpdates(answerText);
    const capturedProfile = profileCandidate ? this.getProfileDelta(profileCandidate) : null;
    const profileForTurn = capturedProfile ? this.mergeProfile(capturedProfile) : this.state.profile;
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

      const stagedDoctor = this.createDoctorMessage(nextSegment.prompt, 'Noted');
      const stagedState: Partial<ClinicalState> = {
        conversation: [...this.state.conversation, patientMessage, stagedDoctor],
        profile: profileForTurn,
        question_gate: nextGate,
        response_options: this.buildLocalOptions(nextSegment.prompt),
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
      const fallbackQuestion = 'I can continue safely. What changed most since symptoms began?';
      const fallbackDoctorMessage = this.createDoctorMessage(fallbackQuestion, 'Noted.');
      const fallbackState: Partial<ClinicalState> = {
        status: 'active',
        conversation: [...this.state.conversation, patientMessage, fallbackDoctorMessage],
        question_gate: null,
        response_options: this.buildLocalOptions(fallbackQuestion),
        selected_options: [],
      };
      this.state = { ...this.state, ...fallbackState };
      return fallbackState;
    }
  }

  private getFallbackQuestion(): string {
    return 'What symptom is bothering you the most right now?';
  }

  private extractQuestionFromContent(content: string): string {
    const normalized = (content || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const questionMatches = normalized.match(/[^?]+\?/g);
    if (!questionMatches || questionMatches.length === 0) return '';
    return questionMatches[questionMatches.length - 1].trim();
  }

  private buildDoctorMessageFromResult(message: ConversationMessage): ConversationMessage {
    const statement = message.metadata?.statement?.trim();
    const candidateQuestion =
      message.metadata?.question?.trim() || this.extractQuestionFromContent(message.content);
    const question = candidateQuestion || this.getFallbackQuestion();

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
  }

  private createPatientMessage(input: string): ConversationMessage {
    return {
      id: crypto.randomUUID(),
      role: 'patient',
      content: input,
      timestamp: Date.now(),
    };
  }

  private createDoctorMessage(question: string, statement?: string): ConversationMessage {
    const content = [statement, question].filter(Boolean).join(' ');
    return {
      id: crypto.randomUUID(),
      role: 'doctor',
      content,
      timestamp: Date.now(),
      metadata: {
        statement: statement || undefined,
        question,
      },
    };
  }

  private extractBundledSegments(question: string): GatedQuestionSegment[] {
    const cleaned = question
      .replace(/\s+/g, ' ')
      .replace(/\s+\?/g, '?')
      .trim();
    if (!cleaned) return [];

    const sentenceSegments = cleaned
      .split('?')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.endsWith('?') ? item : `${item}?`));

    const rawSegments =
      sentenceSegments.length > 1
        ? sentenceSegments
        : cleaned
            .split(/\s+(?:and|also|plus)\s+/i)
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => (item.endsWith('?') ? item : `${item}?`));

    const dedup = rawSegments
      .map((item, idx) => ({ id: `segment-${idx + 1}`, prompt: item }))
      .filter((segment, index, all) =>
        all.findIndex((other) => other.prompt.toLowerCase() === segment.prompt.toLowerCase()) === index
      );

    if (dedup.length <= 1) return [];
    return dedup.slice(0, 4);
  }

  private buildLocalOptions(question: string): ResponseOptions {
    const normalized = question.toLowerCase();
    const knownAge = this.state.profile.age;

    if (
      /(scale|1-10|1 to 10|rate|severity|intensity|worst)/.test(normalized)
    ) {
      const options = Array.from({ length: 10 }, (_, index) => {
        const value = index + 1;
        return {
          id: `scale-${value}`,
          text: String(value),
          category: 'severity',
          priority: 11 - value,
        };
      });
      return {
        mode: 'single',
        ui_variant: 'scale',
        options,
        scale: { min: 1, max: 10, step: 1, low_label: 'Mild', high_label: 'Severe' },
        allow_custom_input: true,
        context_hint: 'Select the closest severity level.',
      };
    }

    if (/(how old|your age|age\?)/.test(normalized)) {
      const options = Array.from({ length: 10 }, (_, idx) => {
        const lower = 10 + idx * 10;
        const upper = lower + 9;
        return {
          id: `age-${lower}-${upper}`,
          text: `${lower}-${upper}`,
          category: 'age_range',
          priority: 10 - idx,
        };
      });
      return {
        mode: 'single',
        ui_variant: 'grid',
        options,
        allow_custom_input: true,
        context_hint: knownAge
          ? `Profile has age ${knownAge}. Confirm or provide a better answer.`
          : 'Select age range or type exact age.',
      };
    }

    if (
      /(worsen|worsening|improve|improvement|better|worse|changed|progress|since.*started)/.test(
        normalized
      )
    ) {
      return {
        mode: 'single',
        ui_variant: 'stack',
        options: [
          { id: 'much-worse', text: 'Much worse', category: 'trajectory', priority: 10 },
          { id: 'slightly-worse', text: 'Slightly worse', category: 'trajectory', priority: 9 },
          { id: 'no-change', text: 'No change', category: 'trajectory', priority: 8 },
          { id: 'slightly-better', text: 'Slightly better', category: 'trajectory', priority: 7 },
          { id: 'much-better', text: 'Much better', category: 'trajectory', priority: 6 },
        ],
        allow_custom_input: true,
        context_hint: 'Choose how your symptoms have changed.',
      };
    }

    if (/^(is|are|do|did|have|has|can|will)\b/.test(normalized) || normalized.includes('yes or no')) {
      return {
        mode: 'single',
        ui_variant: 'segmented',
        options: [
          { id: 'yes', text: 'Yes', category: 'confirmation', priority: 10 },
          { id: 'no', text: 'No', category: 'confirmation', priority: 9 },
          { id: 'unsure', text: 'Not sure', category: 'confirmation', priority: 8 },
        ],
        allow_custom_input: true,
        context_hint: 'Pick the closest answer.',
      };
    }

    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'mild', text: 'Mild', category: 'descriptor', priority: 10 },
        { id: 'moderate', text: 'Moderate', category: 'descriptor', priority: 9 },
        { id: 'severe', text: 'Severe', category: 'descriptor', priority: 8 },
        { id: 'intermittent', text: 'Intermittent', category: 'pattern', priority: 7 },
        { id: 'constant', text: 'Constant', category: 'pattern', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Select one option or type your own answer.',
    };
  }

  private extractProfileUpdates(input: string): Partial<ClinicalState['profile']> | null {
    const normalized = input.toLowerCase();
    const updates: Partial<ClinicalState['profile']> = {};

    const ageMatch = normalized.match(/\b(\d{1,3})\s*(years old|yo|y\/o|yrs old|yrs)\b/);
    const plainAgeMatch = normalized.match(/\bi am\s+(\d{1,3})\b/);
    const ageCandidate = ageMatch?.[1] || plainAgeMatch?.[1];
    if (ageCandidate) {
      const ageValue = Number(ageCandidate);
      if (!Number.isNaN(ageValue) && ageValue >= 0 && ageValue <= 125) {
        updates.age = ageValue;
      }
    }

    if (/\b(female|woman)\b/.test(normalized)) {
      updates.sex = 'female';
    } else if (/\b(male|man)\b/.test(normalized)) {
      updates.sex = 'male';
    }

    const nameMatch = input.match(/\bmy name is\s+([a-zA-Z][a-zA-Z\s'-]{1,40})/i);
    if (nameMatch?.[1]) {
      updates.display_name = nameMatch[1].trim();
    }

    const pronounMatch = normalized.match(/\b(my pronouns are|pronouns)\s+([a-z/]+)\b/);
    if (pronounMatch?.[2]) {
      updates.pronouns = pronounMatch[2];
    }

    const allergyMatch = input.match(/\ballergic to\s+([^.!,;]+)/i);
    if (allergyMatch?.[1]) {
      updates.allergies = allergyMatch[1].trim();
    }

    return Object.keys(updates).length > 0 ? updates : null;
  }

  private mergeProfile(updates: Partial<ClinicalState['profile']>): ClinicalState['profile'] {
    return {
      ...this.state.profile,
      ...updates,
      updated_at: Date.now(),
    };
  }

  private getProfileDelta(
    updates: Partial<ClinicalState['profile']>
  ): Partial<ClinicalState['profile']> | null {
    const delta: Partial<ClinicalState['profile']> = {};
    (Object.keys(updates) as Array<keyof ClinicalState['profile']>).forEach((key) => {
      const nextValue = updates[key];
      if (nextValue !== undefined && this.state.profile[key] !== nextValue) {
        (delta as Record<string, unknown>)[key] = nextValue;
      }
    });

    return Object.keys(delta).length > 0 ? delta : null;
  }

  private isEmergencyInput(input: string): boolean {
    const normalized = input.toLowerCase();

    const hardTriggers = [
      'cannot breathe',
      'unconscious',
      'loss of consciousness',
      'torrential bleeding',
      'severe allergic reaction',
      'anaphylaxis',
      'stroke symptoms',
      'heart attack',
      'fainted and not waking',
    ];

    if (hardTriggers.some((keyword) => normalized.includes(keyword))) {
      return true;
    }

    const chestPainPattern = /(chest pain|chest pressure|chest tightness)/;
    const chestDangerPattern =
      /(crushing|severe|radiating|left arm|jaw pain|shortness of breath|cold sweat|passing out|fainting)/;

    const breathingPattern = /(difficulty breathing|shortness of breath|can't breathe)/;
    const breathingDangerPattern = /(at rest|blue lips|wheezing badly|unable to speak|severe)/;

    const hasCriticalChestPattern =
      chestPainPattern.test(normalized) && chestDangerPattern.test(normalized);
    const hasCriticalBreathingPattern =
      breathingPattern.test(normalized) && breathingDangerPattern.test(normalized);

    return hasCriticalChestPattern || hasCriticalBreathingPattern;
  }


  getState(): ClinicalState {
    return this.state;
  }

  updateState(newState: Partial<ClinicalState>): void {
    this.state = { ...this.state, ...newState };
  }
}

// Singleton instance for the session
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
    if (Array.isArray(input)) {
      return coordinator.processOptionSelection(input);
    }
    return coordinator.processOptionSelection([input as string]);
  } else {
    return coordinator.processPatientInput(input as string);
  }
};
