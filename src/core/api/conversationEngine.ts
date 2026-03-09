import { ClinicalState, ConversationMessage, AgentState } from '../types/clinical';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const CONVERSATION_SYSTEM_PROMPT = `You are Dr. Dyrane, a Senior Clinical Registrar speaking directly to your patient.

CONVERSATION PROTOCOLS:
1. SPEAK DIRECTLY: Address the patient as "you" in natural conversation, not as a third party
2. CLINICAL AUTHORITY: Be authoritative yet compassionate, zero filler words
3. PROGRESSIVE REVELATION: Ask one focused question at a time
4. CLINICAL REASONING: Show your thinking process visibly
5. URGENCY ASSESSMENT: Evaluate case urgency continuously
6. NATURAL FLOW: Respond conversationally, not as a questionnaire

RESPONSE FORMAT (STRICT JSON):
{
  "message": "Your direct response to the patient",
  "soap_updates": { "S": {}, "O": {}, "A": {}, "P": {} },
  "agent_state": {
    "phase": "intake|assessment|differential|resolution|followup",
    "confidence": number (0-100),
    "focus_area": "current clinical focus",
    "pending_actions": ["action1", "action2"],
    "last_decision": "reasoning behind current approach"
  },
  "urgency": "low|medium|high|critical",
  "probability": number (0-100),
  "thinking": "Your internal clinical reasoning",
  "needs_options": boolean,
  "status": "active|emergency|complete"
}`;

export const callConversationEngine = async (
  patientInput: string,
  state: ClinicalState
): Promise<{
  message: ConversationMessage;
  soap_updates: Partial<ClinicalState['soap']>;
  agent_state: AgentState;
  urgency: ClinicalState['urgency'];
  probability: number;
  thinking: string;
  needs_options: boolean;
  status: ClinicalState['status'];
}> => {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Missing Anthropic API key");
  }

  // Build conversation history for context
  const conversationContext = state.conversation
    .slice(-10) // Last 10 messages for context
    .map(msg => ({
      role: msg.role === 'doctor' ? 'assistant' : 'user',
      content: msg.content
    }));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 1024,
        // Automatic caching - caches everything up to the last cacheable block
        cache_control: { type: 'ephemeral' },
        system: [
          {
            type: 'text',
            text: CONVERSATION_SYSTEM_PROMPT,
            // Explicit cache breakpoint for system prompt (static content)
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          ...conversationContext,
          {
            role: 'user',
            content: `Patient says: "${patientInput}"

Current SOAP: ${JSON.stringify(state.soap)}
Agent State: ${JSON.stringify(state.agent_state)}
Urgency: ${state.urgency}
Confidence: ${state.probability}%

Respond as Dr. Dyrane speaking directly to the patient.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Conversation API Error: ${errorData.error?.message || response.status}`);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.content[0].text);

    // Create conversation message
    const doctorMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'doctor',
      content: aiResponse.message,
      timestamp: Date.now(),
      metadata: {
        soap_updates: aiResponse.soap_updates,
        urgency: aiResponse.urgency,
        probability: aiResponse.probability,
        thinking: aiResponse.thinking
      }
    };

    return {
      message: doctorMessage,
      soap_updates: aiResponse.soap_updates || {},
      agent_state: aiResponse.agent_state,
      urgency: aiResponse.urgency,
      probability: aiResponse.probability,
      thinking: aiResponse.thinking,
      needs_options: aiResponse.needs_options,
      status: aiResponse.status
    };

  } catch (error) {
    console.error("Conversation Engine Error:", error);
    throw error;
  }
};