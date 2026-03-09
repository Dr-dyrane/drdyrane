import { ClinicalState, ConversationMessage, AgentState } from '../types/clinical';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const CONVERSATION_SYSTEM_PROMPT = `You are Dr. Dyrane, a Senior Clinical Registrar speaking directly to your patient.

CONVERSATION PROTOCOLS:
1. SPEAK DIRECTLY: Address the patient as "you" in natural conversation, not as a third party
2. CLINICAL AUTHORITY: Be authoritative yet compassionate, zero filler words
3. ONE-QUESTION RULE: Ask exactly one focused clinical question per turn. Never aggregate queries.
4. OPTION-DRIVEN: When asking a question, ALWAYS set "needs_options": true so the options engine can generate button responses.
5. CLINICAL REASONING: Show your thinking process visibly.
6. URGENCY ASSESSMENT: Evaluate case urgency continuously.
7. NATURAL FLOW: Respond conversationally, but with extreme brevity. Avoid repeating what the patient just said back to them.
8. RELEVANCE: Do NOT ask for info already in SOAP or Patient Input.
9. NO SUMMARIES: Never summarize the "discussion so far". The patient is sick and in a hurry.
10. SINGULAR FOCUS: Give a 1-sentence acknowledgment and ask exactly one question. Nothing else.
11. PATIENT-FACING: The "message" field is for direct, short communication. Keep reasoning inside "thinking".
12. CLINICAL RIGOR: Move quickly to high-fidelity inquiry once the complaint is established.

RESPONSE FORMAT (STRICT JSON):
You MUST return ONLY a JSON object. No pre-conversation, no "Assistant:", no reasoning before the JSON. All reasoning MUST be inside the "thinking" field.

{
  "message": "Your direct response to the patient",
  "soap_updates": { "S": {}, "O": {}, "A": {}, "P": {} },
  "ddx": ["Condition 1", "Condition 2"],
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
}

CRITICAL: "soap_updates" sections MUST be objects of key-value pairs. NEVER use set notation like {"Fever"}. Use {"recorded": "Fever"} instead.
`;

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
        // Stable model for initial setup. Upgrade to 'claude-3-5-sonnet-latest' for premium clinical fidelity.
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: CONVERSATION_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          ...conversationContext,
          {
            role: 'user',
            content: `CONTEXT:
Current SOAP: ${JSON.stringify(state.soap)}
Agent State: ${JSON.stringify(state.agent_state)}
Differential (DDX): ${state.ddx.join(', ')}
Urgency: ${state.urgency}
Confidence: ${state.probability}%

Patient Input: "${patientInput}"

Review the memory above to avoid redundant questions. Advance the clinical assessment.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Conversation API Error: ${errorData.error?.message || response.status}`);
    }

    const data = await response.json();
    const rawContent = data.content[0].text;
    
    // Robust JSON extraction and repair (Rule 5: Nothing fails silently)
    let aiResponse;
    const repairJson = (str: string) => {
      return str
        .replace(/"\s*\n?\s*"/g, '", "')
        .replace(/}\s*\n?\s*"/g, '}, "')
        .replace(/]\s*\n?\s*"/g, '], "')
        // Fix set-like structures {"Value"} -> {"recorded": "Value"}
        .replace(/\{\s*"([^"]+)"\s*(?!\:)\}/g, '{"recorded": "$1"}')
        // Fix trailing commas
        .replace(/,\s*([}\]])/g, '$1');
    };

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      const targetStr = jsonMatch ? jsonMatch[0] : rawContent;
      try {
        aiResponse = JSON.parse(targetStr);
      } catch (innerError) {
        // Attempt repair
        aiResponse = JSON.parse(repairJson(targetStr));
      }
    } catch (e) {
      console.error("Critical: Failed to parse AI Response JSON after repair attempt:", rawContent);
      throw new Error("Dr. Dyrane's internal model returned an invalid structure. Please try again.");
    }

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
      ddx: aiResponse.ddx || state.ddx,
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