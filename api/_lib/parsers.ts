import { 
  ConsultPayload, 
  OptionsPayload, 
  VisionPayload, 
  ConsultRequest, 
  ChiefComplaintEngineId,
  AgentPhase,
  QuestionIntent,
} from './types.js';
import { 
  URGENCY_RANK, 
  STATUS_RANK, 
  ICD10_RULES, 
  ICD10_CAPTURE_PATTERN, 
  ENGINE_CONTRACT_DEFAULTS, 
  ENGINE_FALLBACK_DIFFERENTIALS,
} from './clinical.js';
import { 
  sanitizeText, 
  clampPercent, 
  clampVisionConfidencePercent 
} from './utils.js';

export const repairJson = (value: string): string =>
  value
    .replace(/"\s*\n?\s*"/g, '", "')
    .replace(/}\s*\n?\s*"/g, '}, "')
    .replace(/]\s*\n?\s*"/g, '], "')
    .replace(/\{\s*"([^"]+)"\s*(?!:)\}/g, '{"recorded": "$1"}')
    .replace(/,\s*([}\]])/g, '$1');

export const parseFirstJsonObject = (text: string): unknown => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const target = jsonMatch ? jsonMatch[0] : text;
  try {
    return JSON.parse(target);
  } catch {
    return JSON.parse(repairJson(target));
  }
};

export const sanitizeList = (value: unknown, maxItems: number): string[] =>
  Array.isArray(value)
    ? value.map((item) => sanitizeText(item)).filter(Boolean).slice(0, maxItems)
    : [];

export const toSentence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
};

export const normalizeDirectiveText = (value: unknown, fallback: string): string => {
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

export const sanitizeUrgency = (value: unknown): ConsultPayload['urgency'] => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  return 'low';
};

export const sanitizeStatus = (value: unknown): ConsultPayload['status'] => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'emergency') return 'emergency';
  if (normalized === 'complete') return 'complete';
  if (normalized === 'lens') return 'lens';
  if (normalized === 'active') return 'active';
  if (normalized === 'intake') return 'intake';
  return 'active';
};

export const sanitizeCheckpointStatus = (
  value: unknown
): NonNullable<NonNullable<ConsultPayload['agent_state']>['must_not_miss_checkpoint']>['status'] => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'pending') return 'pending';
  if (normalized === 'cleared') return 'cleared';
  if (normalized === 'escalate') return 'escalate';
  return 'idle';
};

export const sanitizeLikelihood = (value: unknown): 'high' | 'medium' | 'low' => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
};

