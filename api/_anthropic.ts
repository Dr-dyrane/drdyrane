const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const FALLBACK_ANTHROPIC_MODELS = ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'];
const FALLBACK_OPENAI_MODELS = ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'];
const FALLBACK_OPENAI_VISION_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];

type LlmProvider = 'anthropic' | 'openai';

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
    memory_dossier?: string;
    conversation: ConversationEntry[];
  };
};

export type OptionsRequest = {
  lastQuestion: string;
  agentState: Record<string, unknown>;
  currentSOAP: Record<string, unknown>;
};

export type VisionRequest = {
  imageDataUrl: string;
  clinicalContext?: string;
  lensPrompt?: string;
};

type ConsultPayload = {
  statement?: string;
  question?: string;
  soap_updates?: {
    S?: Record<string, unknown>;
    O?: Record<string, unknown>;
    A?: Record<string, unknown>;
    P?: Record<string, unknown>;
  };
  ddx?: string[];
  agent_state?: {
    phase?: string;
    confidence?: number;
    focus_area?: string;
    pending_actions?: string[];
    last_decision?: string;
  };
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  probability?: number;
  thinking?: string;
  needs_options?: boolean;
  lens_trigger?: string | null;
  status?: 'idle' | 'intake' | 'active' | 'lens' | 'emergency' | 'complete';
};

type OptionsPayload = {
  mode?: 'single' | 'multiple' | 'freeform' | 'confirm';
  ui_variant?: 'stack' | 'grid' | 'binary' | 'segmented' | 'scale' | 'ladder' | 'chips';
  scale?: {
    min?: number;
    max?: number;
    step?: number;
    low_label?: string;
    high_label?: string;
  };
  options?: Array<{
    id?: string;
    text?: string;
    category?: string;
    priority?: number;
    requires_confirmation?: boolean;
  }>;
  context_hint?: string;
  allow_custom_input?: boolean;
};

type VisionPayload = {
  summary?: string;
  findings?: string[];
  red_flags?: string[];
  confidence?: number;
  recommendation?: string;
};

const URGENCY_RANK: Record<NonNullable<ConsultPayload['urgency']>, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const STATUS_RANK: Record<NonNullable<ConsultPayload['status']>, number> = {
  idle: 0,
  intake: 1,
  active: 2,
  lens: 3,
  complete: 4,
  emergency: 5,
};

export const CONVERSATION_SYSTEM_PROMPT = `You are Dr. Dyrane, a Senior Clinical Registrar speaking directly to your patient.

CONVERSATION PROTOCOLS:
1. Ask exactly one focused clinical question per turn.
2. Keep responses concise and patient-facing.
3. Do not ask for data already provided in SOAP or profile memory.
4. If visual inspection is required, set lens_trigger with a short instruction.
5. Never repeat the same question asked in recent turns; ask the next discriminating question.
6. Use ICD-10 oriented diagnostic framing for medical conditions. Use DSM-5 framing only when the symptom cluster is psychiatric.
7. Keep question length <= 140 characters when possible.
8. Return only strict JSON.
9. Initial epidemiology context is Nigeria unless the patient states another location.
10. For fever-first presentations in Nigeria, consider malaria early in DDX and ask high-yield differentiating questions.
11. In "statement", briefly mirror one specific patient detail so the patient feels heard.
12. Prioritize questions that maximally reduce diagnostic uncertainty in one step.
13. Format each DDX item as "Condition (ICD-10: CODE)" when possible.

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
  "status": "active|emergency|complete|lens"
}`;

export const OPTIONS_SYSTEM_PROMPT = `You are an expert clinical decision support system generating patient response options.

RULES:
- Return only valid JSON.
- Keep options atomic (one clinical variable per option).
- Suggest ui_variant among: stack, grid, binary, segmented, scale, ladder, chips.
- Prefer closed-ended options and allow custom input where useful.
- Match options tightly to the exact question intent.
- Do NOT output generic progression options unless the question explicitly asks change over time.
- Keep options short (2-5 words each) and patient-friendly.
- If question is direct yes/no, return yes/no/not sure only.
- If question asks severity/intensity/rating, return numeric or severity-scale options only.
- If question asks laterality/side, return left/right/both style options.
- Never return laterality options for severity questions (e.g., "how severe ... right now").
- Set context_hint to a short phrase that matches the same intent as the question.

RESPONSE JSON:
{
  "mode": "single|multiple|freeform|confirm",
  "ui_variant": "stack|grid|binary|segmented|scale|ladder|chips",
  "scale": { "min": 1, "max": 10, "step": 1, "low_label": "Low", "high_label": "High" },
  "options": [{ "id": "id", "text": "Option", "category": "category", "priority": 1 }],
  "context_hint": "hint",
  "allow_custom_input": true
}`;

const VISION_SYSTEM_PROMPT = `You are a clinical visual triage assistant.
Analyze the provided image conservatively and return strict JSON only.
Do not provide a definitive diagnosis from image alone.

RESPONSE JSON:
{
  "summary": "single sentence visual summary",
  "findings": ["objective visual finding"],
  "red_flags": ["urgent concern if present"],
  "confidence": number,
  "recommendation": "next best clinical step"
}`;

