import { ClinicalState, ResponseOptions } from '../types/clinical';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const OPTIONS_SYSTEM_PROMPT = `You are an expert clinical decision support system generating response options for patients.

OPTION GENERATION PROTOCOLS:
1. CONTEXT AWARENESS: Options must be relevant to current clinical context
2. CLINICAL ACCURACY: Ensure medical appropriateness
3. PATIENT FRIENDLY: Use clear, understandable language
4. COMPREHENSIVE COVERAGE: Include all reasonable possibilities
5. PRIORITIZATION: Order by clinical relevance and likelihood
6. MULTIPLE MODES: Support single/multiple selection based on context
7. RESTRICTION: Prefer closed-ended options to keep the clinical loop tight. Use freeform only when essential.

RESPONSE FORMAT (STRICT JSON):
{
  "mode": "single|multiple|freeform|confirm",
  "options": [
    {
      "id": "unique_id",
      "text": "Option text",
      "category": "symptom|severity|duration|location|etc",
      "priority": number (1-10, higher = more important),
      "requires_confirmation": boolean
    }
  ],
  "context_hint": "Brief explanation of why these options",
  "allow_custom_input": boolean
}`;

export const generateResponseOptions = async (
  conversationContext: string,
  agentState: ClinicalState['agent_state'],
  currentSOAP: ClinicalState['soap']
): Promise<ResponseOptions> => {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Missing Anthropic API key");
  }

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
        model: 'claude-3-haiku-20240307',
        max_tokens: 800,
        system: [
          {
            type: 'text',
            text: OPTIONS_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [{
          role: 'user',
          content: `Generate high-fidelity clinical response options.
 
LAST DOCTOR QUESTION: ${conversationContext.split('\n').filter(l => l.startsWith('doctor:')).pop() || conversationContext}
AGENT STATE: ${JSON.stringify(agentState)}
CURRENT SOAP: ${JSON.stringify(currentSOAP)}
 
CRITICAL:
- Provide duration options if asking "when" (e.g., "Started today", "Past 3 days").
- Provide symptom details (severity, type) if needed.
- Return ONLY valid JSON.`
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Options API Error: ${errorData.error?.message || response.status}`);
    }

    const data = await response.json();
    const rawContent = data.content[0].text;
    
    // Robust clinical data extraction and repair (Rule 5: State is Design)
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
      let optionsResponse;
      try {
        optionsResponse = JSON.parse(targetStr);
      } catch (innerError) {
        optionsResponse = JSON.parse(repairJson(targetStr));
      }
      return optionsResponse;
    } catch (e) {
      console.error("Critical: Options JSON Parsing Failed:", rawContent);
      throw new Error("Dr. Dyrane's suggestion model failed to structure its response. Reverting to manual entry.");
    }

  } catch (error) {
    console.error("Options Engine Error:", error);
    // Fallback options
    return {
      mode: 'single',
      options: [
        { id: 'yes', text: 'Yes', category: 'confirmation' },
        { id: 'no', text: 'No', category: 'confirmation' },
        { id: 'unsure', text: 'Not sure', category: 'confirmation' }
      ],
      context_hint: 'Basic confirmation options',
      allow_custom_input: true
    };
  }
};