export const sanitizeSoap = (value: unknown): ConsultPayload['soap_updates'] => {
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

export const normalizeConsultDifferentials = (
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

export const normalizeConsultPayload = (value: unknown): ConsultPayload => {
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

export const normalizeOptionsPayload = (value: unknown): OptionsPayload => {
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

export const normalizeVisionPayload = (value: unknown): VisionPayload => {
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

export const ensureVisionBasePayload = (payload: VisionPayload): VisionPayload => ({
  ...payload,
  summary: sanitizeText(payload.summary) || 'No conclusive visual finding.',
  recommendation: normalizeDirectiveText(
    payload.recommendation,
    'Proceed with focused clinical management and complete the plan.'
  ),
});

export const mergeVisionPayload = (base: VisionPayload, enrichment: VisionPayload): VisionPayload => {
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

export const applyVisionMinimumEnrichment = (payload: VisionPayload): VisionPayload => {
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

export const stripIcd10Label = (diagnosis: string): string =>
  diagnosis.replace(/\s*\(ICD-10:\s*[A-Z0-9.-]+\)\s*/gi, '').trim();

export const normalizeDxKey = (diagnosis: string): string =>
  stripIcd10Label(diagnosis)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const applyIcd10Label = (diagnosis: string): string => {
  const value = sanitizeText(diagnosis);
  if (!value) return '';
  if (/\(ICD-10:\s*[A-Z0-9.-]+\)/i.test(value)) return value;
  const rule = ICD10_RULES.find((candidate) => candidate.pattern.test(value));
  if (!rule) return value;
  return `${value} (ICD-10: ${rule.code})`;
};

export const formatDiagnosisWithCode = (diagnosis: string, fallbackCode?: string): string => {
  const coded = applyIcd10Label(diagnosis);
  const label = stripIcd10Label(coded || diagnosis);
  const existingCode = (coded.match(ICD10_CAPTURE_PATTERN)?.[1] || '').toUpperCase();
  const resolvedCode = existingCode || sanitizeText(fallbackCode).toUpperCase();
  if (!label) return '';
  return resolvedCode ? `${label} (ICD-10: ${resolvedCode})` : label;
};

export const toLikelihoodBand = (index: number): 'high' | 'medium' | 'low' => {
  if (index === 0) return 'high';
  if (index <= 2) return 'medium';
  return 'low';
};

export const dedupeDxList = (diagnoses: string[]): string[] => {
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

export const mergeUnique = (left: string[], right: string[], maxItems: number): string[] =>
  [...new Set([...left, ...right])].filter(Boolean).slice(0, maxItems);

export const finalizeVisionContract = (payload: VisionPayload): VisionPayload => {
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

export const mergeConsultDifferentials = (
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

export const mergeCheckpointState = (
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

export const mergeConsultPayloads = (primary: ConsultPayload, secondary: ConsultPayload): ConsultPayload => {
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

export const mergeOptionsPayloads = (primary: OptionsPayload, secondary: OptionsPayload): OptionsPayload => {
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

export const finalizeConsultContract = (
  payload: ConsultPayload,
  complaintRoute: {
    engineId: ChiefComplaintEngineId;
    label: string;
    mustNotMiss: string[];
  },
  leadCandidate?: {
    diagnosis: string;
    score: number;
    emergency: boolean;
    followUpQuestion?: string;
    pendingActions: string[];
  }
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

  const differentialEntries = ddxCandidates.slice(0, 6).map((entry: any, index: number) => {
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

export const extractPatientMirror = (body: ConsultRequest): string => {
  const current = sanitizeText(body.patientInput);
  if (!current) return '';
  return current
    .split(/[.?!,;]/)[0]
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
};

export const ensureEmpathicStatement = (
  statement: string | undefined,
  body: ConsultRequest
): string => {
  const base = sanitizeText(statement);
  const mirror = extractPatientMirror(body);
  if (!mirror) return base || 'Thank you for sharing that.';
  if (base) return base;
  return `Thank you for sharing. I hear that ${mirror.toLowerCase()}.`;
};

export const buildConsultTextCorpus = (body: ConsultRequest, payload: ConsultPayload): string => {
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

export const dedupeActions = (actions: string[]): string[] =>
  [...new Set(actions.map((item) => sanitizeText(item)).filter(Boolean))];

export const atLeastDifferential = (phase: unknown): AgentPhase => {
  const normalized = sanitizeText(phase).toLowerCase();
  if (normalized === 'resolution' || normalized === 'differential') return normalized as AgentPhase;
  return 'differential';
};

export const INTENT_PATTERNS: Record<QuestionIntent, RegExp> = {
  most_limiting: /\bmost limiting\b|\bstands?\s*out\b/i,
  symptom_change: /\bchanged since\b|\bhow has\b|\bbetter|worse|improved\b/i,
  pattern:
    /\bpattern\b|\bintermittent\b|\bconstant\b|\bday\b|\bnight\b|\bcyclic(al)?\b|\bcycle(s)?\b|\bnocturnal\b|\bevening chills?\b|\bmorning relief\b/i,
  danger_signs:
    /\bdanger signs?\b|\bbreathlessness\b|\bconfusion\b|\bpersistent vomiting\b|\bbleeding\b|\bchest pain\b/i,
};

export const INTENT_SEQUENCE: Array<{ intent: QuestionIntent; question: string }> = [
  { intent: 'most_limiting', question: 'What single symptom is troubling you most right now?' },
  { intent: 'symptom_change', question: 'Since this started, has that symptom improved, worsened, or stayed the same?' },
  { intent: 'pattern', question: 'Does it follow a pattern: daytime, nighttime, intermittent, or constant?' },
  {
    intent: 'danger_signs',
    question:
      'Any danger signs now such as breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
  },
];

export const NON_SUBSTANTIVE_RESPONSE_PATTERN = /^(ok|okay|alright|fine|hmm+|uh+h*|ah+h*|k|kk)$/i;
export const UNCERTAIN_RESPONSE_PATTERN = /\b(not sure|unsure|unknown|maybe|don'?t know|cannot tell|idk)\b/i;
export const SUMMARY_CLARIFY_QUESTION_PATTERN =
  /\bwhat one detail should i clarify before i summarize\b|\bwhat other detail should i clarify before i summarize\b|\bworking diagnosis and plan\b/i;
export const SUMMARY_READY_PATIENT_PATTERN =
  /\bready for summary\b|\bsummary\b|\bdone\b|\bno more\b|\bnothing else\b|\bthat'?s all\b|\bproceed\b/i;
export const CONTRADICTION_SIGNAL_PATTERN =
  /\bactually\b|\bbut now\b|\bhowever\b|\binstead\b|\bnew symptom\b|\bnow also\b|\bchanged\b|\bworse now\b|\bbetter now\b/i;
export const FINAL_SUMMARY_QUESTION = 'Would you like me to finalize your working diagnosis and treatment plan now?';

export const detectQuestionIntent = (question: string): QuestionIntent | null => {
  const normalized = sanitizeText(question);
  if (!normalized) return null;
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(normalized)) return intent as QuestionIntent;
  }
  return null;
};

export const isSubstantivePatientReply = (text: string): boolean => {
  const normalized = sanitizeText(text);
  if (!normalized) return false;
  if (UNCERTAIN_RESPONSE_PATTERN.test(normalized)) return false;
  if (NON_SUBSTANTIVE_RESPONSE_PATTERN.test(normalized)) return false;
  return /[a-z0-9]/i.test(normalized);
};

export const hasAnsweredIntent = (
  conversation: any[],
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

export const countRecentIntentAsks = (
  conversation: any[],
  intent: QuestionIntent,
  lookback = 14
): number => {
  const pattern = INTENT_PATTERNS[intent];
  return (conversation || [])
    .filter((entry) => entry.role === 'doctor')
    .slice(-lookback)
    .reduce((count, entry) => (pattern.test(sanitizeText(entry.content)) ? count + 1 : count), 0);
};

export const hasRecentPatientSignal = (
  conversation: any[],
  pattern: RegExp,
  lookback = 24
): boolean =>
  (conversation || [])
    .filter((entry) => entry.role === 'patient')
    .slice(-lookback)
    .some((entry) => pattern.test(sanitizeText(entry.content)));

export const isLikelyContradictionUpdate = (latestPatientInput: string): boolean =>
  CONTRADICTION_SIGNAL_PATTERN.test(sanitizeText(latestPatientInput));

export const getNextProgressiveIntentQuestion = (
  conversation: any[],
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

export const enforceQuestionProgression = (
  question: string,
  conversation: any[],
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