const normalizeEnvValue = (value: string | undefined): string =>
  (value || '').trim().replace(/^['"]|['"]$/g, '');

const normalizeBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeProvider = (value: string | undefined): LlmProvider | null => {
  const normalized = normalizeEnvValue(value).toLowerCase();
  if (normalized === 'anthropic') return 'anthropic';
  if (normalized === 'openai') return 'openai';
  return null;
};

const getApiKey = (provider: LlmProvider): string => {
  const candidates =
    provider === 'anthropic'
      ? [
          normalizeEnvValue(process.env.ANTHROPIC_API_KEY),
          normalizeEnvValue(process.env.VITE_ANTHROPIC_API_KEY),
          normalizeEnvValue(process.env.CLAUDE_API_KEY),
        ]
      : [
          normalizeEnvValue(process.env.OPENAI_API_KEY),
          normalizeEnvValue(process.env.VITE_OPENAI_API_KEY),
        ];
  return candidates.find((value) => value.length > 0) || '';
};

const getModelCandidates = (
  provider: LlmProvider,
  mode: 'chat' | 'vision' = 'chat'
): string[] => {
  if (provider === 'anthropic') {
    const candidates = [
      normalizeEnvValue(process.env.ANTHROPIC_MODEL),
      normalizeEnvValue(process.env.CLAUDE_MODEL),
      ...FALLBACK_ANTHROPIC_MODELS,
    ];
    return [...new Set(candidates.filter((value) => value.length > 0))];
  }

  const openAiFallback = mode === 'vision' ? FALLBACK_OPENAI_VISION_MODELS : FALLBACK_OPENAI_MODELS;
  const candidates = [
    normalizeEnvValue(mode === 'vision' ? process.env.OPENAI_VISION_MODEL : process.env.OPENAI_MODEL),
    normalizeEnvValue(process.env.OPENAI_MODEL),
    ...openAiFallback,
  ];
  return [...new Set(candidates.filter((value) => value.length > 0))];
};

const hasProviderKey = (provider: LlmProvider): boolean => getApiKey(provider).length > 0;

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

const clampPercent = (value: unknown): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
};

const sanitizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeList = (value: unknown, maxItems: number): string[] =>
  Array.isArray(value)
    ? value.map((item) => sanitizeText(item)).filter(Boolean).slice(0, maxItems)
    : [];

const sanitizeUrgency = (value: unknown): ConsultPayload['urgency'] => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  return 'low';
};

const sanitizeStatus = (value: unknown): ConsultPayload['status'] => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'emergency') return 'emergency';
  if (normalized === 'complete') return 'complete';
  if (normalized === 'lens') return 'lens';
  if (normalized === 'active') return 'active';
  if (normalized === 'intake') return 'intake';
  return 'active';
};

const sanitizeSoap = (value: unknown): ConsultPayload['soap_updates'] => {
  if (!value || typeof value !== 'object') {
    return { S: {}, O: {}, A: {}, P: {} };
  }
  const source = value as Record<string, unknown>;
  return {
    S: (source.S as Record<string, unknown>) || {},
    O: (source.O as Record<string, unknown>) || {},
    A: (source.A as Record<string, unknown>) || {},
    P: (source.P as Record<string, unknown>) || {},
  };
};

const normalizeConsultPayload = (value: unknown): ConsultPayload => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const agentRaw = (source.agent_state && typeof source.agent_state === 'object'
    ? source.agent_state
    : {}) as Record<string, unknown>;

  return {
    statement: sanitizeText(source.statement),
    question: sanitizeText(source.question),
    soap_updates: sanitizeSoap(source.soap_updates),
    ddx: sanitizeList(source.ddx, 8),
    agent_state: {
      phase: sanitizeText(agentRaw.phase) || 'assessment',
      confidence: clampPercent(agentRaw.confidence),
      focus_area: sanitizeText(agentRaw.focus_area) || 'Clinical assessment',
      pending_actions: sanitizeList(agentRaw.pending_actions, 8),
      last_decision: sanitizeText(agentRaw.last_decision) || 'Continuing assessment',
    },
    urgency: sanitizeUrgency(source.urgency),
    probability: clampPercent(source.probability),
    thinking: sanitizeText(source.thinking),
    needs_options: source.needs_options !== false,
    lens_trigger: source.lens_trigger ? sanitizeText(source.lens_trigger) : null,
    status: sanitizeStatus(source.status),
  };
};

