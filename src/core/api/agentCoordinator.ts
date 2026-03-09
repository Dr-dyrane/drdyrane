import { ClinicalState, ConversationMessage } from '../types/clinical';
import { callConversationEngine } from './conversationEngine';
import { generateResponseOptions } from './optionsEngine';

export class AgentCoordinator {
  private state: ClinicalState;

  constructor(initialState: ClinicalState) {
    this.state = initialState;
  }

  async processPatientInput(input: string): Promise<Partial<ClinicalState>> {
    // Emergency check first
    if (this.isEmergencyInput(input)) {
      return {
        status: 'emergency',
        redFlag: true,
        urgency: 'critical',
        probability: 100
      };
    }

    try {
      // Step 1: Get doctor's conversational response
      const conversationResult = await callConversationEngine(input, this.state);

      // Add patient message to conversation
      const patientMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'patient',
        content: input,
        timestamp: Date.now()
      };

      const newState: Partial<ClinicalState> = {
        conversation: [...this.state.conversation, patientMessage, conversationResult.message],
        soap: { ...this.state.soap, ...conversationResult.soap_updates },
        agent_state: conversationResult.agent_state,
        urgency: conversationResult.urgency,
        probability: conversationResult.probability,
        thinking: conversationResult.thinking,
        status: conversationResult.status
      };

      // Step 2: Generate response options if needed
      if (conversationResult.needs_options) {
        const conversationContext = this.buildConversationContext();
        const options = await generateResponseOptions(
          conversationContext,
          conversationResult.agent_state,
          newState.soap || this.state.soap
        );

        newState.response_options = options;
        newState.selected_options = []; // Reset selections
      } else {
        newState.response_options = null;
        newState.selected_options = [];
      }

      // Update internal state
      this.state = { ...this.state, ...newState };

      return newState;

    } catch (error) {
      console.error("Agent Coordinator Error:", error);
      // Fallback response
      return {
        status: 'active',
        response_options: {
          mode: 'freeform',
          options: [],
          allow_custom_input: true,
          context_hint: 'Please tell me more about your symptoms'
        }
      };
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

    // Process as if patient provided this input
    return this.processPatientInput(optionTexts);
  }

  private isEmergencyInput(input: string): boolean {
    const emergencyKeywords = [
      'crushing chest pain', 'cannot breathe', 'unconscious', 'torrential bleeding',
      'severe allergic reaction', 'anaphylaxis', 'stroke symptoms', 'heart attack',
      'difficulty breathing', 'chest pain', 'loss of consciousness'
    ];

    return emergencyKeywords.some(keyword =>
      input.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private buildConversationContext(): string {
    // Build recent conversation context for options generation
    const recentMessages = this.state.conversation.slice(-5);
    return recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
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