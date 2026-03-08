import { ClinicalState } from '../context/ClinicalContext';

/**
 * Dr. Dyrane Clinical Engine Infrastructure.
 * Connects the frontend to the Anthropic Claude 3.5 Sonnet clinical registrar.
 */

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are "Dr. Dyrane," a Senior Clinical Registrar.
Your goal is to perform a high-fidelity clinical induction to reach a $P(Diagnosis) > 95%$.

OPERATING PROTOCOLS:
1. Tone: Authoritative, professional, zero filler.
2. Logic: Rule out life-threatening pathologies (Ischemia, Sepsis, Obstruction) first.
3. Progressive Disclosure: Ask EXACTLY ONE high-impact question at a time.
4. Investigation: If you need to see a physical sign (rash, eye color, throat), set ui_display.lens_trigger to a descriptive instruction.
5. Resolution: When induction is complete, provide the 4-Pillar output.

OUTPUT FORMAT (STRICT JSON):
{
  "soap_state": { "S": {}, "O": {}, "A": {}, "P": {} },
  "status": "active" | "complete" | "emergency",
  "red_flag": boolean,
  "pillars": { "diagnosis": "", "management": "", "prognosis": "", "prevention": "" } | null,
  "ui_display": {
    "question": "The next clinical question",
    "options": ["Option A", "Option B", "Option C"],
    "lens_trigger": string | null
  }
}`;

export const callClinicalEngine = async (
  input: string,
  state: ClinicalState
): Promise<Partial<ClinicalState>> => {
  // Rapid local triage for extreme red flags
  const redFlags = ['crushing chest pain', 'cannot breathe', 'unconscious', 'torrential bleeding'];
  if (redFlags.some(f => input.toLowerCase().includes(f))) {
    return { status: 'emergency', redFlag: true };
  }

  if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [
            { 
              role: 'user', 
              content: `Session: ${state.sessionId}\nCurrent SOAP: ${JSON.stringify(state.soap)}\nUser Input: "${input}"\n\nAnalyze and provide NEXT clinical step in JSON.` 
            }
          ]
        })
      });

      const data = await response.json();
      const aiResponse = JSON.parse(data.content[0].text);
      
      return {
        status: aiResponse.status,
        soap: aiResponse.soap_state,
        redFlag: aiResponse.red_flag,
        pillars: aiResponse.pillars,
        currentQuestion: aiResponse.ui_display ? {
          question: aiResponse.ui_display.question,
          options: aiResponse.ui_display.options
        } : null
      };
    } catch (error) {
      console.error("Clinical Engine API Error:", error);
    }
  }

  // fallback logic omitted for brevity as we are plugging in the real engine
  return { status: 'active', currentQuestion: { question: "Tell me more about the onset.", options: ["Sudden", "Gradual", "Intermittent"] } };
};