const normalizeOptionsPayload = (value: unknown): OptionsPayload => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const validModes = new Set(['single', 'multiple', 'freeform', 'confirm']);
  const validVariants = new Set(['stack', 'grid', 'binary', 'segmented', 'scale', 'ladder', 'chips']);

  const mode = sanitizeText(source.mode).toLowerCase();
  const uiVariant = sanitizeText(source.ui_variant).toLowerCase();

  const options = Array.isArray(source.options)
    ? source.options
        .map((option, index) => {
          const record = (option && typeof option === 'object' ? option : {}) as Record<string, unknown>;
          const text = sanitizeText(record.text);
          if (!text) return null;
          return {
            id: sanitizeText(record.id) || `option-${index + 1}`,
            text,
            category: sanitizeText(record.category) || undefined,
            priority: typeof record.priority === 'number' ? record.priority : undefined,
            requires_confirmation: Boolean(record.requires_confirmation),
          };
        })
        .filter((option): option is NonNullable<typeof option> => Boolean(option))
    : [];

  const scaleRaw = (source.scale && typeof source.scale === 'object'
    ? source.scale
    : {}) as Record<string, unknown>;

  return {
    mode: validModes.has(mode) ? (mode as OptionsPayload['mode']) : 'single',
    ui_variant: validVariants.has(uiVariant) ? (uiVariant as OptionsPayload['ui_variant']) : undefined,
    scale: {
      min: typeof scaleRaw.min === 'number' ? scaleRaw.min : undefined,
      max: typeof scaleRaw.max === 'number' ? scaleRaw.max : undefined,
      step: typeof scaleRaw.step === 'number' ? scaleRaw.step : undefined,
      low_label: sanitizeText(scaleRaw.low_label) || undefined,
      high_label: sanitizeText(scaleRaw.high_label) || undefined,
    },
    options,
    context_hint: sanitizeText(source.context_hint) || undefined,
    allow_custom_input: source.allow_custom_input !== false,
  };
};

const normalizeVisionPayload = (value: unknown): VisionPayload => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    summary: sanitizeText(source.summary),
    findings: sanitizeList(source.findings, 8),
    red_flags: sanitizeList(source.red_flags, 6),
    confidence: clampPercent(source.confidence),
    recommendation: sanitizeText(source.recommendation),
  };
};

const mergeUnique = (left: string[], right: string[], maxItems: number): string[] =>
  [...new Set([...left, ...right])].filter(Boolean).slice(0, maxItems);

const mergeConsultPayloads = (primary: ConsultPayload, secondary: ConsultPayload): ConsultPayload => {
  const mergedUrgency =
    URGENCY_RANK[secondary.urgency || 'low'] > URGENCY_RANK[primary.urgency || 'low']
      ? secondary.urgency
      : primary.urgency;

  const mergedStatus =
    STATUS_RANK[secondary.status || 'active'] > STATUS_RANK[primary.status || 'active']
      ? secondary.status
      : primary.status;

  return {
    ...primary,
    soap_updates: {
      S: { ...(secondary.soap_updates?.S || {}), ...(primary.soap_updates?.S || {}) },
      O: { ...(secondary.soap_updates?.O || {}), ...(primary.soap_updates?.O || {}) },
      A: { ...(secondary.soap_updates?.A || {}), ...(primary.soap_updates?.A || {}) },
      P: { ...(secondary.soap_updates?.P || {}), ...(primary.soap_updates?.P || {}) },
    },
    ddx: mergeUnique(primary.ddx || [], secondary.ddx || [], 8),
    agent_state: {
      phase: primary.agent_state?.phase || secondary.agent_state?.phase || 'assessment',
      confidence: clampPercent(
        ((primary.agent_state?.confidence || 0) + (secondary.agent_state?.confidence || 0)) / 2
      ),
      focus_area: primary.agent_state?.focus_area || secondary.agent_state?.focus_area || '',
      pending_actions: mergeUnique(
        primary.agent_state?.pending_actions || [],
        secondary.agent_state?.pending_actions || [],
        8
      ),
      last_decision: primary.agent_state?.last_decision || secondary.agent_state?.last_decision || '',
    },
    urgency: mergedUrgency || 'low',
    probability: clampPercent(((primary.probability || 0) + (secondary.probability || 0)) / 2),
    thinking: primary.thinking || secondary.thinking || '',
    needs_options: Boolean(primary.needs_options || secondary.needs_options),
    lens_trigger: primary.lens_trigger || secondary.lens_trigger || null,
    status: mergedStatus || 'active',
    statement: primary.statement || secondary.statement || '',
    question: primary.question || secondary.question || '',
  };
};

const mergeOptionsPayloads = (primary: OptionsPayload, secondary: OptionsPayload): OptionsPayload => {
  const primaryOptions = Array.isArray(primary.options) ? primary.options : [];
  const secondaryOptions = Array.isArray(secondary.options) ? secondary.options : [];
  const dedupedMap = new Map<string, NonNullable<OptionsPayload['options']>[number]>();

  for (const option of [...primaryOptions, ...secondaryOptions]) {
    const key = sanitizeText(option.text).toLowerCase();
    if (!key || dedupedMap.has(key)) continue;
    dedupedMap.set(key, option);
  }

  return {
    mode: primary.mode || secondary.mode || 'single',
    ui_variant: primary.ui_variant || secondary.ui_variant,
    scale: primary.scale || secondary.scale,
    options: [...dedupedMap.values()].slice(0, 12),
    context_hint: primary.context_hint || secondary.context_hint,
    allow_custom_input: primary.allow_custom_input !== false || secondary.allow_custom_input !== false,
  };
};

