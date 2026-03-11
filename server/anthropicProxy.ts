import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-3-haiku-20240307';

const CONVERSATION_SYSTEM_PROMPT = `You are Dr. Dyrane, a Senior Clinical Registrar speaking directly to your patient.

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

const OPTIONS_SYSTEM_PROMPT = `You are an expert clinical decision support system generating patient response options.

RULES:
- Return only valid JSON.
- Keep options atomic (one clinical variable per option).
- Suggest ui_variant among: stack, grid, binary, segmented, scale, ladder, chips.
- Prefer closed-ended options and allow custom input where useful.

RESPONSE JSON:
{
  "mode": "single|multiple|freeform|confirm",
  "ui_variant": "stack|grid|binary|segmented|scale|ladder|chips",
  "scale": { "min": 1, "max": 10, "step": 1, "low_label": "Low", "high_label": "High" },
  "options": [{ "id": "id", "text": "Option", "category": "category", "priority": 1 }],
  "context_hint": "hint",
  "allow_custom_input": true
}`;

const getApiKey = (): string =>
  process.env.ANTHROPIC_API_KEY || '';

const readJsonBody = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
};

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown): void => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const repairJson = (value: string): string =>
  value
    .replace(/"\s*\n?\s*"/g, '", "')
    .replace(/}\s*\n?\s*"/g, '}, "')
    .replace(/]\s*\n?\s*"/g, '], "')
    .replace(/\{\s*"([^"]+)"\s*(?!\:)\}/g, '{"recorded": "$1"}')
    .replace(/,\s*([}\]])/g, '$1');

const parseFirstJsonObject = (text: string): any => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const target = jsonMatch ? jsonMatch[0] : text;
  try {
    return JSON.parse(target);
  } catch {
    return JSON.parse(repairJson(target));
  }
};

const callAnthropic = async (payload: unknown): Promise<string> => {
  const apiKey = getApiKey().trim();
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY on server.');
  }

  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${body}`);
  }

  const data: any = await response.json();
  return data?.content?.[0]?.text || '';
};

const getClientId = (req: IncomingMessage): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw && typeof raw === 'string') {
    return raw.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'local';
};

const requestCounters = new Map<string, { count: number; resetAt: number }>();

const checkRateLimit = (
  req: IncomingMessage,
  routeKey: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } => {
  const now = Date.now();
  const key = `${routeKey}:${getClientId(req)}`;
  const existing = requestCounters.get(key);

  if (!existing || now >= existing.resetAt) {
    requestCounters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  requestCounters.set(key, existing);
  return { allowed: true, retryAfter: 0 };
};

type ConsultRequest = {
  patientInput: string;
  state: {
    soap: Record<string, unknown>;
    agent_state: Record<string, unknown>;
    ddx: string[];
    urgency: string;
    probability: number;
    profile: Record<string, unknown>;
    conversation: Array<{ role: 'doctor' | 'patient' | 'system'; content: string }>;
  };
};

type OptionsRequest = {
  lastQuestion: string;
  agentState: Record<string, unknown>;
  currentSOAP: Record<string, unknown>;
};

const handleConsult = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const body = await readJsonBody<ConsultRequest>(req);
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
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: CONVERSATION_SYSTEM_PROMPT }],
    messages: [
      ...conversationContext,
      { role: 'user', content: prompt },
    ],
  });

  const parsed = parseFirstJsonObject(raw);
  writeJson(res, 200, parsed);
};

const handleOptions = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const body = await readJsonBody<OptionsRequest>(req);

  const raw = await callAnthropic({
    model: DEFAULT_MODEL,
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

  const parsed = parseFirstJsonObject(raw);
  writeJson(res, 200, parsed);
};

const handleError = (res: ServerResponse, error: unknown): void => {
  console.error('[dr-dyrane-api]', error);
  writeJson(res, 500, {
    error: error instanceof Error ? error.message : 'Server proxy failure.',
  });
};

const guardAndRun = (
  req: IncomingMessage,
  res: ServerResponse,
  routeKey: string,
  limit: number,
  windowMs: number,
  runner: () => Promise<void>
): void => {
  const rate = checkRateLimit(req, routeKey, limit, windowMs);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    writeJson(res, 429, { error: 'Rate limit exceeded.', retry_after_seconds: rate.retryAfter });
    return;
  }

  void runner().catch((error) => handleError(res, error));
};

const routeMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  const path = (req.url || '').split('?')[0];
  const method = req.method || 'GET';

  if (method === 'POST' && path === '/api/consult') {
    guardAndRun(req, res, 'consult', 45, 60_000, async () => handleConsult(req, res));
    return;
  }

  if (method === 'POST' && path === '/api/options') {
    guardAndRun(req, res, 'options', 90, 60_000, async () => handleOptions(req, res));
    return;
  }

  next();
};

export const attachAnthropicProxy = (middlewares: Connect.Server): void => {
  middlewares.use(routeMiddleware);
};
