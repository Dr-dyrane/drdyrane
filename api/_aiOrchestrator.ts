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
    positive_findings?: string[];
    negative_findings?: string[];
    must_not_miss_checkpoint?: {
      required?: boolean;
      status?: 'idle' | 'pending' | 'cleared' | 'escalate';
      last_question?: string;
      last_response?: string;
      updated_at?: number;
    };
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
  spot_diagnosis?: {
    label?: string;
    icd10?: string;
    confidence?: number;
    rationale?: string;
  };
  differentials?: Array<{
    label?: string;
    icd10?: string;
    likelihood?: 'high' | 'medium' | 'low' | string;
    rationale?: string;
  }>;
  treatment_summary?: string;
  treatment_lines?: string[];
  investigations?: string[];
  counseling?: string[];
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
5b. Keep this chat-first. Use guided options as assistive suggestions, not as a rigid survey flow.
6. Use ICD-10 oriented diagnostic framing for medical conditions. Use DSM-5 framing only when the symptom cluster is psychiatric.
7. Keep question length <= 140 characters when possible.
8. Return only strict JSON.
9. Initial epidemiology context is Nigeria unless the patient states another location.
10. For fever-first presentations in Nigeria, consider malaria early in DDX and ask high-yield differentiating questions.
11. In "statement", briefly mirror one specific patient detail so the patient feels heard.
12. Prioritize questions that maximally reduce diagnostic uncertainty in one step.
13. Format each DDX item as "Condition (ICD-10: CODE)" when possible.
14. During intake, capture duration early if missing, but keep the flow conversational and do not force rigid multi-step intake gates.
15. Keep DDX explicitly structured as: top likely conditions plus at least one must-not-miss dangerous alternative.
16. Use timeline classes (hyperacute, acute, subacute, chronic) and risk context (age, sex, exposures, travel, medications) to prioritize DDX.
17. Use both positive and negative evidence from history to raise or lower diagnostic likelihood.
18. In internal reasoning, challenge anchor bias by checking at least one plausible alternative explanation.
19. Recommend targeted confirmatory tests only after history has produced a focused working differential.
20. Maintain explicit agent_state memory for both positive_findings and negative_findings.
21. If final output is near, include must_not_miss_checkpoint status and the last safety question/response.

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
    "last_decision": "string",
    "positive_findings": ["string"],
    "negative_findings": ["string"],
    "must_not_miss_checkpoint": {
      "required": true,
      "status": "idle|pending|cleared|escalate",
      "last_question": "string",
      "last_response": "string",
      "updated_at": 0
    }
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
- If question asks duration or onset, return timeline options (e.g., started today, 1-2 days, 3-4 days, 5-7 days, >1 week).
- If question asks "any other complaint" or equivalent, return yes/no/not sure only.
- Do not return count-range options unless the question explicitly asks quantity (how many, count, frequency per timeframe).

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

