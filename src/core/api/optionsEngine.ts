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
8. ATOMICITY: Each option MUST represent a single, discrete answer to the specific clinical question. NEVER couple multiple variables (e.g., "Severe and constant") unless the question explicitly asks for a combined state.
9. SINGULAR FOCUS: If the question is about 'When', provide ONLY time-based options. If it's about 'Where', provide ONLY location-based options. No secondary info.

RESPONSE FORMAT (STRICT JSON):
{
  "mode": "single|multiple|freeform|confirm",
  "options": [
    {
      "id": "unique_id",
      "text": "Option text",
      "category": "symptom|severity|duration|location|etc",
      "priority": number (1-10),
      "requires_confirmation": boolean
    }
  ],
  "context_hint": "explanation",
  "allow_custom_input": boolean
}`;

export const generateResponseOptions = async (
  lastQuestion: string,
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
          content: `LAST DOCTOR QUESTION: "${lastQuestion}"
AGENT STATE: ${JSON.stringify(agentState)}
CURRENT SOAP: ${JSON.stringify(currentSOAP)}
 
CRITICAL:
- ATOMIC OPTIONS: One answer per button. No "coupled" responses (e.g., don't mix severity and timing).
- SINGULAR SCOPE: If the question is about one symptom, provide ONLY options for that symptom.
- Return ONLY valid JSON.
`
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