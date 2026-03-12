const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const FALLBACK_MODELS = ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'];

export const CONVERSATION_SYSTEM_PROMPT = `You are Dr. Dyrane, a Senior Clinical Registrar speaking directly to your patient.

CONVERSATION PROTOCOLS:
1. Ask exactly one focused clinical question per turn.
2. Keep responses concise and patient-facing.
3. Do not ask for data already provided in SOAP or profile memory.
4. If visual inspection is required, set lens_trigger with a short instruction.
5. Return only strict JSON.

RESPONSE JSON:
{
  "statement": "brief acknowledgment",
  "question": "single focused question",
  "soap_updates": { "S": {}, "O": {}, "A": {}, "P": {} },
  "ddx": ["condition"],
  "agent_state": {
    "phase": "intake|assessment|differential|resolution|followup",
    "confidence": number,
    "focus_area": "string",
    "pending_actions": [],
    "last_decision": "string"
  },
  "urgency": "low|medium|high|critical",
  "probability": number,
  "thinking": "internal reasoning",
  "needs_options": true,
  "lens_trigger": null,
  "status": "active|emergency|complete"
}`;

export const OPTIONS_SYSTEM_PROMPT = `You are an expert clinical decision support system generating patient response options.

RULES:
- Return only valid JSON.
- Keep options atomic (one clinical variable per option).
- Suggest ui_variant among: stack, grid, binary, segmented, scale, ladder, chips.
- Prefer closed-ended options and allow custom input where useful.
- Match options tightly to the exact question intent.
- Do NOT output generic progression options (e.g., much worse/slightly better) unless the question explicitly asks about change over time.
- For side/laterality questions include options like left/right/both/unclear.
- For trigger questions (deep breath/cough/movement) include trigger-specific or yes/no options.
- For count/frequency questions include numeric ranges.
- Keep options short (2-5 words each) and patient-friendly.

RESPONSE JSON:
{
  "mode": "single|multiple|freeform|confirm",
  "ui_variant": "stack|grid|binary|segmented|scale|ladder|chips",
  "scale": { "min": 1, "max": 10, "step": 1, "low_label": "Low", "high_label": "High" },
  "options": [{ "id": "id", "text": "Option", "category": "category", "priority": 1 }],
  "context_hint": "hint",
  "allow_custom_input": true
}`;

type ConversationEntry = {
  role: 'doctor' | 'patient' | 'system';
  content: string;
};

export type ConsultRequest = {
  patientInput: string;
  state: {
    soap: Record<string, unknown>;
    agent_state: Record<string, unknown>;
    ddx: string[];
    urgency: string;
    probability: number;
    profile: Record<string, unknown>;
    conversation: ConversationEntry[];
  };
};

export type OptionsRequest = {
  lastQuestion: string;
  agentState: Record<string, unknown>;
  currentSOAP: Record<string, unknown>;
};

const normalizeEnvValue = (value: string | undefined): string =>
  (value || '').trim().replace(/^['"]|['"]$/g, '');

export const getApiKey = (): string => {
  const candidates = [
    normalizeEnvValue(process.env.ANTHROPIC_API_KEY),
    normalizeEnvValue(process.env.VITE_ANTHROPIC_API_KEY),
    normalizeEnvValue(process.env.CLAUDE_API_KEY),
  ];
  return candidates.find((value) => value.length > 0) || '';
};

const getModelCandidates = (): string[] => {
  const candidates = [
    normalizeEnvValue(process.env.ANTHROPIC_MODEL),
    normalizeEnvValue(process.env.CLAUDE_MODEL),
    ...FALLBACK_MODELS,
  ];
  return [...new Set(candidates.filter((value) => value.length > 0))];
};

const repairJson = (value: string): string =>
  value
    .replace(/"\s*\n?\s*"/g, '", "')
    .replace(/}\s*\n?\s*"/g, '}, "')
    .replace(/]\s*\n?\s*"/g, '], "')
    .replace(/\{\s*"([^"]+)"\s*(?!:)\}/g, '{"recorded": "$1"}')
    .replace(/,\s*([}\]])/g, '$1');

const parseFirstJsonObject = (text: string): unknown => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const target = jsonMatch ? jsonMatch[0] : text;
  try {
    return JSON.parse(target);
  } catch {
    return JSON.parse(repairJson(target));
  }
};

const shouldRetryWithNextModel = (status: number, body: string): boolean => {
  if (status !== 400 && status !== 404) return false;
  return /model|not[_\s-]?found|invalid_request_error/i.test(body);
};

const callAnthropic = async (payload: Record<string, unknown>): Promise<string> => {
  const apiKey = getApiKey().trim();
  if (!apiKey) {
    throw new Error(
      'Missing Anthropic key on server. Configure ANTHROPIC_API_KEY (or legacy VITE_ANTHROPIC_API_KEY).'
    );
  }

  const models = getModelCandidates();
  if (models.length === 0) {
    throw new Error('No Anthropic model configured. Set ANTHROPIC_MODEL or CLAUDE_MODEL.');
  }

  const basePayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'model')
  );
  let lastErrorMessage = 'Unknown Anthropic failure.';

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...basePayload, model }),
    });

    if (response.ok) {
      const data = (await response.json()) as { content?: Array<{ text?: string }> };
      return data?.content?.[0]?.text || '';
    }

    const body = await response.text();
    lastErrorMessage = `Anthropic request failed (${response.status}) [model:${model}]: ${body}`;
    const hasAnotherCandidate = index < models.length - 1;
    if (hasAnotherCandidate && shouldRetryWithNextModel(response.status, body)) {
      continue;
    }
    throw new Error(lastErrorMessage);
  }

  throw new Error(lastErrorMessage);
};

export const runConsult = async (body: ConsultRequest): Promise<unknown> => {
  const conversationContext = (body.state?.conversation || []).slice(-10).map((entry) => ({
    role: entry.role === 'doctor' ? 'assistant' : 'user',
    content: entry.content,
  }));

  const prompt = `CONTEXT:
Current SOAP: ${JSON.stringify(body.state?.soap || {})}
Agent State: ${JSON.stringify(body.state?.agent_state || {})}
Differential (DDX): ${(body.state?.ddx || []).join(', ')}
Urgency: ${body.state?.urgency || 'low'}
Confidence: ${body.state?.probability || 0}%

Patient Input: "${body.patientInput || ''}"

Patient Profile Memory: ${JSON.stringify(body.state?.profile || {})}

Advance clinical assessment and ask one question.`;

  const raw = await callAnthropic({
    max_tokens: 1024,
    system: [{ type: 'text', text: CONVERSATION_SYSTEM_PROMPT }],
    messages: [...conversationContext, { role: 'user', content: prompt }],
  });

  return parseFirstJsonObject(raw);
};

export const runOptions = async (body: OptionsRequest): Promise<unknown> => {
  const raw = await callAnthropic({
    max_tokens: 900,
    system: [{ type: 'text', text: OPTIONS_SYSTEM_PROMPT }],
    messages: [
      {
        role: 'user',
        content: `LAST DOCTOR QUESTION: "${body.lastQuestion || ''}"
AGENT STATE: ${JSON.stringify(body.agentState || {})}
CURRENT SOAP: ${JSON.stringify(body.currentSOAP || {})}

Return only valid JSON.`,
      },
    ],
  });

  return parseFirstJsonObject(raw);
};