type Icd10Rule = {
  pattern: RegExp;
  code: string;
};

type AgentPhase = NonNullable<NonNullable<ConsultPayload['agent_state']>['phase']>;

type EvidencePattern = {
  pattern: RegExp;
  weight: number;
};

type SuppressionPattern = {
  pattern: RegExp;
  penalty: number;
};

type DiseaseProfile = {
  id: string;
  label: string;
  icd10: string;
  source: 'who_priority' | 'medscape_core';
  minScore: number;
  emergency?: boolean;
  requiredAny?: RegExp[];
  support: EvidencePattern[];
  suppress?: SuppressionPattern[];
  followUpQuestion: string;
  pendingActions: string[];
};

type RankedDisease = {
  profile: DiseaseProfile;
  score: number;
};

const ICD10_RULES: Icd10Rule[] = [
  { pattern: /\bmalaria\b/i, code: 'B54' },
  { pattern: /\bdengue\b/i, code: 'A97.9' },
  { pattern: /\btyphoid\b/i, code: 'A01.0' },
  { pattern: /\binfluenza\b|\bflu\b/i, code: 'J11.1' },
  { pattern: /\bpneumonia\b/i, code: 'J18.9' },
  { pattern: /\bmeningitis\b/i, code: 'G03.9' },
  { pattern: /\bsepsis\b/i, code: 'A41.9' },
  { pattern: /\bgastroenteritis\b|\bacute gastroenteritis\b/i, code: 'A09' },
  { pattern: /\bviral (infection|syndrome)\b/i, code: 'B34.9' },
  { pattern: /\bacute viral infection\b/i, code: 'B34.9' },
  { pattern: /\bviral upper respiratory infection\b|\burti\b/i, code: 'J06.9' },
  { pattern: /\burinary tract infection\b|\buti\b/i, code: 'N39.0' },
  { pattern: /\bbacterial infection\b/i, code: 'A49.9' },
];

const FEVER_DISEASE_PROFILES: DiseaseProfile[] = [
  {
    id: 'meningitis',
    label: 'Meningitis',
    icd10: 'G03.9',
    source: 'who_priority',
    emergency: true,
    minScore: 3.2,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\bneck stiffness|stiff neck|photophobia\b/i, weight: 2.5 },
      { pattern: /\bconfusion|altered mental status|disoriented\b/i, weight: 2.3 },
      { pattern: /\bseizure|fits\b/i, weight: 2.4 },
      { pattern: /\bsevere headache\b/i, weight: 1.6 },
    ],
    followUpQuestion:
      'Do you have neck stiffness, confusion, or severe persistent headache right now?',
    pendingActions: ['Urgent neurologic assessment', 'Immediate referral and emergency workup'],
  },
  {
    id: 'sepsis',
    label: 'Sepsis',
    icd10: 'A41.9',
    source: 'who_priority',
    emergency: true,
    minScore: 3.2,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\blow blood pressure|hypotension|faint|collapse\b/i, weight: 2.5 },
      { pattern: /\bconfusion|lethargy|drowsy\b/i, weight: 2.1 },
      { pattern: /\bfast breathing|breathless|tachypnea\b/i, weight: 1.8 },
      { pattern: /\bfast heart|palpitation|tachycardia\b/i, weight: 1.5 },
    ],
    followUpQuestion:
      'Any confusion, very fast breathing, fainting, or low blood pressure symptoms now?',
    pendingActions: ['Sepsis screen and vitals', 'Urgent facility escalation if unstable'],
  },
  {
    id: 'malaria',
    label: 'Malaria',
    icd10: 'B54',
    source: 'who_priority',
    minScore: 3,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\bchills?|rigors?\b/i, weight: 2.2 },
      { pattern: /\bheadache|behind (my )?eyes?|retro[-\s]?orbital\b/i, weight: 1.7 },
      { pattern: /\bbody aches?|myalgia|muscle pain\b/i, weight: 1.2 },
      { pattern: /\bnausea|vomit(ing)?\b/i, weight: 1.1 },
      { pattern: /\bweak(ness)?|fatigue\b/i, weight: 0.9 },
      { pattern: /\bmosquito(es)? bite(s)?|travel\b/i, weight: 1 },
    ],
    followUpQuestion:
      'Can you access a malaria rapid test or blood smear today, and do you have any danger signs?',
    pendingActions: ['Confirm with malaria RDT or blood smear', 'Screen for severe malaria danger signs'],
  },
  {
    id: 'dengue',
    label: 'Dengue Fever',
    icd10: 'A97.9',
    source: 'who_priority',
    minScore: 2.8,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\bbehind (my )?eyes?|retro[-\s]?orbital\b/i, weight: 2.1 },
      { pattern: /\brash\b/i, weight: 1.8 },
      { pattern: /\bbleeding|gum bleed|nose bleed\b/i, weight: 2.2 },
      { pattern: /\bbody aches?|myalgia|bone pain\b/i, weight: 1.3 },
      { pattern: /\bnausea|vomit(ing)?\b/i, weight: 1 },
    ],
    followUpQuestion:
      'Any rash, bleeding, or severe abdominal pain that could suggest dengue warning signs?',
    pendingActions: ['Assess dengue warning signs', 'Plan CBC/platelet monitoring'],
  },
  {
    id: 'typhoid',
    label: 'Typhoid Fever',
    icd10: 'A01.0',
    source: 'medscape_core',
    minScore: 2.4,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\babdominal pain|stomach pain\b/i, weight: 1.4 },
      { pattern: /\bdiarrhea|constipation\b/i, weight: 1.2 },
      { pattern: /\bpoor appetite|loss of appetite\b/i, weight: 0.8 },
      { pattern: /\bnausea|vomit(ing)?\b/i, weight: 0.8 },
    ],
    followUpQuestion: 'Any abdominal pain, bowel habit change, or contaminated food/water exposure?',
    pendingActions: ['Consider blood/stool culture workup', 'Review enteric fever risk exposure'],
  },
  {
    id: 'pneumonia',
    label: 'Pneumonia',
    icd10: 'J18.9',
    source: 'medscape_core',
    minScore: 2.5,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\bcough\b/i, weight: 1.7 },
      { pattern: /\bshortness of breath|breathless\b/i, weight: 1.8 },
      { pattern: /\bchest pain\b/i, weight: 1.4 },
    ],
    suppress: [{ pattern: /\bno cough\b/i, penalty: 1.8 }],
    followUpQuestion: 'Do you have cough, chest pain, or shortness of breath?',
    pendingActions: ['Evaluate respiratory findings', 'Assess oxygenation and chest exam'],
  },
  {
    id: 'uti',
    label: 'Urinary Tract Infection',
    icd10: 'N39.0',
    source: 'medscape_core',
    minScore: 2.3,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\bburning urination|dysuria\b/i, weight: 2 },
      { pattern: /\bfrequency|urgency\b/i, weight: 1.4 },
      { pattern: /\bflank pain|loin pain\b/i, weight: 1.5 },
    ],
    suppress: [{ pattern: /\bno burning urination\b/i, penalty: 2 }],
    followUpQuestion: 'Any burning urination, urinary frequency, or flank pain?',
    pendingActions: ['Urinalysis and urine culture pathway', 'Assess for upper UTI features'],
  },
  {
    id: 'influenza',
    label: 'Influenza',
    icd10: 'J11.1',
    source: 'medscape_core',
    minScore: 2.2,
    requiredAny: [/\bfever|pyrexia|temperature|febrile\b/i],
    support: [
      { pattern: /\bcough\b/i, weight: 1.5 },
      { pattern: /\bsore throat\b/i, weight: 1.4 },
      { pattern: /\brunny nose|nasal congestion\b/i, weight: 1.3 },
      { pattern: /\bbody aches?|myalgia\b/i, weight: 1 },
    ],
    suppress: [
      { pattern: /\bno cough\b/i, penalty: 1.4 },
      { pattern: /\bno sore throat\b/i, penalty: 1.1 },
    ],
    followUpQuestion: 'Any cough, sore throat, or runny nose consistent with influenza-like illness?',
    pendingActions: ['Assess influenza-like illness criteria', 'Supportive care and risk review'],
  },
];