const VISION_ENRICHMENT_PROMPT = `You are a clinical visual review enrichment assistant.
Use the already-computed base visual summary + findings + red flags and provided context to suggest optional structured clinical enrichment.
Do not overwrite base summary/recommendation. Avoid definitive diagnosis; use provisional language.
If uncertain, omit fields or return empty arrays.

RESPONSE JSON:
{
  "spot_diagnosis": {
    "label": "provisional diagnosis",
    "icd10": "ICD-10 code if known",
    "confidence": 0,
    "rationale": "short reason"
  },
  "differentials": [
    {
      "label": "differential label",
      "icd10": "ICD-10 code if known",
      "likelihood": "high|medium|low",
      "rationale": "short reason"
    }
  ],
  "treatment_summary": "high-level treatment intent",
  "treatment_lines": ["medication or intervention line"],
  "investigations": ["test"],
  "counseling": ["key counseling point"]
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
          normalizeEnvValue(process.env.CLAUDE_API_KEY),
        ]
      : [
          normalizeEnvValue(process.env.OPENAI_API_KEY),
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

const clampVisionConfidencePercent = (value: unknown): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return 0;
  const scaled = num > 0 && num <= 1 ? num * 100 : num;
  return Math.max(0, Math.min(100, Math.round(scaled)));
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

const sanitizeCheckpointStatus = (
  value: unknown
): NonNullable<NonNullable<ConsultPayload['agent_state']>['must_not_miss_checkpoint']>['status'] => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'pending') return 'pending';
  if (normalized === 'cleared') return 'cleared';
  if (normalized === 'escalate') return 'escalate';
  return 'idle';
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
  const checkpointRaw = (agentRaw.must_not_miss_checkpoint && typeof agentRaw.must_not_miss_checkpoint === 'object'
    ? agentRaw.must_not_miss_checkpoint
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
      positive_findings: sanitizeList(agentRaw.positive_findings, 24),
      negative_findings: sanitizeList(agentRaw.negative_findings, 24),
      must_not_miss_checkpoint: {
        required: Boolean(checkpointRaw.required),
        status: sanitizeCheckpointStatus(checkpointRaw.status),
        last_question: sanitizeText(checkpointRaw.last_question) || undefined,
        last_response: sanitizeText(checkpointRaw.last_response) || undefined,
        updated_at:
          typeof checkpointRaw.updated_at === 'number'
            ? checkpointRaw.updated_at
            : Number(checkpointRaw.updated_at) || undefined,
      },
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
  const spotRaw =
    source.spot_diagnosis && typeof source.spot_diagnosis === 'object'
      ? (source.spot_diagnosis as Record<string, unknown>)
      : {};
  const spotLabel = sanitizeText(spotRaw.label);
  const differentialsRaw = Array.isArray(source.differentials)
    ? (source.differentials as Array<Record<string, unknown>>)
    : [];
  const differentials = differentialsRaw
    .map((entry) => {
      const label = sanitizeText(entry.label);
      if (!label) return null;
      const likelihoodRaw = sanitizeText(entry.likelihood).toLowerCase();
      const likelihood =
        likelihoodRaw === 'high' || likelihoodRaw === 'low' || likelihoodRaw === 'medium'
          ? (likelihoodRaw as 'high' | 'medium' | 'low')
          : 'medium';
      return {
        label,
        icd10: sanitizeText(entry.icd10) || undefined,
        likelihood,
        rationale: sanitizeText(entry.rationale) || undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);
  const treatmentLines = sanitizeList(source.treatment_lines, 8);
  const investigations = sanitizeList(source.investigations, 8);
  const counseling = sanitizeList(source.counseling, 8);
  return {
    summary: sanitizeText(source.summary),
    findings: sanitizeList(source.findings, 8),
    red_flags: sanitizeList(source.red_flags, 6),
    confidence: clampVisionConfidencePercent(source.confidence),
    recommendation: sanitizeText(source.recommendation),
    spot_diagnosis: spotLabel
      ? {
          label: spotLabel,
          icd10: sanitizeText(spotRaw.icd10) || undefined,
          confidence: clampVisionConfidencePercent(spotRaw.confidence),
          rationale: sanitizeText(spotRaw.rationale) || undefined,
        }
      : undefined,
    differentials: differentials.length > 0 ? differentials : undefined,
    treatment_summary: sanitizeText(source.treatment_summary) || undefined,
    treatment_lines: treatmentLines.length > 0 ? treatmentLines : undefined,
    investigations: investigations.length > 0 ? investigations : undefined,
    counseling: counseling.length > 0 ? counseling : undefined,
  };
};

const ensureVisionBasePayload = (payload: VisionPayload): VisionPayload => ({
  ...payload,
  summary: sanitizeText(payload.summary) || 'No conclusive visual finding.',
  recommendation:
    sanitizeText(payload.recommendation) || 'Continue structured history collection.',
});

const mergeVisionPayload = (base: VisionPayload, enrichment: VisionPayload): VisionPayload => {
  const merged: VisionPayload = {
    ...base,
    spot_diagnosis: enrichment.spot_diagnosis?.label
      ? enrichment.spot_diagnosis
      : base.spot_diagnosis,
    differentials:
      enrichment.differentials && enrichment.differentials.length > 0
        ? enrichment.differentials
        : base.differentials,
    treatment_summary: sanitizeText(enrichment.treatment_summary) || base.treatment_summary,
    treatment_lines:
      enrichment.treatment_lines && enrichment.treatment_lines.length > 0
        ? enrichment.treatment_lines
        : base.treatment_lines,
    investigations:
      enrichment.investigations && enrichment.investigations.length > 0
        ? enrichment.investigations
        : base.investigations,
    counseling:
      enrichment.counseling && enrichment.counseling.length > 0
        ? enrichment.counseling
        : base.counseling,
  };
  return ensureVisionBasePayload(merged);
};

const applyVisionMinimumEnrichment = (payload: VisionPayload): VisionPayload => {
  const corpus = `${payload.summary || ''} ${(payload.findings || []).join(' ')}`.toLowerCase();
  const oralUlcerPattern = /(oral|mouth|lip|buccal|mucosa|ulcer|stomatitis|aphth)/i;

  if (oralUlcerPattern.test(corpus)) {
    return {
      ...payload,
      spot_diagnosis: payload.spot_diagnosis?.label
        ? payload.spot_diagnosis
        : {
            label: 'Likely recurrent aphthous stomatitis (provisional)',
            icd10: 'K12.0',
            confidence: Math.max(58, Math.min(85, payload.confidence || 65)),
            rationale: 'Shallow round oral ulcers with erythematous borders on oral mucosa.',
          },
      differentials:
        payload.differentials && payload.differentials.length > 0
          ? payload.differentials
          : [
              {
                label: 'Recurrent aphthous stomatitis',
                icd10: 'K12.0',
                likelihood: 'high',
                rationale: 'Most consistent with morphology and location.',
              },
              {
                label: 'Herpetic stomatitis',
                icd10: 'B00.2',
                likelihood: 'medium',
                rationale: 'Can present with painful oral ulcers.',
              },
              {
                label: 'Traumatic oral ulcer',
                likelihood: 'medium',
                rationale: 'Localized trauma can produce shallow mucosal ulcers.',
              },
            ],
      treatment_summary:
        payload.treatment_summary ||
        'Supportive oral ulcer care while monitoring for red flags and persistent disease.',
      treatment_lines:
        payload.treatment_lines && payload.treatment_lines.length > 0
          ? payload.treatment_lines
          : [
              'Topical oral analgesic/anti-inflammatory therapy per clinician protocol.',
              'Warm saline mouth rinses; avoid spicy/acidic irritants.',
              'Maintain oral hydration and soft diet while pain is active.',
            ],
      investigations:
        payload.investigations && payload.investigations.length > 0
          ? payload.investigations
          : [
              'Focused oral examination by clinician or dentist.',
              'CBC and micronutrient screen (B12/folate/ferritin) if recurrent or severe.',
              'Targeted infectious testing if systemic features or atypical lesions present.',
            ],
      counseling:
        payload.counseling && payload.counseling.length > 0
          ? payload.counseling
          : [
              'Seek urgent care if swallowing/breathing difficulty, dehydration, or high fever develops.',
              'Return for review if ulcers persist beyond 2 weeks or rapidly worsen.',
            ],
    };
  }

  return {
    ...payload,
    differentials:
      payload.differentials && payload.differentials.length > 0
        ? payload.differentials
        : [
            {
              label: 'Inflammatory local lesion',
              likelihood: 'medium',
              rationale: 'Visual pattern suggests localized inflammation.',
            },
            {
              label: 'Infective process',
              likelihood: 'medium',
              rationale: 'Infection remains a plausible differential.',
            },
            {
              label: 'Traumatic lesion',
              likelihood: 'low',
              rationale: 'Mechanical irritation may mimic this appearance.',
            },
          ],
    treatment_lines:
      payload.treatment_lines && payload.treatment_lines.length > 0
        ? payload.treatment_lines
        : ['Symptom-directed supportive care pending full clinical correlation.'],
    investigations:
      payload.investigations && payload.investigations.length > 0
        ? payload.investigations
        : ['Focused clinical examination to correlate visual findings with history.'],
    counseling:
      payload.counseling && payload.counseling.length > 0
        ? payload.counseling
        : ['Escalate urgently if red-flag symptoms develop or worsen.'],
  };
};

const mergeUnique = (left: string[], right: string[], maxItems: number): string[] =>
  [...new Set([...left, ...right])].filter(Boolean).slice(0, maxItems);

const mergeCheckpointState = (
  primary: NonNullable<ConsultPayload['agent_state']>['must_not_miss_checkpoint'],
  secondary: NonNullable<ConsultPayload['agent_state']>['must_not_miss_checkpoint']
): NonNullable<ConsultPayload['agent_state']>['must_not_miss_checkpoint'] => {
  const left = primary || {};
  const right = secondary || {};

  let status: 'idle' | 'pending' | 'cleared' | 'escalate' = 'idle';
  if (left.status === 'escalate' || right.status === 'escalate') {
    status = 'escalate';
  } else if (left.status === 'pending' || right.status === 'pending') {
    status = 'pending';
  } else if (left.status === 'cleared' || right.status === 'cleared') {
    status = 'cleared';
  }

  return {
    required: Boolean(left.required || right.required),
    status,
    last_question: left.last_question || right.last_question,
    last_response: left.last_response || right.last_response,
    updated_at:
      (typeof left.updated_at === 'number' ? left.updated_at : Number(left.updated_at) || 0) ||
      (typeof right.updated_at === 'number' ? right.updated_at : Number(right.updated_at) || 0) ||
      undefined,
  };
};

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
      positive_findings: mergeUnique(
        primary.agent_state?.positive_findings || [],
        secondary.agent_state?.positive_findings || [],
        24
      ),
      negative_findings: mergeUnique(
        primary.agent_state?.negative_findings || [],
        secondary.agent_state?.negative_findings || [],
        24
      ),
      must_not_miss_checkpoint: mergeCheckpointState(
        primary.agent_state?.must_not_miss_checkpoint,
        secondary.agent_state?.must_not_miss_checkpoint
      ),
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

type EvidenceState = 'present' | 'absent' | 'unknown';

type FeatureCue = {
  id: string;
  positive: RegExp[];
  negative?: RegExp[];
  question: string;
};

type DiagnosisHint = {
  pattern: RegExp;
  supports: string[];
  contradicts?: string[];
  emergency?: boolean;
  followUpQuestion?: string;
  pendingActions?: string[];
};

type RankedLlmDiagnosis = {
  diagnosis: string;
  score: number;
  emergency: boolean;
  followUpQuestion?: string;
  pendingActions: string[];
};

type OrchestratedCandidate = {
  diagnosis: string;
  score: number;
  emergency: boolean;
  followUpQuestion?: string;
  pendingActions: string[];
  source: 'profile' | 'llm';
};

type ChiefComplaintEngineId =
  | 'fever'
  | 'chest_pain'
  | 'shortness_of_breath'
  | 'headache'
  | 'abdominal_pain'
  | 'vomiting_nausea'
  | 'diarrhea'
  | 'rash'
  | 'joint_pain'
  | 'weakness_fatigue'
  | 'bleeding'
  | 'altered_mental_status'
  | 'general';

interface ChiefComplaintEngine {
  id: ChiefComplaintEngineId;
  label: string;
  starterQuestion: string;
  mustNotMiss: string[];
  matchers: RegExp[];
}

const ICD10_RULES: Icd10Rule[] = [
  { pattern: /\bmalaria\b/i, code: 'B54' },
  { pattern: /\bdengue\b/i, code: 'A97.9' },
  { pattern: /\btyphoid\b/i, code: 'A01.0' },
  {
    pattern: /\bundifferentiated febrile illness\b|\bfever, unspecified\b|\bacute febrile illness\b/i,
    code: 'R50.9',
  },
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
      { pattern: /\bintermittent|cyclic|comes and goes|on and off\b/i, weight: 1.4 },
      { pattern: /\bnight|nocturnal|worse at night|evening chills\b/i, weight: 1.3 },
      { pattern: /\bmorning relief|better in the morning|morning off\b/i, weight: 1.1 },
      { pattern: /\bbitter taste|acid taste|metallic taste\b/i, weight: 0.6 },
      { pattern: /\bmosquito(es)? bite(s)?|travel\b/i, weight: 1 },
    ],
    followUpQuestion:
      'Does fever come in cycles (evening chills, night spike, morning relief), and was there mosquito exposure?',
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

const CHIEF_COMPLAINT_ENGINES: ChiefComplaintEngine[] = [
  {
    id: 'fever',
    label: 'Fever Engine',
    starterQuestion: 'How long have you had the fever?',
    mustNotMiss: ['Sepsis', 'Meningitis', 'Severe malaria'],
    matchers: [/\bfever|temperature|pyrexia|febrile|chills?|rigors?\b/i],
  },
  {
    id: 'chest_pain',
    label: 'Chest Pain Engine',
    starterQuestion: 'Is the chest pain pressure-like and does it spread to arm, jaw, or back?',
    mustNotMiss: ['Acute coronary syndrome', 'Pulmonary embolism', 'Aortic dissection'],
    matchers: [/\bchest pain|chest pressure|tight chest|sternal pain\b/i],
  },
  {
    id: 'shortness_of_breath',
    label: 'Shortness of Breath Engine',
    starterQuestion: 'Did the breathing difficulty start suddenly, and is it present at rest?',
    mustNotMiss: ['Pulmonary embolism', 'Acute heart failure', 'Severe asthma'],
    matchers: [/\bshortness of breath|breathless|dyspnea|difficulty breathing\b/i],
  },
  {
    id: 'headache',
    label: 'Headache Engine',
    starterQuestion: 'Is this the worst headache of your life or linked to neck stiffness?',
    mustNotMiss: ['Subarachnoid hemorrhage', 'Meningitis', 'Stroke'],
    matchers: [/\bheadache|head pain|migraine\b/i],
  },
  {
    id: 'abdominal_pain',
    label: 'Abdominal Pain Engine',
    starterQuestion:
      'Where is the pain most severe: upper right, upper middle, lower right, lower left, or diffuse?',
    mustNotMiss: ['Appendicitis', 'Peritonitis', 'GI bleed'],
    matchers: [/\babdominal pain|stomach pain|belly pain|epigastric|flank pain\b/i],
  },
  {
    id: 'vomiting_nausea',
    label: 'Vomiting/Nausea Engine',
    starterQuestion: 'How many vomiting episodes have you had in the last 24 hours?',
    mustNotMiss: ['Severe dehydration', 'Acute abdomen', 'DKA'],
    matchers: [/\bnausea|vomit|throwing up\b/i],
  },
  {
    id: 'diarrhea',
    label: 'Diarrhea Engine',
    starterQuestion: 'Is the stool watery or bloody, and for how many days?',
    mustNotMiss: ['Severe dehydration', 'Sepsis', 'GI bleeding'],
    matchers: [/\bdiarrh|loose stool|watery stool\b/i],
  },
  {
    id: 'rash',
    label: 'Rash Engine',
    starterQuestion: 'Is the rash painful, itchy, or associated with fever or bleeding?',
    mustNotMiss: ['Severe drug reaction', 'Meningococcemia', 'Sepsis'],
    matchers: [/\brash|skin eruption|hives|lesion\b/i],
  },
  {
    id: 'joint_pain',
    label: 'Joint Pain Engine',
    starterQuestion: 'Is the pain in one joint or many joints, and is there swelling or fever?',
    mustNotMiss: ['Septic arthritis', 'Acute gout flare with infection mimic'],
    matchers: [/\bjoint pain|arthralgia|swollen joint\b/i],
  },
  {
    id: 'weakness_fatigue',
    label: 'Weakness/Fatigue Engine',
    starterQuestion: 'Is this generalized fatigue or focal weakness on one side of the body?',
    mustNotMiss: ['Stroke', 'Sepsis', 'Severe anemia'],
    matchers: [/\bweakness|fatigue|malaise|tired\b/i],
  },
  {
    id: 'bleeding',
    label: 'Bleeding Engine',
    starterQuestion: 'Where are you bleeding from, and is bleeding heavy or persistent?',
    mustNotMiss: ['GI hemorrhage', 'Postpartum hemorrhage', 'Coagulopathy'],
    matchers: [/\bbleeding|blood in stool|vomiting blood|coughing blood|hematuria\b/i],
  },
  {
    id: 'altered_mental_status',
    label: 'Altered Mental Status Engine',
    starterQuestion: 'Is there confusion, drowsiness, seizure, or recent loss of consciousness?',
    mustNotMiss: ['Stroke', 'Hypoglycemia', 'Sepsis', 'Drug toxicity'],
    matchers: [/\bconfusion|disoriented|altered mental|unconscious|seizure|faint\b/i],
  },
];

const FEATURE_CUES: FeatureCue[] = [
  {
    id: 'fever',
    positive: [/\bfever|febrile|temperature|pyrexia\b/i],
    question: 'Have you measured your temperature, and how high has it been?',
  },
  {
    id: 'chills',
    positive: [/\bchills?|rigors?\b/i],
    question: 'Are the fever episodes associated with chills or rigors?',
  },
  {
    id: 'fever_pattern_cycle',
    positive: [/\bintermittent|cyclic|comes and goes|on and off\b/i],
    question: 'Is the fever intermittent or cyclical rather than constant?',
  },
  {
    id: 'nocturnal_fever',
    positive: [/\bnight|nocturnal|worse at night|evening chills|morning relief\b/i],
    question: 'Does fever tend to worsen at night after evening chills and ease by morning?',
  },
  {
    id: 'mosquito_exposure',
    positive: [/\bmosquito(es)? bite(s)?|sleeping without net|high mosquito exposure\b/i],
    question: 'Have you had recent mosquito exposure or slept without mosquito protection?',
  },
  {
    id: 'headache',
    positive: [/\bheadache|head pain|retro[-\s]?orbital|behind (my )?eyes?\b/i],
    question: 'Is the headache severe, persistent, or associated with eye pain?',
  },
  {
    id: 'cough',
    positive: [/\bcough|sputum|phlegm\b/i],
    negative: [/\bno cough\b/i],
    question: 'Any cough, sputum, or breathing symptoms with this illness?',
  },
  {
    id: 'dyspnea',
    positive: [/\bshortness of breath|breathless|difficulty breathing|tachypnea\b/i],
    negative: [/\bno shortness of breath|no breathlessness\b/i],
    question: 'Do you feel short of breath at rest or with minimal activity?',
  },
  {
    id: 'chest_pain',
    positive: [/\bchest pain|chest pressure|tight chest\b/i],
    negative: [/\bno chest pain\b/i],
    question: 'Is chest pain pressure-like, and does it radiate to arm, jaw, or back?',
  },
  {
    id: 'abdominal_pain',
    positive: [/\babdominal pain|stomach pain|belly pain|flank pain|loin pain\b/i],
    question: 'Where exactly is the abdominal pain and does it migrate?',
  },
  {
    id: 'vomiting',
    positive: [/\bnausea|vomit(ing)?|throwing up\b/i],
    question: 'How frequent is the nausea or vomiting, and can you keep fluids down?',
  },
  {
    id: 'diarrhea',
    positive: [/\bdiarrh|loose stool|watery stool\b/i],
    question: 'Do you have diarrhea, and is there blood or mucus in stool?',
  },
  {
    id: 'dysuria',
    positive: [/\bdysuria|burning urination|painful urination\b/i],
    negative: [/\bno burning urination|no dysuria\b/i],
    question: 'Any burning urination, urinary urgency, or flank pain?',
  },
  {
    id: 'rash_or_bleeding',
    positive: [/\brash|bleeding|gum bleed|nose bleed|petechiae\b/i],
    question: 'Have you noticed rash, gum bleeding, or easy bruising?',
  },
  {
    id: 'confusion_or_neuro',
    positive: [
      /\bconfusion|disoriented|seizure|fits|focal weakness|one[-\s]?sided weakness|unilateral weakness|speech difficulty|facial droop\b/i,
    ],
    question: 'Any confusion, seizures, focal weakness, or speech difficulty?',
  },
];

const DIAGNOSIS_HINTS: DiagnosisHint[] = [
  {
    pattern: /\bmalaria\b/i,
    supports: ['fever', 'chills', 'fever_pattern_cycle', 'nocturnal_fever', 'mosquito_exposure', 'headache', 'vomiting'],
    followUpQuestion:
      'Does fever usually start with evening chills, spike at night, ease by morning, and follow mosquito exposure?',
    pendingActions: [
      'Confirm fever pattern and mosquito exposure before locking malaria as lead',
      'Confirm malaria with RDT/smear',
      'Check for severe-malaria danger signs',
    ],
  },
  {
    pattern: /\bdengue\b/i,
    supports: ['fever', 'headache', 'rash_or_bleeding', 'vomiting'],
    followUpQuestion: 'Any rash, bleeding, or severe abdominal pain suggesting dengue warning signs?',
    pendingActions: ['Assess dengue warning signs', 'Order CBC with platelet trend'],
  },
  {
    pattern: /\btyphoid\b/i,
    supports: ['fever', 'abdominal_pain', 'diarrhea', 'vomiting'],
    followUpQuestion: 'Any contaminated food or water exposure with persistent abdominal symptoms?',
    pendingActions: ['Consider blood/stool culture', 'Assess enteric fever risk exposures'],
  },
  {
    pattern: /\bpneumonia\b/i,
    supports: ['fever', 'cough', 'dyspnea', 'chest_pain'],
    followUpQuestion: 'Do you have cough with breathlessness or pleuritic chest pain?',
    pendingActions: ['Perform respiratory exam and pulse oximetry', 'Evaluate for chest imaging'],
  },
  {
    pattern: /\burinary tract infection\b|\buti\b|pyelonephritis/i,
    supports: ['fever', 'dysuria', 'abdominal_pain'],
    followUpQuestion: 'Any dysuria, urgency, or flank pain pointing to urinary infection?',
    pendingActions: ['Urinalysis and urine culture pathway', 'Screen for upper UTI features'],
  },
  {
    pattern: /\bgastroenteritis\b/i,
    supports: ['vomiting', 'diarrhea', 'abdominal_pain'],
    followUpQuestion: 'How many loose stools or vomiting episodes are you having in 24 hours?',
    pendingActions: ['Assess dehydration severity', 'Stool workup if red flags present'],
  },
  {
    pattern: /\bmeningitis\b/i,
    supports: ['fever', 'headache', 'confusion_or_neuro'],
    emergency: true,
    followUpQuestion: 'Any neck stiffness, confusion, or seizures right now?',
    pendingActions: ['Urgent neurologic assessment', 'Immediate emergency referral if red flags'],
  },
  {
    pattern: /\bsepsis\b/i,
    supports: ['fever', 'confusion_or_neuro', 'dyspnea'],
    emergency: true,
    followUpQuestion: 'Any confusion, fainting, or very fast breathing at the moment?',
    pendingActions: ['Immediate sepsis screen and vitals', 'Escalate urgently if unstable'],
  },
  {
    pattern: /\bacute coronary syndrome\b|\bacs\b|\bmyocardial infarction\b|heart attack/i,
    supports: ['chest_pain', 'dyspnea', 'vomiting'],
    emergency: true,
    followUpQuestion: 'Is the chest pain crushing or radiating to arm, jaw, or back?',
    pendingActions: ['Urgent cardiac triage pathway', 'Assess hemodynamic instability symptoms'],
  },
  {
    pattern: /\bpulmonary embolism\b|\bpe\b/i,
    supports: ['dyspnea', 'chest_pain'],
    emergency: true,
    followUpQuestion: 'Did shortness of breath start suddenly, and is there pleuritic chest pain?',
    pendingActions: ['Urgent thromboembolism risk assessment', 'Escalate for acute cardiorespiratory signs'],
  },
];

const FEVER_ONLY_LEAD_DIAGNOSIS = 'Undifferentiated febrile illness (ICD-10: R50.9)';
const FEVER_ONLY_FOLLOW_UP_QUESTION = 'Are the fever episodes associated with chills or rigors?';
const FEVER_ONLY_PENDING_ACTION = 'Use high-yield symptom clarifiers before locking a specific pathogen';
const FEVER_PATHOGEN_PATTERNS: RegExp[] = [
  /\bsepsis\b/i,
  /\bmeningitis\b/i,
  /\bmalaria\b/i,
  /\bdengue\b/i,
  /\btyphoid\b/i,
  /\bpneumonia\b/i,
  /\binfluenza\b|\bviral upper respiratory infection\b|\burti\b/i,
  /\burinary tract infection\b|\buti\b|pyelonephritis/i,
  /\bgastroenteritis\b/i,
];

const classifyChiefComplaint = (corpus: string): {
  engineId: ChiefComplaintEngineId;
  label: string;
  starterQuestion: string;
  mustNotMiss: string[];
  confidence: number;
  reason: string;
} => {
  const normalized = sanitizeText(corpus).toLowerCase();
  if (!normalized) {
    return {
      engineId: 'general',
      label: 'General Intake Engine',
      starterQuestion: 'What symptom is bothering you the most right now?',
      mustNotMiss: ['Acute collapse', 'Severe respiratory distress', 'Uncontrolled bleeding'],
      confidence: 32,
      reason: 'No clear chief complaint token detected',
    };
  }

  const scored = CHIEF_COMPLAINT_ENGINES.map((engine) => ({
    engine,
    score: engine.matchers.filter((matcher) => matcher.test(normalized)).length,
  })).sort((left, right) => right.score - left.score);

  const lead = scored[0];
  if (!lead || lead.score === 0) {
    return {
      engineId: 'general',
      label: 'General Intake Engine',
      starterQuestion: 'What symptom is bothering you the most right now?',
      mustNotMiss: ['Acute collapse', 'Severe respiratory distress', 'Uncontrolled bleeding'],
      confidence: 36,
      reason: 'No direct engine keyword match',
    };
  }

  const runner = scored[1];
  const confidence = Math.max(45, Math.min(96, 58 + lead.score * 14 - (runner?.score || 0) * 9));
  return {
    engineId: lead.engine.id,
    label: lead.engine.label,
    starterQuestion: lead.engine.starterQuestion,
    mustNotMiss: lead.engine.mustNotMiss,
    confidence,
    reason: `Matched ${lead.score} complaint cues for ${lead.engine.label}`,
  };
};

const stripIcd10Label = (diagnosis: string): string =>
  diagnosis.replace(/\s*\(ICD-10:\s*[A-Z0-9.-]+\)\s*/gi, '').trim();

const normalizeDxKey = (diagnosis: string): string =>
  stripIcd10Label(diagnosis)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const applyIcd10Label = (diagnosis: string): string => {
  const value = sanitizeText(diagnosis);
  if (!value) return '';
  if (/\(ICD-10:\s*[A-Z0-9.-]+\)/i.test(value)) return value;
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

const extractPatientMirror = (body: ConsultRequest): string => {
  const current = sanitizeText(body.patientInput);
  if (!current) return '';
  return current
    .split(/[.?!,;]/)[0]
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
};

const ensureEmpathicStatement = (
  statement: string | undefined,
  body: ConsultRequest
): string => {
  const base = sanitizeText(statement);
  const mirror = extractPatientMirror(body);
  if (!mirror) return base || 'Thank you for sharing that.';
  if (base) return base;
  return `Thank you for sharing. I hear that ${mirror.toLowerCase()}.`;
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

const buildFeatureEvidence = (corpus: string): Record<string, EvidenceState> => {
  const evidence: Record<string, EvidenceState> = {};
  for (const cue of FEATURE_CUES) {
    const hasNegative = (cue.negative || []).some((pattern) => pattern.test(corpus));
    if (hasNegative) {
      evidence[cue.id] = 'absent';
      continue;
    }
    const hasPositive = cue.positive.some((pattern) => pattern.test(corpus));
    evidence[cue.id] = hasPositive ? 'present' : 'unknown';
  }
  return evidence;
};

const featureQuestionById = (featureId: string): string | undefined =>
  FEATURE_CUES.find((cue) => cue.id === featureId)?.question;

const dedupeActions = (actions: string[]): string[] =>
  [...new Set(actions.map((item) => sanitizeText(item)).filter(Boolean))];

const findDiagnosisHint = (diagnosis: string): DiagnosisHint | undefined =>
  DIAGNOSIS_HINTS.find((hint) => hint.pattern.test(diagnosis));

const applyEmergencySpecificPenalty = (
  diagnosis: string,
  evidence: Record<string, EvidenceState>
): number => {
  if (/\bmeningitis\b/i.test(diagnosis)) {
    return evidence.confusion_or_neuro === 'present' ? 0 : 1.6;
  }
  if (/\bsepsis\b/i.test(diagnosis)) {
    const hasSepsisSignal =
      evidence.confusion_or_neuro === 'present' ||
      evidence.dyspnea === 'present';
    return hasSepsisSignal ? 0 : 1.6;
  }
  return 0;
};

const hasEmergencySignalEvidence = (
  diagnosis: string,
  evidence: Record<string, EvidenceState>
): boolean => {
  if (/\bmeningitis\b/i.test(diagnosis)) {
    return evidence.confusion_or_neuro === 'present';
  }
  if (/\bsepsis\b/i.test(diagnosis)) {
    return evidence.confusion_or_neuro === 'present' || evidence.dyspnea === 'present';
  }
  return true;
};

const scoreLlmDiagnosis = (
  diagnosis: string,
  rankIndex: number,
  evidence: Record<string, EvidenceState>
): RankedLlmDiagnosis => {
  const hint = findDiagnosisHint(diagnosis);
  const prior = Math.max(0.9, 3.2 - rankIndex * 0.38);
  let score = prior;
  const supportStates = (hint?.supports || []).map((featureId) => ({
    featureId,
    state: evidence[featureId] || 'unknown',
  }));
  const nonFeverSupports = supportStates.filter(({ featureId }) => featureId !== 'fever');
  const hasNonFeverSupport = nonFeverSupports.some(({ state }) => state === 'present');
  const emergencySignalSatisfied = hasEmergencySignalEvidence(diagnosis, evidence);

  if (hint) {
    for (const { state } of supportStates) {
      if (state === 'present') score += 0.85;
      else if (state === 'absent') score -= 0.55;
    }

    // Prevent early fixation on pathogen-specific diagnoses when only fever is known.
    if (nonFeverSupports.length > 0 && !hasNonFeverSupport) {
      score -= 1.35;
    }

    for (const featureId of hint.contradicts || []) {
      if ((evidence[featureId] || 'unknown') === 'present') {
        score -= 0.9;
      }
    }

    score -= applyEmergencySpecificPenalty(diagnosis, evidence);
  }

  const unknownSupportedFeature = hint?.supports.find((featureId) => evidence[featureId] === 'unknown');

  return {
    diagnosis,
    score: Math.max(0, Math.round(score * 10) / 10),
    emergency: Boolean(hint?.emergency) && emergencySignalSatisfied,
    followUpQuestion:
      hint?.followUpQuestion || (unknownSupportedFeature ? featureQuestionById(unknownSupportedFeature) : undefined),
    pendingActions: dedupeActions(hint?.pendingActions || []),
  };
};

const rankLlmDiagnoses = (
  ddx: string[],
  evidence: Record<string, EvidenceState>
): RankedLlmDiagnosis[] =>
  ddx
    .map((diagnosis, index) => scoreLlmDiagnosis(diagnosis, index, evidence))
    .sort((left, right) => {
      if (left.emergency && !right.emergency) return -1;
      if (!left.emergency && right.emergency) return 1;
      return right.score - left.score;
    });

const scoreDisease = (profile: DiseaseProfile, corpus: string): number => {
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

const rankTopDownProfiles = (corpus: string): RankedDisease[] => {
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

const mergeOrchestratedCandidates = (
  profiles: RankedDisease[],
  llmRanked: RankedLlmDiagnosis[]
): OrchestratedCandidate[] => {
  const merged = new Map<string, OrchestratedCandidate>();

  for (const entry of profiles) {
    const diagnosis = diseaseToDx(entry);
    const key = normalizeDxKey(diagnosis);
    merged.set(key, {
      diagnosis,
      score: entry.score,
      emergency: Boolean(entry.profile.emergency),
      followUpQuestion: entry.profile.followUpQuestion,
      pendingActions: dedupeActions(entry.profile.pendingActions),
      source: 'profile',
    });
  }

  for (const entry of llmRanked) {
    const key = normalizeDxKey(entry.diagnosis);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        diagnosis: entry.diagnosis,
        score: entry.score,
        emergency: entry.emergency,
        followUpQuestion: entry.followUpQuestion,
        pendingActions: entry.pendingActions,
        source: 'llm',
      });
      continue;
    }

    const mergedQuestion = existing.followUpQuestion || entry.followUpQuestion;
    merged.set(key, {
      ...existing,
      diagnosis: existing.source === 'profile' ? existing.diagnosis : entry.diagnosis,
      score: Math.max(existing.score, entry.score),
      emergency: existing.emergency || entry.emergency,
      followUpQuestion: mergedQuestion,
      pendingActions: dedupeActions([...existing.pendingActions, ...entry.pendingActions]),
      source: existing.source,
    });
  }

  return [...merged.values()].sort((left, right) => {
    if (left.emergency && !right.emergency) return -1;
    if (!left.emergency && right.emergency) return 1;
    return right.score - left.score;
  });
};

const shouldOverrideQuestion = (
  question: string | undefined,
  lead: OrchestratedCandidate,
  corpus: string,
  secondScore: number
): boolean => {
  void lead;
  void corpus;
  void secondScore;
  if (!lead.followUpQuestion) return false;
  const normalized = sanitizeText(question).toLowerCase();
  if (!normalized) return true;
  if (/(anything else|tell me more|more details|any other symptom)/i.test(normalized)) return true;
  return /(what symptom is bothering you the most right now|what changed most since symptoms began)/i.test(
    normalized
  );
};

const scoreToProbabilityFloor = (lead: OrchestratedCandidate, secondScore: number): number => {
  const gap = Math.max(0, lead.score - secondScore);
  const raw = lead.emergency
    ? 68 + lead.score * 9 + gap * 6
    : 52 + lead.score * 7 + gap * 5;
  const bounded = Math.round(Math.min(96, Math.max(56, raw)));
  if (lead.emergency) return Math.max(84, bounded);
  return bounded;
};

const atLeastDifferential = (phase: string | undefined): AgentPhase => {
  const normalized = sanitizeText(phase).toLowerCase();
  if (normalized === 'resolution' || normalized === 'followup' || normalized === 'differential') {
    return normalized as AgentPhase;
  }
  return 'differential';
};

const presentFeatureIds = (evidence: Record<string, EvidenceState>): string[] =>
  FEATURE_CUES.map((cue) => cue.id).filter((featureId) => evidence[featureId] === 'present');

const isFeverOnlyPresentation = (evidence: Record<string, EvidenceState>): boolean => {
  const present = presentFeatureIds(evidence);
  return present.length === 1 && present[0] === 'fever';
};

const isSpecificFebrileDiagnosis = (diagnosis: string): boolean =>
  FEVER_PATHOGEN_PATTERNS.some((pattern) => pattern.test(diagnosis));

const applyFeverOnlyGuardrail = (
  candidates: OrchestratedCandidate[],
  evidence: Record<string, EvidenceState>
): OrchestratedCandidate[] => {
  if (!isFeverOnlyPresentation(evidence)) return candidates;

  const downgraded = candidates.map((candidate) => {
    if (!isSpecificFebrileDiagnosis(candidate.diagnosis)) return candidate;
    return {
      ...candidate,
      score: Math.min(candidate.score, 2.7),
    };
  });

  const neutralLead: OrchestratedCandidate = {
    diagnosis: FEVER_ONLY_LEAD_DIAGNOSIS,
    score: Math.max(3.1, (downgraded[0]?.score || 2.6) + 0.45),
    emergency: false,
    followUpQuestion: FEVER_ONLY_FOLLOW_UP_QUESTION,
    pendingActions: [FEVER_ONLY_PENDING_ACTION],
    source: 'profile',
  };

  return [neutralLead, ...downgraded].sort((left, right) => right.score - left.score);
};

type QuestionIntent = 'most_limiting' | 'symptom_change' | 'pattern' | 'danger_signs';

const INTENT_PATTERNS: Record<QuestionIntent, RegExp> = {
  most_limiting: /\bmost limiting\b|\bstands?\s*out\b/i,
  symptom_change: /\bchanged since\b|\bhow has\b|\bbetter|worse|improved\b/i,
  pattern:
    /\bpattern\b|\bintermittent\b|\bconstant\b|\bday\b|\bnight\b|\bcyclic(al)?\b|\bcycle(s)?\b|\bnocturnal\b|\bevening chills?\b|\bmorning relief\b/i,
  danger_signs:
    /\bdanger signs?\b|\bbreathlessness\b|\bconfusion\b|\bpersistent vomiting\b|\bbleeding\b|\bchest pain\b/i,
};

const INTENT_SEQUENCE: Array<{ intent: QuestionIntent; question: string }> = [
  { intent: 'most_limiting', question: 'Which one symptom is most limiting right now?' },
  { intent: 'symptom_change', question: 'How has that symptom changed since it began?' },
  { intent: 'pattern', question: 'What pattern do you notice most: day, night, intermittent, or constant?' },
  {
    intent: 'danger_signs',
    question:
      'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
  },
];

const NON_SUBSTANTIVE_RESPONSE_PATTERN = /^(ok|okay|alright|fine|hmm+|uh+h*|ah+h*|k|kk)$/i;
const UNCERTAIN_RESPONSE_PATTERN = /\b(not sure|unsure|unknown|maybe|don'?t know|cannot tell|idk)\b/i;

const detectQuestionIntent = (question: string): QuestionIntent | null => {
  const normalized = sanitizeText(question);
  if (!normalized) return null;
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(normalized)) return intent as QuestionIntent;
  }
  return null;
};

const isSubstantivePatientReply = (text: string): boolean => {
  const normalized = sanitizeText(text);
  if (!normalized) return false;
  if (UNCERTAIN_RESPONSE_PATTERN.test(normalized)) return false;
  if (NON_SUBSTANTIVE_RESPONSE_PATTERN.test(normalized)) return false;
  return /[a-z0-9]/i.test(normalized);
};

const hasAnsweredIntent = (
  conversation: ConversationEntry[],
  intent: QuestionIntent,
  lookback = 48
): boolean => {
  const pattern = INTENT_PATTERNS[intent];
  const window = (conversation || []).slice(-lookback);
  for (let i = window.length - 1; i >= 0; i -= 1) {
    const entry = window[i];
    if (entry.role !== 'doctor') continue;
    if (!pattern.test(sanitizeText(entry.content))) continue;

    for (let j = i + 1; j < window.length; j += 1) {
      const followup = window[j];
      if (followup.role === 'doctor') break;
      if (followup.role === 'patient' && isSubstantivePatientReply(followup.content)) {
        return true;
      }
    }
  }
  return false;
};

const countRecentIntentAsks = (
  conversation: ConversationEntry[],
  intent: QuestionIntent,
  lookback = 14
): number => {
  const pattern = INTENT_PATTERNS[intent];
  return (conversation || [])
    .filter((entry) => entry.role === 'doctor')
    .slice(-lookback)
    .reduce((count, entry) => (pattern.test(sanitizeText(entry.content)) ? count + 1 : count), 0);
};

const enforceQuestionProgression = (
  question: string,
  conversation: ConversationEntry[]
): string => {
  const normalized = sanitizeText(question);
  if (!normalized) return normalized;

  const intent = detectQuestionIntent(normalized);
  if (!intent) return normalized;

  const repeatedAsk = countRecentIntentAsks(conversation, intent, 10) >= 1;
  const answeredAlready = hasAnsweredIntent(conversation, intent, 48);

  if (!repeatedAsk && !answeredAlready) {
    return normalized;
  }

  for (const step of INTENT_SEQUENCE) {
    if (!hasAnsweredIntent(conversation, step.intent, 64)) {
      if (sanitizeText(step.question).toLowerCase() !== normalized.toLowerCase()) {
        return step.question;
      }
    }
  }

  return 'What one missing detail should I clarify before I summarize your working diagnosis?';
};

const applyClinicalHeuristics = (body: ConsultRequest, payload: ConsultPayload): ConsultPayload => {
  const withCodedDdx = dedupeDxList((payload.ddx || []).map((entry) => applyIcd10Label(entry)));
  const corpus = buildConsultTextCorpus(body, payload);
  const complaintRoute = classifyChiefComplaint(corpus);
  const evidence = buildFeatureEvidence(corpus);
  const rankedProfiles = rankTopDownProfiles(corpus);
  const rankedFromLlm = rankLlmDiagnoses(withCodedDdx, evidence);
  const orchestrated = applyFeverOnlyGuardrail(
    mergeOrchestratedCandidates(rankedProfiles, rankedFromLlm),
    evidence
  );

  if (orchestrated.length === 0) {
    return {
      ...payload,
      ddx: withCodedDdx,
    };
  }

  const lead = orchestrated[0];
  const secondScore = orchestrated[1]?.score || 0;
  const mergedDdx = dedupeDxList([
    ...orchestrated.map((entry) => entry.diagnosis),
    ...withCodedDdx,
  ]).slice(0, 8);
  const feverOnlyPresentation = isFeverOnlyPresentation(evidence);
  const probabilityFloor = feverOnlyPresentation
    ? Math.min(scoreToProbabilityFloor(lead, secondScore), 62)
    : scoreToProbabilityFloor(lead, secondScore);
  const preferredQuestion = feverOnlyPresentation
    ? lead.followUpQuestion || payload.question
    : shouldOverrideQuestion(payload.question, lead, corpus, secondScore)
      ? lead.followUpQuestion
      : payload.question;
  const safetyAction = `Must-not-miss checks for ${complaintRoute.label}: ${complaintRoute.mustNotMiss.join(', ')}`;
  const routeAction = `Chief complaint route: ${complaintRoute.label} (${complaintRoute.reason})`;
  const nextActions = dedupeDxList([
    ...(payload.agent_state?.pending_actions || []),
    ...lead.pendingActions,
    routeAction,
    safetyAction,
    'Apply WHO/Medscape aligned differential confirmation steps',
  ]);
  const patientTurns =
    (body.state?.conversation || []).filter((entry) => entry.role === 'patient').length +
    (sanitizeText(body.patientInput) ? 1 : 0);
  const decisiveLead =
    !feverOnlyPresentation &&
    lead.score >= 6.8 &&
    lead.score - secondScore >= 1.4 &&
    patientTurns >= 3;
  const nextPhase = lead.emergency
    ? payload.agent_state?.phase || 'assessment'
    : decisiveLead
      ? 'resolution'
      : atLeastDifferential(payload.agent_state?.phase);
  let nextUrgency = payload.urgency || 'low';
  if (lead.emergency && lead.score >= 6.4) {
    nextUrgency = 'critical';
  } else if (lead.emergency && lead.score >= 4.6 && URGENCY_RANK[nextUrgency] < URGENCY_RANK.high) {
    nextUrgency = 'high';
  } else if (lead.score >= 5 && URGENCY_RANK[nextUrgency] < URGENCY_RANK.medium) {
    nextUrgency = 'medium';
  }
  const requestAgentState =
    body.state?.agent_state && typeof body.state.agent_state === 'object'
      ? (body.state.agent_state as Record<string, unknown>)
      : {};
  const mergedPositiveFindings = mergeUnique(
    payload.agent_state?.positive_findings || [],
    sanitizeList(requestAgentState.positive_findings, 24),
    24
  );
  const mergedNegativeFindings = mergeUnique(
    payload.agent_state?.negative_findings || [],
    sanitizeList(requestAgentState.negative_findings, 24),
    24
  );
  const checkpointFromRequest =
    requestAgentState.must_not_miss_checkpoint &&
    typeof requestAgentState.must_not_miss_checkpoint === 'object'
      ? (requestAgentState.must_not_miss_checkpoint as Record<string, unknown>)
      : {};
  const mergedCheckpoint = mergeCheckpointState(
    payload.agent_state?.must_not_miss_checkpoint,
    {
      required: Boolean(checkpointFromRequest.required),
      status: sanitizeCheckpointStatus(checkpointFromRequest.status),
      last_question: sanitizeText(checkpointFromRequest.last_question) || undefined,
      last_response: sanitizeText(checkpointFromRequest.last_response) || undefined,
      updated_at:
        typeof checkpointFromRequest.updated_at === 'number'
          ? checkpointFromRequest.updated_at
          : Number(checkpointFromRequest.updated_at) || undefined,
    }
  );

  const genericQuestionPattern = /(what symptom is bothering you the most right now|what changed most since symptoms began)/i;
  const conversationalFallbackQuestion =
    patientTurns <= 1
      ? complaintRoute.starterQuestion
      : 'What one detail should I clarify before I summarize your working diagnosis?';
  const resolvedQuestion =
    preferredQuestion && !genericQuestionPattern.test(preferredQuestion)
      ? preferredQuestion
      : payload.question && !genericQuestionPattern.test(payload.question)
        ? payload.question
        : conversationalFallbackQuestion;
  const safeguardedQuestion = enforceQuestionProgression(
    resolvedQuestion || 'What symptom is bothering you the most right now?',
    body.state?.conversation || []
  );

  return {
    ...payload,
    statement: ensureEmpathicStatement(payload.statement, body),
    ddx: mergedDdx,
    probability: Math.max(clampPercent(payload.probability), probabilityFloor),
    urgency: nextUrgency,
    agent_state: {
      phase: nextPhase,
      confidence: Math.max(clampPercent(payload.agent_state?.confidence), probabilityFloor),
      focus_area:
        payload.agent_state?.focus_area ||
        `${complaintRoute.label}: ${stripIcd10Label(lead.diagnosis)} focused top-down differential narrowing`,
      pending_actions: nextActions.slice(0, 8),
      last_decision:
        `Top-down orchestration prioritized ${stripIcd10Label(lead.diagnosis)} with ${complaintRoute.label} routing`,
      positive_findings: mergedPositiveFindings,
      negative_findings: mergedNegativeFindings,
      must_not_miss_checkpoint: mergedCheckpoint,
    },
    question:
      safeguardedQuestion ||
      'What symptom is bothering you the most right now?',
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
      'Missing Anthropic key on server. Configure ANTHROPIC_API_KEY.'
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

const shouldForceCollaborativeConsult = (body: ConsultRequest): boolean => {
  const urgency = sanitizeText(body.state?.urgency).toLowerCase();
  if (urgency === 'critical' || urgency === 'high') return true;

  const checkpoint = body.state?.agent_state?.must_not_miss_checkpoint as
    | { required?: unknown; status?: unknown }
    | undefined;
  if (checkpoint?.required === true || sanitizeText(checkpoint?.status as string) === 'pending') {
    return true;
  }

  const textCorpus = `${body.patientInput || ''} ${body.state?.memory_dossier || ''}`.toLowerCase();
  return /(stroke|seizure|collapse|cannot breathe|chest pain|uncontrolled bleeding)/i.test(textCorpus);
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
Positive Findings Memory: ${JSON.stringify((body.state?.agent_state as Record<string, unknown>)?.positive_findings || [])}
Negative Findings Memory: ${JSON.stringify((body.state?.agent_state as Record<string, unknown>)?.negative_findings || [])}
Safety Checkpoint Memory: ${JSON.stringify((body.state?.agent_state as Record<string, unknown>)?.must_not_miss_checkpoint || {})}
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
  const conversationContext = (body.state?.conversation || []).slice(-80).map((entry) => ({
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
  const collaborationEnabled =
    shouldForceCollaborativeConsult(body) ||
    normalizeBooleanEnv(process.env.LLM_COLLABORATION, false);
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
  const collaborationEnabled = normalizeBooleanEnv(process.env.LLM_OPTIONS_COLLABORATION, false);

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

  const basePayload = ensureVisionBasePayload(
    normalizeVisionPayload(parseFirstJsonObject(raw))
  );

  if (!normalizeBooleanEnv(process.env.VISION_ENRICHMENT, true)) {
    return basePayload;
  }

  try {
    const enrichmentRaw = await callOpenAI({
      mode: 'vision',
      maxTokens: 420,
      forceJson: true,
      messages: [
        { role: 'system', content: VISION_ENRICHMENT_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Clinical context: ${contextPrompt}
Task: ${lensPrompt}
Base summary: ${basePayload.summary || 'none'}
Base findings: ${(basePayload.findings || []).join('; ') || 'none'}
Base red flags: ${(basePayload.red_flags || []).join('; ') || 'none'}
Return only strict JSON for enrichment fields.`,
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

    const enrichmentPayload = normalizeVisionPayload(parseFirstJsonObject(enrichmentRaw));
    return applyVisionMinimumEnrichment(mergeVisionPayload(basePayload, enrichmentPayload));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('[runVision] enrichment skipped, returning base payload', { reason });
    return applyVisionMinimumEnrichment(basePayload);
  }
};
