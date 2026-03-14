const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const FALLBACK_ANTHROPIC_MODELS = ['claude-3-5-haiku-20241022'];
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

export type ScanPlanRequest = {
  analysis?: VisionPayload | Record<string, unknown>;
  clinicalContext?: string;
  lens?: 'general' | 'lab' | 'radiology';
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
  diagnosis?: {
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
  management?: string[];
  investigations?: string[];
  counseling?: string[];
  red_flags?: string[];
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
11b. Keep "statement" <= 12 words and avoid repetitive reassurance phrases.
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
22. Follow clinician-grade history order: onset/duration -> qualifiers -> associated symptoms -> exposures/risk factors -> red flags -> impact.
23. If enough data is already present, avoid repeating intake boilerplate and move to the next discriminating question.
24. Before final output, recap the working impression briefly and ask if the patient wants the final plan now.
25. Use telemedicine interview tone: concise, warm, clinical, and natural; avoid survey-like wording.
26. Avoid repetitive prefixes like "I understand..." on every turn.
27. If patient provides contradiction or new change, pivot to that update immediately.
28. Ask questions as a doctor in conversation, not as a form label.

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

const VISION_SYSTEM_PROMPT = `You are Dr. Dyrane, a consultant-level clinical imaging reviewer.
Analyze the provided image with the given context and return strict JSON only.
Use decisive, clinician-grade wording and avoid vague advisory phrasing.
Do not instruct the patient to "see a doctor" because you are the treating clinical voice.

RESPONSE JSON:
{
  "summary": "single sentence visual summary",
  "findings": ["objective visual finding"],
  "red_flags": ["urgent concern if present"],
  "confidence": number,
  "recommendation": "single-sentence definitive management direction"
}`;

const VISION_ENRICHMENT_PROMPT = `You are a clinical visual review enrichment assistant.
Use the already-computed base visual summary + findings + red flags and provided context to produce definitive structured clinical enrichment.
Keep wording declarative and management-ready.
Do not instruct the patient to seek another doctor.
When evidence is incomplete, still provide the best-fit working diagnosis and a concrete action plan.
Do not overwrite base summary unless the enrichment is clearly stronger.

RESPONSE JSON:
{
  "spot_diagnosis": {
    "label": "most likely diagnosis",
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
  "treatment_summary": "definitive treatment strategy",
  "treatment_lines": ["concrete treatment line"],
  "investigations": ["targeted investigation"],
  "counseling": ["direct counseling instruction"]
}`;

const SCAN_PLAN_SYSTEM_PROMPT = `You are Dr. Dyrane, generating a focused management plan from an already completed visual analysis.
Return strict JSON only.
Do not ask questions.
Use decisive consultant-level language.
Never use suggestive wording like "consider", "recommend", or "advise".
Never direct the patient to go see another doctor.
Prioritize practical final treatment lines, investigations, counseling, and red-flag escalation.

RESPONSE JSON:
{
  "spot_diagnosis": {
    "label": "most likely diagnosis",
    "icd10": "ICD-10 code if known",
    "confidence": 0,
    "rationale": "short rationale"
  },
  "differentials": [
    {
      "label": "differential",
      "icd10": "ICD-10 code if known",
      "likelihood": "high|medium|low",
      "rationale": "short rationale"
    }
  ],
  "treatment_summary": "concise treatment strategy",
  "treatment_lines": ["definitive treatment line"],
  "investigations": ["targeted test"],
  "counseling": ["patient counseling point"],
  "red_flags": ["urgent return warning"],
  "recommendation": "single-sentence final management direction"
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

const toSentence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
};

const normalizeDirectiveText = (value: unknown, fallback: string): string => {
  const raw = sanitizeText(value);
  if (!raw) return toSentence(fallback);

  let next = raw
    .replace(/^(recommend(?:ation)?|advise|advised|suggest|consider)\s*:?\s*/i, '')
    .replace(/\bplease\b/gi, '')
    .replace(/\bkindly\b/gi, '')
    .replace(/\bpending (?:confirmation|full clinical correlation)\b/gi, 'after confirmation testing')
    .replace(
      /\b(?:seek|obtain)\s+(?:urgent\s+)?(?:care|evaluation)\s+(?:by|from)\s+(?:a\s+)?(?:doctor|clinician|provider)\b/gi,
      'Escalate to emergency care'
    )
    .replace(
      /\b(?:see|consult)\s+(?:a\s+|your\s+)?(?:doctor|clinician|provider)\b/gi,
      'Continue immediate clinical management'
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (!next) {
    next = fallback;
  }
  return toSentence(next);
};

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

const sanitizeLikelihood = (value: unknown): 'high' | 'medium' | 'low' => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
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

const normalizeConsultDifferentials = (
  value: unknown
): NonNullable<ConsultPayload['differentials']> => {
  const entries = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  return entries
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
    .slice(0, 8);
};

const normalizeConsultPayload = (value: unknown): ConsultPayload => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const agentRaw = (source.agent_state && typeof source.agent_state === 'object'
    ? source.agent_state
    : {}) as Record<string, unknown>;
  const checkpointRaw = (agentRaw.must_not_miss_checkpoint && typeof agentRaw.must_not_miss_checkpoint === 'object'
    ? agentRaw.must_not_miss_checkpoint
    : {}) as Record<string, unknown>;
  const diagnosisRaw =
    source.diagnosis && typeof source.diagnosis === 'object'
      ? (source.diagnosis as Record<string, unknown>)
      : {};
  const diagnosisLabel = sanitizeText(diagnosisRaw.label);
  const differentials = normalizeConsultDifferentials(source.differentials);
  const managementLines = sanitizeList(source.management, 10);
  const investigations = sanitizeList(source.investigations, 10);
  const counseling = sanitizeList(source.counseling, 10);
  const redFlags = sanitizeList(source.red_flags, 10);

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
    diagnosis: diagnosisLabel
      ? {
          label: diagnosisLabel,
          icd10: sanitizeText(diagnosisRaw.icd10) || undefined,
          confidence: clampPercent(diagnosisRaw.confidence),
          rationale: sanitizeText(diagnosisRaw.rationale) || undefined,
        }
      : undefined,
    differentials: differentials.length > 0 ? differentials : undefined,
    management: managementLines.length > 0 ? managementLines : undefined,
    investigations: investigations.length > 0 ? investigations : undefined,
    counseling: counseling.length > 0 ? counseling : undefined,
    red_flags: redFlags.length > 0 ? redFlags : undefined,
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
    recommendation: normalizeDirectiveText(
      source.recommendation,
      'Proceed with targeted management and safety surveillance.'
    ),
    spot_diagnosis: spotLabel
      ? {
          label: spotLabel,
          icd10: sanitizeText(spotRaw.icd10) || undefined,
          confidence: clampVisionConfidencePercent(spotRaw.confidence),
          rationale: sanitizeText(spotRaw.rationale) || undefined,
        }
      : undefined,
    differentials: differentials.length > 0 ? differentials : undefined,
    treatment_summary: sanitizeText(source.treatment_summary)
      ? normalizeDirectiveText(
          source.treatment_summary,
          'Implement the treatment protocol with close clinical follow-up.'
        )
      : undefined,
    treatment_lines:
      treatmentLines.length > 0
        ? treatmentLines.map((entry) => normalizeDirectiveText(entry, entry))
        : undefined,
    investigations:
      investigations.length > 0
        ? investigations.map((entry) => normalizeDirectiveText(entry, entry))
        : undefined,
    counseling:
      counseling.length > 0
        ? counseling.map((entry) => normalizeDirectiveText(entry, entry))
        : undefined,
  };
};

const ensureVisionBasePayload = (payload: VisionPayload): VisionPayload => ({
  ...payload,
  summary: sanitizeText(payload.summary) || 'No conclusive visual finding.',
  recommendation: normalizeDirectiveText(
    payload.recommendation,
    'Proceed with focused clinical management and complete the plan.'
  ),
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
            label: 'Recurrent aphthous stomatitis',
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
        'Start oral ulcer protocol and monitor response over 48-72 hours.',
      treatment_lines:
        payload.treatment_lines && payload.treatment_lines.length > 0
          ? payload.treatment_lines
          : [
              'Start topical oral analgesic and anti-inflammatory protocol.',
              'Warm saline mouth rinses; avoid spicy/acidic irritants.',
              'Maintain oral hydration and soft diet until pain settles.',
            ],
      investigations:
        payload.investigations && payload.investigations.length > 0
          ? payload.investigations
          : [
              'Complete focused oral cavity examination.',
              'Order CBC and micronutrient screen (B12, folate, ferritin) for recurrent or severe episodes.',
              'Order targeted infectious testing for systemic features or atypical lesions.',
            ],
      counseling:
        payload.counseling && payload.counseling.length > 0
          ? payload.counseling
          : [
              'Escalate to emergency care if swallowing or breathing becomes difficult, dehydration appears, or high fever develops.',
              'Return for urgent review if ulcers persist beyond 2 weeks or rapidly worsen.',
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
        : ['Start symptom-directed supportive treatment and reassess progression within 24-48 hours.'],
    investigations:
      payload.investigations && payload.investigations.length > 0
        ? payload.investigations
        : ['Complete focused clinical examination and correlate with history.'],
    counseling:
      payload.counseling && payload.counseling.length > 0
        ? payload.counseling
        : ['Escalate immediately if red-flag symptoms develop or worsen.'],
  };
};

const finalizeVisionContract = (payload: VisionPayload): VisionPayload => {
  const defaults = {
    leadLabel: 'Undifferentiated clinical finding',
    leadIcd10: 'R69',
    differentials: ['Focal inflammatory process', 'Infective process', 'Traumatic lesion'],
    treatmentLines: [
      'Start definitive protocol aligned with the most likely diagnosis and patient context.',
      'Control pain/fever and maintain hydration while monitoring progression.',
    ],
    investigations: ['Targeted confirmatory testing for the lead diagnosis.', 'Focused baseline labs and reassessment trigger.'],
    counseling: [
      'Follow the treatment plan exactly as prescribed and complete the full course.',
      'Escalate immediately if red-flag symptoms appear or worsen.',
    ],
    redFlags: ['Rapid progression', 'Breathing difficulty', 'Persistent vomiting', 'Bleeding', 'Altered mental status'],
  };

  const leadFromSpot = sanitizeText(payload.spot_diagnosis?.label);
  const leadFromDifferential = sanitizeText(payload.differentials?.[0]?.label);
  const leadFromSummary = sanitizeText(payload.summary).split(/[.;]/)[0] || '';
  const leadSeed = leadFromSpot || leadFromDifferential || leadFromSummary || defaults.leadLabel;
  const codedLead = formatDiagnosisWithCode(leadSeed, defaults.leadIcd10);
  const leadLabel = stripIcd10Label(codedLead) || defaults.leadLabel;
  const leadCode = (codedLead.match(ICD10_CAPTURE_PATTERN)?.[1] || defaults.leadIcd10).toUpperCase();

  const differentialSeeds = [
    ...(payload.differentials || []).map((entry) => sanitizeText(entry.label)).filter(Boolean),
    ...defaults.differentials,
  ];
  const differentials = dedupeDxList(
    differentialSeeds.map((entry) => formatDiagnosisWithCode(entry, defaults.leadIcd10))
  )
    .slice(0, 6)
    .map((entry, index) => {
      const label = stripIcd10Label(entry);
      const icd10 = (entry.match(ICD10_CAPTURE_PATTERN)?.[1] || defaults.leadIcd10).toUpperCase();
      const existing = (payload.differentials || []).find(
        (item) => sanitizeText(item.label).toLowerCase() === label.toLowerCase()
      );
      return {
        label,
        icd10,
        likelihood: existing?.likelihood || (index === 0 ? 'high' : index <= 2 ? 'medium' : 'low'),
        rationale: sanitizeText(existing?.rationale) || undefined,
      };
    });

  return {
    ...payload,
    summary: sanitizeText(payload.summary) || 'Image reviewed with clinically relevant findings identified.',
    confidence: Math.max(clampVisionConfidencePercent(payload.confidence), 1),
    recommendation: normalizeDirectiveText(
      payload.recommendation,
      'Proceed with definitive management and complete targeted investigations now.'
    ),
    spot_diagnosis: {
      label: leadLabel,
      icd10: sanitizeText(payload.spot_diagnosis?.icd10).toUpperCase() || leadCode,
      confidence: Math.max(
        clampVisionConfidencePercent(payload.spot_diagnosis?.confidence),
        clampVisionConfidencePercent(payload.confidence),
        1
      ),
      rationale:
        sanitizeText(payload.spot_diagnosis?.rationale) ||
        sanitizeText(payload.differentials?.[0]?.rationale) ||
        'Lead diagnosis selected from the highest-consistency visual and contextual pattern.',
    },
    differentials,
    treatment_summary:
      sanitizeText(payload.treatment_summary) ||
      'Definitive management pathway prepared from diagnosis and risk profile.',
    treatment_lines: mergeUnique(payload.treatment_lines || [], defaults.treatmentLines, 8),
    investigations: mergeUnique(payload.investigations || [], defaults.investigations, 8),
    counseling: mergeUnique(payload.counseling || [], defaults.counseling, 8),
    red_flags: mergeUnique(payload.red_flags || [], defaults.redFlags, 8),
  };
};

const mergeUnique = (left: string[], right: string[], maxItems: number): string[] =>
  [...new Set([...left, ...right])].filter(Boolean).slice(0, maxItems);

const mergeConsultDifferentials = (
  primary: ConsultPayload['differentials'],
  secondary: ConsultPayload['differentials'],
  maxItems = 8
): NonNullable<ConsultPayload['differentials']> => {
  const merged = new Map<string, NonNullable<ConsultPayload['differentials']>[number]>();
  for (const entry of [...(primary || []), ...(secondary || [])]) {
    const label = sanitizeText(entry?.label);
    if (!label) continue;
    const key = label.toLowerCase();
    if (merged.has(key)) continue;
    merged.set(key, {
      label,
      icd10: sanitizeText(entry?.icd10) || undefined,
      likelihood: sanitizeLikelihood(entry?.likelihood),
      rationale: sanitizeText(entry?.rationale) || undefined,
    });
    if (merged.size >= maxItems) break;
  }
  return [...merged.values()];
};

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
  const genericQuestionPattern =
    /(what symptom is bothering you the most right now|what changed most since symptoms began|what one detail should i clarify before i summarize your working diagnosis)/i;
  const mergedUrgency =
    URGENCY_RANK[secondary.urgency || 'low'] > URGENCY_RANK[primary.urgency || 'low']
      ? secondary.urgency
      : primary.urgency;

  const mergedStatus =
    STATUS_RANK[secondary.status || 'active'] > STATUS_RANK[primary.status || 'active']
      ? secondary.status
      : primary.status;

  const primaryProbability = clampPercent(primary.probability);
  const secondaryProbability = clampPercent(secondary.probability);
  const mergedProbability = Math.max(primaryProbability, secondaryProbability);
  const primaryConfidence = clampPercent(primary.agent_state?.confidence);
  const secondaryConfidence = clampPercent(secondary.agent_state?.confidence);
  const mergedConfidence = Math.max(primaryConfidence, secondaryConfidence);
  const primaryQuestion = sanitizeText(primary.question);
  const secondaryQuestion = sanitizeText(secondary.question);
  const question =
    !primaryQuestion
      ? secondaryQuestion
      : !secondaryQuestion
        ? primaryQuestion
        : genericQuestionPattern.test(primaryQuestion) && !genericQuestionPattern.test(secondaryQuestion)
          ? secondaryQuestion
          : URGENCY_RANK[secondary.urgency || 'low'] > URGENCY_RANK[primary.urgency || 'low']
            ? secondaryQuestion
            : primaryQuestion;
  const statement =
    sanitizeText(primary.statement).length >= sanitizeText(secondary.statement).length
      ? primary.statement
      : secondary.statement;
  const mergedDifferentials = mergeConsultDifferentials(primary.differentials, secondary.differentials, 8);
  const mergedManagement = mergeUnique(primary.management || [], secondary.management || [], 10);
  const mergedInvestigations = mergeUnique(
    primary.investigations || [],
    secondary.investigations || [],
    10
  );
  const mergedCounseling = mergeUnique(primary.counseling || [], secondary.counseling || [], 10);
  const mergedRedFlags = mergeUnique(primary.red_flags || [], secondary.red_flags || [], 10);
  const diagnosisFromPrimary = primary.diagnosis?.label ? primary.diagnosis : undefined;
  const diagnosisFromSecondary = secondary.diagnosis?.label ? secondary.diagnosis : undefined;
  const mergedDiagnosis = diagnosisFromPrimary || diagnosisFromSecondary;

  return {
    ...primary,
    soap_updates: {
      S: { ...(primary.soap_updates?.S || {}), ...(secondary.soap_updates?.S || {}) },
      O: { ...(primary.soap_updates?.O || {}), ...(secondary.soap_updates?.O || {}) },
      A: { ...(primary.soap_updates?.A || {}), ...(secondary.soap_updates?.A || {}) },
      P: { ...(primary.soap_updates?.P || {}), ...(secondary.soap_updates?.P || {}) },
    },
    ddx: mergeUnique(primary.ddx || [], secondary.ddx || [], 8),
    agent_state: {
      phase: primary.agent_state?.phase || secondary.agent_state?.phase || 'assessment',
      confidence: mergedConfidence,
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
    probability: mergedProbability,
    thinking: primary.thinking || secondary.thinking || '',
    needs_options: Boolean(primary.needs_options || secondary.needs_options),
    lens_trigger: primary.lens_trigger || secondary.lens_trigger || null,
    status: mergedStatus || 'active',
    statement: statement || '',
    question: question || '',
    diagnosis: mergedDiagnosis,
    differentials: mergedDifferentials.length > 0 ? mergedDifferentials : undefined,
    management: mergedManagement.length > 0 ? mergedManagement : undefined,
    investigations: mergedInvestigations.length > 0 ? mergedInvestigations : undefined,
    counseling: mergedCounseling.length > 0 ? mergedCounseling : undefined,
    red_flags: mergedRedFlags.length > 0 ? mergedRedFlags : undefined,
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
  { pattern: /\bacute coronary syndrome\b|\bacs\b/i, code: 'I24.9' },
  { pattern: /\bmyocardial infarction\b|\bheart attack\b/i, code: 'I21.9' },
  { pattern: /\bpulmonary embol(ism)?\b|\bpe\b/i, code: 'I26.9' },
  { pattern: /\baortic dissection\b/i, code: 'I71.0' },
  { pattern: /\bpneumothorax\b/i, code: 'J93.9' },
  { pattern: /\bstroke\b|\bcerebrovascular accident\b/i, code: 'I64' },
  { pattern: /\bsubarachnoid hemorrhage\b|\bsah\b/i, code: 'I60.9' },
  { pattern: /\bappendicitis\b/i, code: 'K37' },
  { pattern: /\bperitonitis\b/i, code: 'K65.9' },
  { pattern: /\bdehydration\b/i, code: 'E86.0' },
  { pattern: /\bsevere anemia\b|\banemia\b/i, code: 'D64.9' },
  { pattern: /\bseptic arthritis\b/i, code: 'M00.9' },
  { pattern: /\bgout\b/i, code: 'M10.9' },
  { pattern: /\bmigraine\b/i, code: 'G43.9' },
  { pattern: /\btension headache\b/i, code: 'G44.2' },
  { pattern: /\bdelirium\b|altered mental status\b/i, code: 'R41.82' },
  { pattern: /\bbleeding\b|\bhemorrhage\b/i, code: 'R58' },
  { pattern: /\bshortness of breath\b|\bdyspnea\b/i, code: 'R06.02' },
  { pattern: /\bchest pain\b/i, code: 'R07.9' },
  { pattern: /\babdominal pain\b/i, code: 'R10.9' },
  { pattern: /\bheadache\b/i, code: 'R51.9' },
  { pattern: /\bjoint pain\b|\barthralgia\b/i, code: 'M25.50' },
  { pattern: /\bweakness\b|\bfatigue\b/i, code: 'R53' },
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

type EngineContractDefaults = {
  fallbackIcd10: string;
  management: string[];
  investigations: string[];
  counseling: string[];
  redFlags: string[];
};

const ENGINE_CONTRACT_DEFAULTS: Record<ChiefComplaintEngineId, EngineContractDefaults> = {
  fever: {
    fallbackIcd10: 'R50.9',
    management: [
      'Initiate acute febrile illness pathway with hydration and antipyretic support.',
      'Move to targeted antimicrobial or antiparasitic treatment only after focused confirmation.',
    ],
    investigations: ['Malaria RDT and/or blood smear', 'CBC', 'Urinalysis or chest imaging guided by symptoms'],
    counseling: [
      'Maintain hydration and strict temperature monitoring.',
      'Return urgently for confusion, breathing difficulty, persistent vomiting, bleeding, or worsening weakness.',
    ],
    redFlags: ['Confusion', 'Breathlessness', 'Persistent vomiting', 'Bleeding', 'Seizure'],
  },
  chest_pain: {
    fallbackIcd10: 'R07.9',
    management: [
      'Treat as high-risk chest pain until acute coronary and thromboembolic causes are excluded.',
      'Prioritize hemodynamic stabilization and urgent escalation when instability is present.',
    ],
    investigations: ['12-lead ECG', 'Serial troponin', 'Pulse oximetry and chest imaging as indicated'],
    counseling: [
      'Seek emergency care immediately for ongoing pressure pain, collapse, or breathlessness.',
      'Avoid exertion until urgent cardiac and pulmonary causes are ruled out.',
    ],
    redFlags: ['Collapse or syncope', 'Severe breathlessness', 'Persistent crushing chest pain', 'New neurologic deficit'],
  },
  shortness_of_breath: {
    fallbackIcd10: 'R06.02',
    management: [
      'Initiate acute dyspnea stabilization and oxygenation-first management pathway.',
      'Escalate urgently if hypoxia, exhaustion, or hemodynamic instability is suspected.',
    ],
    investigations: ['Pulse oximetry', 'Chest X-ray', 'ECG and focused blood tests'],
    counseling: [
      'Escalate immediately if breathing worsens, speech is limited, or chest pain appears.',
      'Avoid exertion and monitor oxygenation/red-flag symptoms closely.',
    ],
    redFlags: ['Severe respiratory distress', 'Cyanosis', 'Chest pain with collapse', 'Altered mental status'],
  },
  headache: {
    fallbackIcd10: 'R51.9',
    management: [
      'Start focused headache pathway while ruling out hemorrhagic and infectious emergencies.',
      'Escalate urgently when red-flag neurologic or meningeal features are present.',
    ],
    investigations: ['Focused neurologic examination', 'Neuroimaging for red flags', 'Infectious workup when febrile'],
    counseling: [
      'Seek urgent review for worst-ever headache, neck stiffness, weakness, or confusion.',
      'Do not delay emergency care when acute neurologic deficits appear.',
    ],
    redFlags: ['Worst headache of life', 'Neck stiffness', 'Focal neurologic deficit', 'Persistent vomiting'],
  },
  abdominal_pain: {
    fallbackIcd10: 'R10.9',
    management: [
      'Start abdominal pain stabilization and serial reassessment pathway.',
      'Escalate urgently for peritonitic signs, obstruction concerns, or gastrointestinal bleeding.',
    ],
    investigations: ['Abdominal examination', 'CBC and metabolic panel', 'Targeted abdominal imaging'],
    counseling: [
      'Return urgently for persistent vomiting, inability to pass stool/gas, bleeding, or severe worsening pain.',
      'Maintain hydration and avoid self-medication masking progressive pain.',
    ],
    redFlags: ['Guarding or rigidity', 'Persistent vomiting', 'GI bleeding', 'Progressive severe pain'],
  },
  vomiting_nausea: {
    fallbackIcd10: 'R11.2',
    management: [
      'Start antiemetic and fluid-repletion pathway with rapid dehydration risk stratification.',
      'Escalate for inability to retain fluids or signs of systemic compromise.',
    ],
    investigations: ['Fluid status assessment', 'Electrolytes and glucose', 'Focused cause-specific testing'],
    counseling: [
      'Use oral rehydration in small frequent amounts.',
      'Seek urgent care if vomiting persists, urine output drops, or weakness worsens.',
    ],
    redFlags: ['Inability to retain fluids', 'Severe dehydration', 'Altered consciousness', 'Hematemesis'],
  },
  diarrhea: {
    fallbackIcd10: 'A09',
    management: [
      'Initiate diarrheal illness pathway with dehydration-focused stabilization.',
      'Escalate rapidly for bloody stool, systemic toxicity, or severe volume loss.',
    ],
    investigations: ['Hydration and perfusion assessment', 'Electrolytes', 'Stool studies when indicated'],
    counseling: [
      'Prioritize oral rehydration and monitor urine output.',
      'Seek urgent review for blood in stool, persistent fever, or dizziness.',
    ],
    redFlags: ['Bloody stool', 'Severe dehydration', 'Persistent high fever', 'Syncope or collapse'],
  },
  rash: {
    fallbackIcd10: 'R21',
    management: [
      'Begin focused dermatologic triage with infection and severe drug reaction exclusion.',
      'Escalate urgently for systemic instability or mucosal involvement.',
    ],
    investigations: ['Full skin and mucosal examination', 'CBC and inflammatory markers when systemic signs exist'],
    counseling: [
      'Avoid new topical or oral triggers until reviewed.',
      'Seek emergency care for breathing difficulty, facial swelling, or rapidly spreading painful rash.',
    ],
    redFlags: ['Rapidly spreading rash', 'Mucosal involvement', 'Breathing difficulty', 'Bleeding lesions'],
  },
  joint_pain: {
    fallbackIcd10: 'M25.50',
    management: [
      'Initiate inflammatory versus infective joint pain differentiation pathway.',
      'Escalate urgently for hot swollen joint with fever or systemic toxicity.',
    ],
    investigations: ['Focused joint examination', 'Inflammatory markers', 'Joint aspiration when septic arthritis suspected'],
    counseling: [
      'Restrict weight-bearing on acutely inflamed joints until reviewed.',
      'Seek urgent care for fever, rapidly increasing swelling, or inability to move the joint.',
    ],
    redFlags: ['Hot swollen joint', 'Fever with joint pain', 'Inability to bear weight', 'Rapidly progressive swelling'],
  },
  weakness_fatigue: {
    fallbackIcd10: 'R53',
    management: [
      'Start fatigue/weakness workup with neurologic emergency exclusion first.',
      'Escalate immediately for focal deficits, collapse, or altered sensorium.',
    ],
    investigations: ['Neurologic screening', 'CBC and metabolic panel', 'Glucose and endocrine-focused tests'],
    counseling: [
      'Seek urgent care for one-sided weakness, speech change, or worsening confusion.',
      'Avoid driving or hazardous activity if weakness is progressive.',
    ],
    redFlags: ['One-sided weakness', 'Speech disturbance', 'Confusion', 'Syncope or collapse'],
  },
  bleeding: {
    fallbackIcd10: 'R58',
    management: [
      'Treat active bleeding as urgent until source and hemodynamic status are secured.',
      'Escalate emergency pathway for ongoing heavy bleeding or shock features.',
    ],
    investigations: ['Hemodynamic assessment', 'CBC and coagulation profile', 'Source-directed imaging/endoscopy'],
    counseling: [
      'Seek immediate emergency care for heavy or persistent bleeding.',
      'Avoid NSAIDs and other bleeding-risk medications unless explicitly advised.',
    ],
    redFlags: ['Heavy persistent bleeding', 'Dizziness or syncope', 'Hypotension signs', 'Hematemesis or melena'],
  },
  altered_mental_status: {
    fallbackIcd10: 'R41.82',
    management: [
      'Activate altered-mental-status emergency pathway with airway-breathing-circulation priority.',
      'Treat as high-acuity until stroke, sepsis, hypoglycemia, and toxicity are excluded.',
    ],
    investigations: ['Point-of-care glucose', 'Neurologic examination and urgent neuroimaging', 'Sepsis and toxicology screen'],
    counseling: [
      'Do not delay emergency evaluation for confusion, seizure, or reduced consciousness.',
      'Ensure continuous supervision until urgent assessment is completed.',
    ],
    redFlags: ['Reduced consciousness', 'Seizure', 'Focal neurologic deficit', 'Severe agitation or collapse'],
  },
  general: {
    fallbackIcd10: 'R69',
    management: [
      'Continue structured symptom narrowing with safety-first clinical triage.',
      'Escalate promptly if any red-flag symptom cluster emerges.',
    ],
    investigations: ['Focused history and examination', 'Targeted baseline labs by leading differential'],
    counseling: [
      'Monitor for any danger signs and return immediately if symptoms worsen.',
      'Provide one key symptom update per turn for faster narrowing.',
    ],
    redFlags: ['Breathing difficulty', 'Confusion', 'Persistent vomiting', 'Bleeding', 'Collapse'],
  },
};

const ENGINE_FALLBACK_DIFFERENTIALS: Record<ChiefComplaintEngineId, string[]> = {
  fever: ['Malaria', 'Viral infection', 'Typhoid fever', 'Sepsis'],
  chest_pain: ['Acute coronary syndrome', 'Pulmonary embolism', 'Aortic dissection', 'Musculoskeletal chest pain'],
  shortness_of_breath: ['Pulmonary embolism', 'Acute heart failure', 'Pneumonia', 'Asthma exacerbation'],
  headache: ['Migraine', 'Meningitis', 'Subarachnoid hemorrhage', 'Tension headache'],
  abdominal_pain: ['Appendicitis', 'Gastroenteritis', 'Pancreatitis', 'Peritonitis'],
  vomiting_nausea: ['Acute gastroenteritis', 'Dehydration', 'Medication reaction', 'Metabolic disturbance'],
  diarrhea: ['Acute gastroenteritis', 'Food-borne illness', 'Inflammatory bowel process', 'GI bleeding'],
  rash: ['Allergic dermatitis', 'Viral exanthem', 'Drug reaction', 'Invasive infection'],
  joint_pain: ['Rheumatoid arthritis flare', 'Septic arthritis', 'Gout flare', 'Reactive arthritis'],
  weakness_fatigue: ['Anemia', 'Viral illness', 'Endocrine disturbance', 'Stroke'],
  bleeding: ['Hemorrhoidal bleeding', 'Upper GI bleeding', 'Coagulopathy', 'Major hemorrhage'],
  altered_mental_status: ['Delirium', 'Stroke', 'Sepsis-associated encephalopathy', 'Drug toxicity'],
  general: ['Undifferentiated illness', 'Systemic infection', 'Metabolic disturbance'],
};

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
      starterQuestion: 'Tell me the one symptom troubling you most right now.',
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
      starterQuestion: 'Tell me the one symptom troubling you most right now.',
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

const ICD10_CAPTURE_PATTERN = /\(ICD-10:\s*([A-Z0-9.-]+)\)/i;

const formatDiagnosisWithCode = (diagnosis: string, fallbackCode?: string): string => {
  const coded = applyIcd10Label(diagnosis);
  const label = stripIcd10Label(coded || diagnosis);
  const existingCode = (coded.match(ICD10_CAPTURE_PATTERN)?.[1] || '').toUpperCase();
  const resolvedCode = existingCode || sanitizeText(fallbackCode).toUpperCase();
  if (!label) return '';
  return resolvedCode ? `${label} (ICD-10: ${resolvedCode})` : label;
};

const toLikelihoodBand = (index: number): 'high' | 'medium' | 'low' => {
  if (index === 0) return 'high';
  if (index <= 2) return 'medium';
  return 'low';
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

const finalizeConsultContract = (
  payload: ConsultPayload,
  complaintRoute: {
    engineId: ChiefComplaintEngineId;
    label: string;
    mustNotMiss: string[];
  },
  leadCandidate?: OrchestratedCandidate
): ConsultPayload => {
  const defaults = ENGINE_CONTRACT_DEFAULTS[complaintRoute.engineId] || ENGINE_CONTRACT_DEFAULTS.general;
  const fallbackDx = ENGINE_FALLBACK_DIFFERENTIALS[complaintRoute.engineId] || ENGINE_FALLBACK_DIFFERENTIALS.general;
  const leadSeed =
    payload.diagnosis?.label ||
    leadCandidate?.diagnosis ||
    payload.ddx?.[0] ||
    fallbackDx[0] ||
    `${complaintRoute.label.replace(/\s*Engine$/i, '')} presentation`;
  const leadDiagnosis = formatDiagnosisWithCode(leadSeed, defaults.fallbackIcd10);

  const ddxCandidates = dedupeDxList([
    leadDiagnosis,
    ...((payload.ddx || []).map((entry) => formatDiagnosisWithCode(entry, defaults.fallbackIcd10))),
    ...fallbackDx.map((entry) => formatDiagnosisWithCode(entry, defaults.fallbackIcd10)),
    ...complaintRoute.mustNotMiss.map((entry) => formatDiagnosisWithCode(entry, defaults.fallbackIcd10)),
  ])
    .filter(Boolean)
    .slice(0, 8);

  const topDx = ddxCandidates[0] || leadDiagnosis;
  const topLabel = stripIcd10Label(topDx);
  const topCode =
    sanitizeText(payload.diagnosis?.icd10).toUpperCase() ||
    (topDx.match(ICD10_CAPTURE_PATTERN)?.[1] || '').toUpperCase() ||
    defaults.fallbackIcd10;

  const differentialEntries = ddxCandidates.slice(0, 6).map((entry, index) => {
    const label = stripIcd10Label(entry);
    const code = (entry.match(ICD10_CAPTURE_PATTERN)?.[1] || '').toUpperCase() || defaults.fallbackIcd10;
    return {
      label,
      icd10: code,
      likelihood: toLikelihoodBand(index),
      rationale:
        index === 0
          ? `Current lead diagnosis based on ${complaintRoute.label.toLowerCase()} signal pattern.`
          : undefined,
    };
  });

  const management = mergeUnique(
    payload.management || [],
    [...defaults.management, ...(leadCandidate?.pendingActions || [])],
    10
  );
  const investigations = mergeUnique(payload.investigations || [], defaults.investigations, 10);
  const counseling = mergeUnique(payload.counseling || [], defaults.counseling, 10);
  const redFlags = mergeUnique(payload.red_flags || [], defaults.redFlags, 10);

  return {
    ...payload,
    ddx: ddxCandidates,
    diagnosis: {
      label: topLabel,
      icd10: topCode,
      confidence: Math.max(clampPercent(payload.diagnosis?.confidence), clampPercent(payload.probability)),
      rationale:
        sanitizeText(payload.diagnosis?.rationale) ||
        `${complaintRoute.label} routing and accumulated findings support this working diagnosis.`,
    },
    differentials: differentialEntries,
    management,
    investigations,
    counseling,
    red_flags: redFlags,
  };
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

  const subjectiveSoap =
    body.state?.soap &&
    typeof body.state.soap === 'object' &&
    body.state.soap['S'] &&
    typeof body.state.soap['S'] === 'object'
      ? (body.state.soap['S'] as Record<string, unknown>)
      : {};

  const soapSnapshot = JSON.stringify({
    ...subjectiveSoap,
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
  { intent: 'most_limiting', question: 'What single symptom is troubling you most right now?' },
  { intent: 'symptom_change', question: 'Since this started, has that symptom improved, worsened, or stayed the same?' },
  { intent: 'pattern', question: 'Does it follow a pattern: daytime, nighttime, intermittent, or constant?' },
  {
    intent: 'danger_signs',
    question:
      'Any danger signs now such as breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
  },
];

const NON_SUBSTANTIVE_RESPONSE_PATTERN = /^(ok|okay|alright|fine|hmm+|uh+h*|ah+h*|k|kk)$/i;
const UNCERTAIN_RESPONSE_PATTERN = /\b(not sure|unsure|unknown|maybe|don'?t know|cannot tell|idk)\b/i;
const SUMMARY_CLARIFY_QUESTION_PATTERN =
  /\bwhat one detail should i clarify before i summarize\b|\bwhat other detail should i clarify before i summarize\b|\bworking diagnosis and plan\b/i;
const SUMMARY_READY_PATIENT_PATTERN =
  /\bready for summary\b|\bsummary\b|\bdone\b|\bno more\b|\bnothing else\b|\bthat'?s all\b|\bproceed\b/i;
const CONTRADICTION_SIGNAL_PATTERN =
  /\bactually\b|\bbut now\b|\bhowever\b|\binstead\b|\bnew symptom\b|\bnow also\b|\bchanged\b|\bworse now\b|\bbetter now\b/i;
const FINAL_SUMMARY_QUESTION = 'Would you like me to finalize your working diagnosis and treatment plan now?';

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

const hasRecentPatientSignal = (
  conversation: ConversationEntry[],
  pattern: RegExp,
  lookback = 24
): boolean =>
  (conversation || [])
    .filter((entry) => entry.role === 'patient')
    .slice(-lookback)
    .some((entry) => pattern.test(sanitizeText(entry.content)));

const isLikelyContradictionUpdate = (latestPatientInput: string): boolean =>
  CONTRADICTION_SIGNAL_PATTERN.test(sanitizeText(latestPatientInput));

const getNextProgressiveIntentQuestion = (
  conversation: ConversationEntry[],
  currentIntent: QuestionIntent | null
): string | null => {
  const currentIndex = currentIntent
    ? INTENT_SEQUENCE.findIndex((step) => step.intent === currentIntent)
    : -1;

  if (currentIndex >= 0) {
    for (let index = currentIndex + 1; index < INTENT_SEQUENCE.length; index += 1) {
      const step = INTENT_SEQUENCE[index];
      if (!hasAnsweredIntent(conversation, step.intent, 64)) {
        return step.question;
      }
    }
  }

  for (const step of INTENT_SEQUENCE) {
    if (!hasAnsweredIntent(conversation, step.intent, 64)) {
      return step.question;
    }
  }

  return null;
};

const enforceQuestionProgression = (
  question: string,
  conversation: ConversationEntry[],
  latestPatientInput = ''
): string => {
  const normalized = sanitizeText(question);
  if (!normalized) return normalized;

  const patientReadyForSummary =
    SUMMARY_READY_PATIENT_PATTERN.test(sanitizeText(latestPatientInput)) ||
    hasRecentPatientSignal(conversation, SUMMARY_READY_PATIENT_PATTERN, 20);

  if (SUMMARY_CLARIFY_QUESTION_PATTERN.test(normalized) && patientReadyForSummary) {
    return FINAL_SUMMARY_QUESTION;
  }

  const intent = detectQuestionIntent(normalized);
  if (!intent) return normalized;

  const recentIntentAsks = countRecentIntentAsks(conversation, intent, 10);
  const repeatedAsk = recentIntentAsks >= 2;
  const answeredAlready = hasAnsweredIntent(conversation, intent, 48);
  const contradictionUpdate = isLikelyContradictionUpdate(latestPatientInput);

  if ((!answeredAlready && !repeatedAsk) || contradictionUpdate) {
    return normalized;
  }

  const progressedQuestion = getNextProgressiveIntentQuestion(conversation, intent);
  if (
    progressedQuestion &&
    sanitizeText(progressedQuestion).toLowerCase() !== normalized.toLowerCase()
  ) {
    return progressedQuestion;
  }

  if (patientReadyForSummary) {
    return FINAL_SUMMARY_QUESTION;
  }

  return normalized;
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
    return finalizeConsultContract(
      {
      ...payload,
      ddx: withCodedDdx,
      },
      complaintRoute
    );
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
  const escalationFloor = lead.emergency ? Math.max(probabilityFloor, 78) : probabilityFloor;
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

  const genericQuestionPattern =
    /(what symptom is bothering you the most right now|tell me the one symptom troubling you most right now|what changed most since symptoms began|what one detail should i clarify before i summarize your working diagnosis)/i;
  const progressionFallbackQuestion =
    getNextProgressiveIntentQuestion(body.state?.conversation || [], null) ||
    FINAL_SUMMARY_QUESTION;
  const conversationalFallbackQuestion =
    patientTurns <= 1
      ? complaintRoute.starterQuestion
      : progressionFallbackQuestion;
  const resolvedQuestion =
    preferredQuestion && !genericQuestionPattern.test(preferredQuestion)
      ? preferredQuestion
      : payload.question && !genericQuestionPattern.test(payload.question)
        ? payload.question
        : conversationalFallbackQuestion;
  const safeguardedQuestion = enforceQuestionProgression(
    resolvedQuestion || 'Tell me the one symptom troubling you most right now.',
    body.state?.conversation || [],
    body.patientInput || ''
  );

  return finalizeConsultContract({
    ...payload,
    statement: ensureEmpathicStatement(payload.statement, body),
    ddx: mergedDdx,
    probability: Math.max(clampPercent(payload.probability), escalationFloor),
    urgency: nextUrgency,
    agent_state: {
      phase: nextPhase,
      confidence: Math.max(clampPercent(payload.agent_state?.confidence), escalationFloor),
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
      'Tell me the one symptom troubling you most right now.',
  }, complaintRoute, lead);
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

const extractAnthropicText = (content: unknown): string => {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const node = item as Record<string, unknown>;
      if (sanitizeText(node.type).toLowerCase() !== 'text') return '';
      return sanitizeText(node.text);
    })
    .filter(Boolean)
    .join(' ');
};

const parseImageDataUrl = (imageDataUrl: string): { mediaType: string; base64Data: string } => {
  const normalized = sanitizeText(imageDataUrl);
  const prefix = 'data:';
  const marker = ';base64,';
  if (!normalized.startsWith(prefix)) {
    throw new Error('Vision API expects a base64 data URL image payload.');
  }
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex <= prefix.length) {
    throw new Error('Invalid image data URL: missing media type or base64 marker.');
  }
  const mediaType = normalized.slice(prefix.length, markerIndex).toLowerCase();
  const base64Data = normalized.slice(markerIndex + marker.length).replace(/\s+/g, '');
  if (!mediaType.startsWith('image/')) {
    throw new Error('Invalid image data URL: media type must be image/*.');
  }
  if (!base64Data) {
    throw new Error('Invalid image data URL: base64 image payload is empty.');
  }
  return { mediaType, base64Data };
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
        return extractAnthropicText(data?.content);
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

const callAnthropicVision = async (input: {
  systemPrompt: string;
  userText: string;
  imageDataUrl: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> => {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'Missing Anthropic key on server. Configure ANTHROPIC_API_KEY.'
    );
  }

  const models = getModelCandidates('anthropic', 'vision');
  if (models.length === 0) {
    throw new Error('No Anthropic model configured. Set ANTHROPIC_MODEL or CLAUDE_MODEL.');
  }

  const { mediaType, base64Data } = parseImageDataUrl(input.imageDataUrl);
  let lastErrorMessage = 'Unknown Anthropic vision failure.';

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
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: input.userText },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as { content?: Array<Record<string, unknown>> };
        return extractAnthropicText(data?.content);
      }

      const body = await response.text();
      lastErrorMessage = `Anthropic vision request failed (${response.status}) [model:${model}]: ${body}`;
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

const selectPrimaryProviderForVision = (body: VisionRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_VISION_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const corpus = `${sanitizeText(body.clinicalContext)} ${sanitizeText(body.lensPrompt)}`.toLowerCase();
  if (/(differential|icd-?10|must-not-miss|critical|triage)/i.test(corpus)) return 'anthropic';
  return 'openai';
};

const selectPrimaryProviderForScanPlan = (body: ScanPlanRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_SCAN_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const analysis = normalizeVisionPayload(body.analysis || {});
  const corpus = [
    sanitizeText(body.clinicalContext),
    sanitizeText(analysis.summary),
    ...(analysis.findings || []),
    ...(analysis.red_flags || []),
    sanitizeText(analysis.recommendation),
    sanitizeText(analysis.spot_diagnosis?.label),
    ...(analysis.differentials || []).map((entry) => sanitizeText(entry.label)),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(critical|unstable|must-not-miss|shock|stroke|sepsis|respiratory distress)/i.test(corpus)) {
    return 'anthropic';
  }
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

const getProviderFailureMessage = (provider: LlmProvider, reason: unknown): string => {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'Unknown provider failure.';
  return `[${provider}] ${message}`;
};

const runWithProviderFailover = async <T>(
  providers: LlmProvider[],
  invoke: (provider: LlmProvider) => Promise<T>
): Promise<T> => {
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      return await invoke(provider);
    } catch (error) {
      failures.push(getProviderFailureMessage(provider, error));
    }
  }

  throw new Error(failures.join(' | '));
};

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
    return runWithProviderFailover(available, invoke);
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
    primaryResult.status === 'rejected'
      ? getProviderFailureMessage(primaryProvider, primaryResult.reason)
      : `[${primaryProvider}] Primary provider failed.`;
  const secondaryReason =
    secondaryResult.status === 'rejected'
      ? getProviderFailureMessage(secondaryProvider, secondaryResult.reason)
      : `[${secondaryProvider}] Secondary provider failed.`;
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
Interview Mode: Conversational telemedicine history-taking (free chat with optional guided suggestions)

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

const executeVisionBaseWithProvider = async (
  provider: LlmProvider,
  imageDataUrl: string,
  contextPrompt: string,
  lensPrompt: string
): Promise<VisionPayload> => {
  const raw =
    provider === 'anthropic'
      ? await callAnthropicVision({
          maxTokens: 420,
          systemPrompt: VISION_SYSTEM_PROMPT,
          userText: `Clinical context: ${contextPrompt}\nTask: ${lensPrompt}\nReturn strict JSON.`,
          imageDataUrl,
        })
      : await callOpenAI({
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

  return ensureVisionBasePayload(normalizeVisionPayload(parseFirstJsonObject(raw)));
};

const executeVisionEnrichmentWithProvider = async (
  provider: LlmProvider,
  imageDataUrl: string,
  contextPrompt: string,
  lensPrompt: string,
  basePayload: VisionPayload
): Promise<VisionPayload> => {
  const baseSummary = sanitizeText(basePayload.summary) || 'none';
  const baseFindings = (basePayload.findings || []).join('; ') || 'none';
  const baseRedFlags = (basePayload.red_flags || []).join('; ') || 'none';
  const userText = `Clinical context: ${contextPrompt}
Task: ${lensPrompt}
Base summary: ${baseSummary}
Base findings: ${baseFindings}
Base red flags: ${baseRedFlags}
Return only strict JSON for enrichment fields.`;

  const raw =
    provider === 'anthropic'
      ? await callAnthropicVision({
          maxTokens: 420,
          systemPrompt: VISION_ENRICHMENT_PROMPT,
          userText,
          imageDataUrl,
        })
      : await callOpenAI({
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
                  text: userText,
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

const executeScanPlanWithProvider = async (
  provider: LlmProvider,
  body: ScanPlanRequest
): Promise<VisionPayload> => {
  const normalizedAnalysis = normalizeVisionPayload(body.analysis || {});
  const contextPrompt = sanitizeText(body.clinicalContext) || 'No extra clinical context provided.';
  const lens = sanitizeText(body.lens) || 'general';
  const userPrompt = `Lens: ${lens}
Clinical context: ${contextPrompt}
Base analysis: ${JSON.stringify({
  summary: normalizedAnalysis.summary,
  findings: normalizedAnalysis.findings || [],
  red_flags: normalizedAnalysis.red_flags || [],
  recommendation: normalizedAnalysis.recommendation,
  spot_diagnosis: normalizedAnalysis.spot_diagnosis,
  differentials: normalizedAnalysis.differentials || [],
  treatment_summary: normalizedAnalysis.treatment_summary,
  treatment_lines: normalizedAnalysis.treatment_lines || [],
  investigations: normalizedAnalysis.investigations || [],
  counseling: normalizedAnalysis.counseling || [],
})}

Generate a stronger treatment-focused plan as Dr. Dyrane.
Return strict JSON only.`;

  const raw =
    provider === 'anthropic'
      ? await callAnthropic({
          maxTokens: 640,
          systemPrompt: SCAN_PLAN_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.15,
        })
      : await callOpenAI({
          maxTokens: 640,
          forceJson: true,
          temperature: 0.15,
          messages: [
            { role: 'system', content: SCAN_PLAN_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });

  return normalizeVisionPayload(parseFirstJsonObject(raw));
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

export const runScanPlan = async (body: ScanPlanRequest): Promise<unknown> => {
  const normalizedAnalysis = normalizeVisionPayload(body.analysis || {});
  const hasBaseEvidence =
    sanitizeText(normalizedAnalysis.summary).length > 0 ||
    (normalizedAnalysis.findings || []).length > 0 ||
    (normalizedAnalysis.spot_diagnosis?.label || '').trim().length > 0;
  if (!hasBaseEvidence) {
    throw new Error('Scan plan requires a prior analysis summary, findings, or spot diagnosis.');
  }

  const providerOrder = resolveProviderOrder(selectPrimaryProviderForScanPlan(body));
  const availableProviders = providerOrder.filter((provider) => hasProviderKey(provider));
  if (availableProviders.length === 0) {
    throw new Error('No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  const payload = await runWithProviderFailover(availableProviders, (provider) =>
    executeScanPlanWithProvider(provider, {
      ...body,
      analysis: normalizedAnalysis,
    })
  );

  return finalizeVisionContract(applyVisionMinimumEnrichment(normalizeVisionPayload(payload)));
};

export const runVision = async (body: VisionRequest): Promise<unknown> => {
  const imageDataUrl = sanitizeText(body.imageDataUrl);
  parseImageDataUrl(imageDataUrl);

  const contextPrompt = sanitizeText(body.clinicalContext) || 'No extra clinical context provided.';
  const lensPrompt = sanitizeText(body.lensPrompt) || 'Analyze clinically relevant visual cues.';
  const providerOrder = resolveProviderOrder(selectPrimaryProviderForVision(body));
  const availableProviders = providerOrder.filter((provider) => hasProviderKey(provider));
  if (availableProviders.length === 0) {
    throw new Error('No vision provider API key configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }
  const basePayload = await runWithProviderFailover(availableProviders, (provider) =>
    executeVisionBaseWithProvider(provider, imageDataUrl, contextPrompt, lensPrompt)
  );

  if (!normalizeBooleanEnv(process.env.VISION_ENRICHMENT, true)) {
    return finalizeVisionContract(applyVisionMinimumEnrichment(basePayload));
  }

  try {
    const enrichmentPayload = await runWithProviderFailover(availableProviders, (provider) =>
      executeVisionEnrichmentWithProvider(
        provider,
        imageDataUrl,
        contextPrompt,
        lensPrompt,
        basePayload
      )
    );
    return finalizeVisionContract(
      applyVisionMinimumEnrichment(mergeVisionPayload(basePayload, enrichmentPayload))
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('[runVision] enrichment skipped, returning base payload', { reason });
    return finalizeVisionContract(applyVisionMinimumEnrichment(basePayload));
  }
};