const stripIcd10Label = (diagnosis: string): string =>
  diagnosis.replace(/\s*\(ICD-10:\s*[A-Z0-9.]+\)\s*/gi, '').trim();

const normalizeDxKey = (diagnosis: string): string =>
  stripIcd10Label(diagnosis)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const applyIcd10Label = (diagnosis: string): string => {
  const value = sanitizeText(diagnosis);
  if (!value) return '';
  if (/\(ICD-10:\s*[A-Z0-9.]+\)/i.test(value)) return value;
  const rule = ICD10_RULES.find((candidate) => candidate.pattern.test(value));
  if (!rule) return value;
  return `${value} (ICD-10: ${rule.code})`;
};

const dedupeDxList = (diagnoses: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const diagnosis of diagnoses) {
    const normalized = normalizeDxKey(diagnosis);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(diagnosis);
  }
  return result;
};

const buildConsultTextCorpus = (body: ConsultRequest, payload: ConsultPayload): string => {
  const patientNarrative = (body.state?.conversation || [])
    .filter((entry) => entry.role === 'patient')
    .map((entry) => entry.content)
    .join(' ');

  const soapSnapshot = JSON.stringify({
    ...(body.state?.soap?.S || {}),
    ...(payload.soap_updates?.S || {}),
  });

  return `${body.patientInput || ''} ${patientNarrative} ${soapSnapshot}`.toLowerCase();
};

const hasFeverSignal = (corpus: string): boolean =>
  /\bfever|pyrexia|temperature|febrile\b/i.test(corpus);

const scoreDisease = (profile: DiseaseProfile, corpus: string): number => {
  if (!hasFeverSignal(corpus)) return 0;
  if (profile.requiredAny && !profile.requiredAny.some((pattern) => pattern.test(corpus))) {
    return 0;
  }

  let score = profile.source === 'who_priority' ? 0.6 : 0.3;
  for (const item of profile.support) {
    if (item.pattern.test(corpus)) {
      score += item.weight;
    }
  }
  for (const item of profile.suppress || []) {
    if (item.pattern.test(corpus)) {
      score -= item.penalty;
    }
  }

  return Math.max(0, Math.round(score * 10) / 10);
};

