import { ClinicalState, ConversationMessage, AgentState } from '../types/clinical';
import { getPromptCache, recordPromptUsage, setPromptCache } from '../storage/promptCache';

const CONVERSATION_CACHE_TTL_MS = 1000 * 45;

export const callConversationEngine = async (
  patientInput: string,
  state: ClinicalState
): Promise<{
  message: ConversationMessage;
  soap_updates: Partial<ClinicalState['soap']>;
  ddx: string[];
  agent_state: AgentState;
  urgency: ClinicalState['urgency'];
  probability: number;
  thinking: string;
  needs_options: boolean;
  lens_trigger: string | null;
  status: ClinicalState['status'];
}> => {
  const conversationCacheKey = [
    'conversation',
    patientInput.trim().toLowerCase(),
    state.urgency,
    state.agent_state.phase,
    JSON.stringify(state.soap),
  ].join('::');

  const cached = getPromptCache<{
    message: ConversationMessage;
    soap_updates: Partial<ClinicalState['soap']>;
    ddx: string[];
    agent_state: AgentState;
    urgency: ClinicalState['urgency'];
    probability: number;
    thinking: string;
    needs_options: boolean;
    lens_trigger: string | null;
    status: ClinicalState['status'];
  }>(conversationCacheKey);

  if (cached) {
    return {
      ...cached,
      message: { ...cached.message, id: crypto.randomUUID(), timestamp: Date.now() },
    };
  }

  recordPromptUsage('conversation', conversationCacheKey);

  try {
    const response = await fetch('/api/consult', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patientInput,
        state: {
          soap: state.soap,
          agent_state: state.agent_state,
          ddx: state.ddx,
          urgency: state.urgency,
          probability: state.probability,
          profile: {
            display_name: state.profile.display_name,
            age: state.profile.age ?? null,
            sex: state.profile.sex ?? null,
            pronouns: state.profile.pronouns ?? null,
            allergies: state.profile.allergies ?? null,
            chronic_conditions: state.profile.chronic_conditions ?? null,
            medications: state.profile.medications ?? null,
          },
          conversation: state.conversation.slice(-10).map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        },
      })
    });

    if (!response.ok) {
      const rawError = await response.text().catch(() => '');
      let parsedError = '';
      if (rawError) {
        try {
          const json = JSON.parse(rawError) as { error?: string };
          parsedError = json.error || '';
        } catch {
          parsedError = rawError.trim();
        }
      }
      throw new Error(`Conversation API Error: ${parsedError || response.status}`);
    }

    const aiResponse = await response.json();

    // Create conversation message
    const fullContent = [aiResponse.statement, aiResponse.question].filter(Boolean).join(' ');
    
    const doctorMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'doctor',
      content: fullContent || aiResponse.message || "",
      timestamp: Date.now(),
      metadata: {
        soap_updates: aiResponse.soap_updates,
        urgency: aiResponse.urgency,
        probability: aiResponse.probability,
        thinking: aiResponse.thinking,
        statement: aiResponse.statement,
        question: aiResponse.question,
        lens_trigger: aiResponse.lens_trigger ?? null
      }
    };

    const normalizedResult = {
      message: doctorMessage,
      soap_updates: aiResponse.soap_updates || {},
      agent_state: aiResponse.agent_state,
      ddx: aiResponse.ddx || state.ddx,
      urgency: aiResponse.urgency,
      probability: aiResponse.probability,
      thinking: aiResponse.thinking,
      needs_options: aiResponse.needs_options,
      lens_trigger: aiResponse.lens_trigger ?? null,
      status: aiResponse.status
    };
    setPromptCache(conversationCacheKey, normalizedResult, CONVERSATION_CACHE_TTL_MS);
    return normalizedResult;

  } catch (error) {
    console.error("Conversation Engine Error:", error);
    throw error;
  }
};
