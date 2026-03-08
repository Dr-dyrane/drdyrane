import { ClinicalState } from '../types/clinical';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are "Dr. Dyrane," a Senior Clinical Registrar.
Your goal is to perform a high-fidelity clinical induction to reach a $P(Diagnosis) > 95%$.

OPERATING PROTOCOLS:
1. Tone: Authoritative, professional, zero filler.
2. Logic: Clinical reasoning must be visible in the "thinking" field.
3. Urgency: Assess case urgency: low, medium, high, or critical.
4. Progressive Disclosure: Ask EXACTLY ONE high-impact question at a time.
5. Investigation: If you need a physical sign, set ui_display.lens_trigger.
6. Resolution: Completion triggered when diagnosis probability > 95%.

OUTPUT FORMAT (STRICT JSON):
{
  "soap_state": { "S": {}, "O": {}, "A": {}, "P": {} },
  "status": "active" | "complete" | "emergency",
  "urgency": "low" | "medium" | "high" | "critical",
  "probability": number (0-100),
  "thinking": "Short internal monologue about current diagnostic focus",
  "red_flag": boolean,
  "pillars": { "diagnosis": "", "management": "", "prognosis": "", "prevention": "" } | null,
  "ui_display": {
    "question": "The next clinical question",
    "options": ["Option A", "Option B"],
    "lens_trigger": string | null
  }
}`;

export const callClinicalEngine = async (
  input: string,
  state: ClinicalState
): Promise<Partial<ClinicalState>> => {
  // Debug env loading
  if (ANTHROPIC_API_KEY) {
    console.log(`Clinical Engine: Key loaded (Prefix: ${ANTHROPIC_API_KEY.substring(0, 10)}...)`);
  } else {
    console.error("Clinical Engine: Key NOT loaded from environment.");
  }

  const redFlags = ['crushing chest pain', 'cannot breathe', 'unconscious', 'torrential bleeding'];
  if (redFlags.some(f => input.toLowerCase().includes(f))) {
    return { status: 'emergency', redFlag: true, urgency: 'critical', probability: 100 };
  }

  if (ANTHROPIC_API_KEY) {
    try {
      // Build a multi-turn conversation from history
      const historyMessages = state.history
        .filter(h => h.status !== 'idle')
        .flatMap(h => {
          const blocks = [];
          if (h.lastFeedback) {
             blocks.push({ role: 'user' as const, content: h.lastFeedback });
          }
          if (h.currentQuestion) {
             blocks.push({ 
               role: 'assistant' as const, 
               content: JSON.stringify({
                 soap_state: h.soap,
                 status: h.status,
                 urgency: h.urgency,
                 probability: h.probability,
                 thinking: h.thinking,
                 ui_display: {
                   question: h.currentQuestion.question,
                   options: h.currentQuestion.options
                 }
               }) 
             });
          }
          return blocks;
        });

      const messages = [
        ...historyMessages,
        { role: 'user' as const, content: input }
      ];

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
          max_tokens: 1500,
          cache_control: { type: 'ephemeral' },
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" }
            }
          ],
          messages: messages
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Clinical Engine API Error Response:", data);
        throw new Error(data.error?.message || `API Error: ${response.status}`);
      }

      if (!data.content || !data.content[0]) {
        console.error("Unexpected API Response Structure:", data);
        throw new Error("Invalid response format from clinical engine.");
      }

      const aiResponse = JSON.parse(data.content[0].text);
      
      return {
        status: aiResponse.status,
        soap: aiResponse.soap_state,
        redFlag: aiResponse.red_flag,
        pillars: aiResponse.pillars,
        urgency: aiResponse.urgency || 'low',
        probability: aiResponse.probability || 0,
        thinking: aiResponse.thinking || '',
        currentQuestion: aiResponse.ui_display ? {
          question: aiResponse.ui_display.question,
          options: aiResponse.ui_display.options
        } : null
      };
    } catch (error) {
      console.error("Clinical Engine API Error:", error);
    }
  } else {
    console.warn("Clinical Engine: Missing API key (VITE_ANTHROPIC_API_KEY). Check your .env file.");
  }

  return { status: 'active', currentQuestion: { question: "Tell me more about the onset.", options: ["Sudden", "Gradual", "Intermittent"] } };
};