const rankTopDownFeverDifferentials = (corpus: string): RankedDisease[] => {
  if (!hasFeverSignal(corpus)) return [];

  return FEVER_DISEASE_PROFILES.map((profile) => ({
    profile,
    score: scoreDisease(profile, corpus),
  }))
    .filter((entry) => entry.score >= entry.profile.minScore)
    .sort((left, right) => {
      if (left.profile.emergency && !right.profile.emergency) return -1;
      if (!left.profile.emergency && right.profile.emergency) return 1;
      return right.score - left.score;
    });
};

const diseaseToDx = (entry: RankedDisease): string =>
  `${entry.profile.label} (ICD-10: ${entry.profile.icd10})`;

const scoreToProbabilityFloor = (entry: RankedDisease): number => {
  if (entry.profile.emergency) return Math.max(84, Math.min(96, Math.round(entry.score * 12)));
  if (entry.score >= 7) return 82;
  if (entry.score >= 5.5) return 74;
  if (entry.score >= 4.5) return 68;
  return 58;
};

const shouldOverrideQuestion = (
  question: string | undefined,
  lead: RankedDisease,
  corpus: string
): boolean => {
  const normalized = sanitizeText(question).toLowerCase();
  if (!normalized) return true;
  if (/(anything else|tell me more|more details|any other symptom)/i.test(normalized)) return true;

  if (lead.profile.id === 'malaria') {
    const mentionsTest = /\b(rdt|rapid test|blood smear|thick|thin film)\b/i.test(normalized);
    const alreadyDiscussedTest = /\b(rdt|rapid test|blood smear|thick|thin film)\b/i.test(corpus);
    if (!mentionsTest && !alreadyDiscussedTest) return true;
  }

  return false;
};

const atLeastDifferential = (phase: string | undefined): AgentPhase => {
  const normalized = sanitizeText(phase).toLowerCase();
  if (normalized === 'resolution' || normalized === 'followup' || normalized === 'differential') {
    return normalized as AgentPhase;
  }
  return 'differential';
};

const applyClinicalHeuristics = (body: ConsultRequest, payload: ConsultPayload): ConsultPayload => {
  const withCodedDdx = dedupeDxList((payload.ddx || []).map((entry) => applyIcd10Label(entry)));
  const corpus = buildConsultTextCorpus(body, payload);
  const ranked = rankTopDownFeverDifferentials(corpus);

  if (ranked.length === 0) {
    return {
      ...payload,
      ddx: withCodedDdx,
    };
  }

  const topDownDdx = ranked.map((entry) => diseaseToDx(entry));
  const mergedDdx = dedupeDxList([...topDownDdx, ...withCodedDdx]).slice(0, 8);
  const lead = ranked[0];
  const probabilityFloor = scoreToProbabilityFloor(lead);
  const preferredQuestion = shouldOverrideQuestion(payload.question, lead, corpus)
    ? lead.profile.followUpQuestion
    : payload.question;
  const nextActions = dedupeDxList([
    ...(payload.agent_state?.pending_actions || []),
    ...lead.profile.pendingActions,
    'Apply WHO/Medscape aligned differential confirmation steps',
  ]);
  const nextPhase = lead.profile.emergency
    ? payload.agent_state?.phase || 'assessment'
    : atLeastDifferential(payload.agent_state?.phase);

  return {
    ...payload,
    ddx: mergedDdx,
    probability: Math.max(clampPercent(payload.probability), probabilityFloor),
    agent_state: {
      phase: nextPhase,
      confidence: Math.max(clampPercent(payload.agent_state?.confidence), probabilityFloor),
      focus_area:
        payload.agent_state?.focus_area || `${lead.profile.label} focused top-down differentiation`,
      pending_actions: nextActions.slice(0, 8),
      last_decision:
        `Top-down differential ranking prioritized ${lead.profile.label} using ${lead.profile.source} evidence profile`,
    },
    question: preferredQuestion,
  };
};

const shouldRetryWithNextModel = (
  provider: LlmProvider,
  status: number,
  body: string
): boolean => {
  if (status !== 400 && status !== 404) return false;

  if (provider === 'anthropic') {
    return /model|not[_\s-]?found|invalid_request_error/i.test(body);
  }

  return /model|does not exist|invalid[_\s-]?model|not[_\s-]?found/i.test(body);
};

const extractOpenAiText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const node = item as Record<string, unknown>;
        return sanitizeText(node.text);
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

const callAnthropic = async (input: {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  temperature?: number;
}): Promise<string> => {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'Missing Anthropic key on server. Configure ANTHROPIC_API_KEY (or legacy VITE_ANTHROPIC_API_KEY).'
    );
  }

  const models = getModelCandidates('anthropic');
  if (models.length === 0) {
    throw new Error('No Anthropic model configured. Set ANTHROPIC_MODEL or CLAUDE_MODEL.');
  }

  let lastErrorMessage = 'Unknown Anthropic failure.';
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens,
          temperature: input.temperature ?? 0.2,
          system: [{ type: 'text', text: input.systemPrompt }],
          messages: input.messages,
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as { content?: Array<{ text?: string }> };
        return data?.content?.[0]?.text || '';
      }

      const body = await response.text();
      lastErrorMessage = `Anthropic request failed (${response.status}) [model:${model}]: ${body}`;
      const hasAnotherCandidate = index < models.length - 1;
      if (hasAnotherCandidate && shouldRetryWithNextModel('anthropic', response.status, body)) {
        continue;
      }
      throw new Error(lastErrorMessage);
    } catch (error) {
      const hasAnotherCandidate = index < models.length - 1;
      lastErrorMessage = error instanceof Error ? error.message : lastErrorMessage;
      if (!hasAnotherCandidate) {
        throw new Error(lastErrorMessage);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastErrorMessage);
};

const callOpenAI = async (input: {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }>;
  }>;
  maxTokens: number;
  mode?: 'chat' | 'vision';
  forceJson?: boolean;
  temperature?: number;
}): Promise<string> => {
  const apiKey = getApiKey('openai');
  if (!apiKey) {
    throw new Error('Missing OpenAI key on server. Configure OPENAI_API_KEY.');
  }

  const mode = input.mode || 'chat';
  const models = getModelCandidates('openai', mode);
  if (models.length === 0) {
    throw new Error('No OpenAI model configured. Set OPENAI_MODEL.');
  }

  let lastErrorMessage = 'Unknown OpenAI failure.';
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(OPENAI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          max_tokens: input.maxTokens,
          temperature: input.temperature ?? 0.2,
          ...(input.forceJson ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
        };
        const content = data?.choices?.[0]?.message?.content;
        return extractOpenAiText(content);
      }

      const body = await response.text();
      lastErrorMessage = `OpenAI request failed (${response.status}) [model:${model}]: ${body}`;
      const hasAnotherCandidate = index < models.length - 1;
      if (hasAnotherCandidate && shouldRetryWithNextModel('openai', response.status, body)) {
        continue;
      }
      throw new Error(lastErrorMessage);
    } catch (error) {
      const hasAnotherCandidate = index < models.length - 1;
      lastErrorMessage = error instanceof Error ? error.message : lastErrorMessage;
      if (!hasAnotherCandidate) {
        throw new Error(lastErrorMessage);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastErrorMessage);
};

const selectPrimaryProviderForConsult = (body: ConsultRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_CONSULT_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const urgency = sanitizeText(body.state?.urgency).toLowerCase();
  const phase = sanitizeText(body.state?.agent_state?.phase as string).toLowerCase();
  const textCorpus = `${body.patientInput || ''} ${body.state?.memory_dossier || ''}`.toLowerCase();

  if (urgency === 'high' || urgency === 'critical') return 'anthropic';
  if (phase === 'differential' || phase === 'resolution') return 'anthropic';
  if (/(chest pain|shortness of breath|stroke|seizure|faint|collapse|confusion)/i.test(textCorpus)) {
    return 'anthropic';
  }
  if (/(rash|lesion|ulcer|swelling|bruise|skin|eye|vision|photo|image)/i.test(textCorpus)) {
    return 'openai';
  }
  return 'openai';
};

const selectPrimaryProviderForOptions = (body: OptionsRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_OPTIONS_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const question = sanitizeText(body.lastQuestion).toLowerCase();
  const phase = sanitizeText(body.agentState?.phase as string).toLowerCase();

  if (phase === 'differential' || phase === 'resolution') return 'anthropic';
  if (/(yes or no|\\?|scale|rate|1-10|one to ten|severity)/i.test(question)) return 'openai';
  return 'openai';
};

const resolveProviderOrder = (primary: LlmProvider): LlmProvider[] =>
  primary === 'anthropic' ? ['anthropic', 'openai'] : ['openai', 'anthropic'];

const runCollaborative = async <T>(
  providers: LlmProvider[],
  collaborationEnabled: boolean,
  invoke: (provider: LlmProvider) => Promise<T>,
  merge: (primary: T, secondary: T) => T
): Promise<T> => {
  const available = providers.filter((provider) => hasProviderKey(provider));
  if (available.length === 0) {
    throw new Error('No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  if (!collaborationEnabled || available.length < 2) {
    return invoke(available[0]);
  }

  const [primaryProvider, secondaryProvider] = available;
  const [primaryResult, secondaryResult] = await Promise.allSettled([
    invoke(primaryProvider),
    invoke(secondaryProvider),
  ]);

  if (primaryResult.status === 'fulfilled' && secondaryResult.status === 'fulfilled') {
    return merge(primaryResult.value, secondaryResult.value);
  }

  if (primaryResult.status === 'fulfilled') {
    return primaryResult.value;
  }

  if (secondaryResult.status === 'fulfilled') {
    return secondaryResult.value;
  }

  const primaryReason =
    primaryResult.status === 'rejected' && primaryResult.reason instanceof Error
      ? primaryResult.reason.message
      : 'Primary provider failed.';
  const secondaryReason =
    secondaryResult.status === 'rejected' && secondaryResult.reason instanceof Error
      ? secondaryResult.reason.message
      : 'Secondary provider failed.';
  throw new Error(`${primaryReason} | ${secondaryReason}`);
};

const buildConversationPrompt = (body: ConsultRequest): string => {
  const recentDoctorQuestions = (body.state?.conversation || [])
    .filter((entry) => entry.role === 'doctor')
    .map((entry) => entry.content)
    .slice(-4);

  return `CONTEXT:
Current SOAP: ${JSON.stringify(body.state?.soap || {})}
Agent State: ${JSON.stringify(body.state?.agent_state || {})}
Differential (DDX): ${(body.state?.ddx || []).join(', ')}
Urgency: ${body.state?.urgency || 'low'}
Confidence: ${body.state?.probability || 0}%
Recent Doctor Questions: ${JSON.stringify(recentDoctorQuestions)}
Clinical Memory Dossier: ${body.state?.memory_dossier || 'No structured dossier yet.'}
Deployment Region: Nigeria (default context)

Patient Input: "${body.patientInput || ''}"

Patient Profile Memory: ${JSON.stringify(body.state?.profile || {})}

Advance clinical assessment and ask one question.`;
};

const executeConsultWithProvider = async (
  provider: LlmProvider,
  body: ConsultRequest
): Promise<ConsultPayload> => {
  const conversationContext = (body.state?.conversation || []).slice(-12).map((entry) => ({
    role: entry.role === 'doctor' ? 'assistant' : 'user',
    content: entry.content,
  })) as Array<{ role: 'assistant' | 'user'; content: string }>;

  const prompt = buildConversationPrompt(body);

  const raw =
    provider === 'anthropic'
      ? await callAnthropic({
          maxTokens: 680,
          systemPrompt: CONVERSATION_SYSTEM_PROMPT,
          messages: [...conversationContext, { role: 'user', content: prompt }],
        })
      : await callOpenAI({
          maxTokens: 680,
          forceJson: true,
          messages: [
            { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
            ...conversationContext,
            { role: 'user', content: prompt },
          ],
        });

  return normalizeConsultPayload(parseFirstJsonObject(raw));
};

const executeOptionsWithProvider = async (
  provider: LlmProvider,
  body: OptionsRequest
): Promise<OptionsPayload> => {
  const userPrompt = `LAST DOCTOR QUESTION: "${body.lastQuestion || ''}"
AGENT STATE: ${JSON.stringify(body.agentState || {})}
CURRENT SOAP: ${JSON.stringify(body.currentSOAP || {})}

Return only valid JSON.`;

  const raw =
    provider === 'anthropic'
      ? await callAnthropic({
          maxTokens: 460,
          systemPrompt: OPTIONS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        })
      : await callOpenAI({
          maxTokens: 460,
          forceJson: true,
          messages: [
            { role: 'system', content: OPTIONS_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });

  return normalizeOptionsPayload(parseFirstJsonObject(raw));
};

export const runConsult = async (body: ConsultRequest): Promise<unknown> => {
  const primaryProvider = selectPrimaryProviderForConsult(body);
  const providerOrder = resolveProviderOrder(primaryProvider);
  const collaborationEnabled = normalizeBooleanEnv(process.env.LLM_COLLABORATION, true);
  const response = await runCollaborative(
    providerOrder,
    collaborationEnabled,
    (provider) => executeConsultWithProvider(provider, body),
    mergeConsultPayloads
  );
  return applyClinicalHeuristics(body, response);
};

export const runOptions = async (body: OptionsRequest): Promise<unknown> => {
  const primaryProvider = selectPrimaryProviderForOptions(body);
  const providerOrder = resolveProviderOrder(primaryProvider);
  const collaborationEnabled = normalizeBooleanEnv(process.env.LLM_OPTIONS_COLLABORATION, true);

  return runCollaborative(
    providerOrder,
    collaborationEnabled,
    (provider) => executeOptionsWithProvider(provider, body),
    mergeOptionsPayloads
  );
};

export const runVision = async (body: VisionRequest): Promise<unknown> => {
  const imageDataUrl = sanitizeText(body.imageDataUrl);
  if (!imageDataUrl.startsWith('data:image/')) {
    throw new Error('Vision API expects a base64 data URL image payload.');
  }

  if (!hasProviderKey('openai')) {
    throw new Error('Missing OpenAI key for vision analysis. Set OPENAI_API_KEY.');
  }

  const contextPrompt = sanitizeText(body.clinicalContext) || 'No extra clinical context provided.';
  const lensPrompt = sanitizeText(body.lensPrompt) || 'Analyze clinically relevant visual cues.';

  const raw = await callOpenAI({
    mode: 'vision',
    maxTokens: 420,
    forceJson: false,
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Clinical context: ${contextPrompt}\nTask: ${lensPrompt}\nReturn strict JSON.`,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
              detail: 'high',
            },
          },
        ],
      },
    ],
  });

  return normalizeVisionPayload(parseFirstJsonObject(raw));
};
