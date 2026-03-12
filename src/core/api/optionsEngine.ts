import { ClinicalState, ResponseOptions } from '../types/clinical';
import { getPromptCache, recordPromptUsage, setPromptCache } from '../storage/promptCache';
import {
  buildNumericScaleOptions,
  isNumericScaleOptionSet,
  isScaleIntentQuestion,
  parseScaleRange,
} from './agent/scaleIntent';
import { isDirectYesNoQuestion } from './agent/localOptions';

const OPTIONS_CACHE_TTL_MS = 1000 * 60 * 20;

const VALID_VARIANTS = new Set(['stack', 'grid', 'binary', 'segmented', 'scale', 'ladder', 'chips']);

const FUNCTIONAL_SCALE_OPTIONS = [
  { id: 'none', text: 'No difficulty', category: 'functional_impact', priority: 10 },
  { id: 'mild', text: 'Mild difficulty', category: 'functional_impact', priority: 9 },
  { id: 'moderate', text: 'Moderate difficulty', category: 'functional_impact', priority: 8 },
  { id: 'severe', text: 'Severe difficulty', category: 'functional_impact', priority: 7 },
  { id: 'unable', text: 'Unable to perform tasks', category: 'functional_impact', priority: 6 },
];

const BINARY_TOKENS = new Set([
  'yes',
  'no',
  'not sure',
  'unsure',
  'unknown',
  'maybe',
  'sometimes',
]);

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const sanitizeOptions = (options: ResponseOptions['options']): ResponseOptions['options'] => {
  const usedIds = new Set<string>();

  return options
    .filter((option) => option && typeof option.text === 'string' && option.text.trim())
    .map((option, idx) => {
      const normalizedText = option.text.trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');
      const baseId = option.id?.trim() || slugify(normalizedText) || `option-${idx + 1}`;
      let nextId = baseId;
      let suffix = 1;
      while (usedIds.has(nextId)) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(nextId);
      return { ...option, id: nextId, text: normalizedText };
    })
    .slice(0, 12);
};

const isBinaryLike = (options: ResponseOptions['options']): boolean => {
  if (options.length === 0 || options.length > 3) return false;
  return options.every((option) => BINARY_TOKENS.has(option.text.toLowerCase().trim()));
};

const inferVariant = (
  mode: ResponseOptions['mode'],
  options: ResponseOptions['options'],
  hinted?: ResponseOptions['ui_variant']
): NonNullable<ResponseOptions['ui_variant']> => {
  if (hinted && VALID_VARIANTS.has(hinted)) {
    return hinted;
  }

  if (mode === 'multiple') {
    return options.length > 6 ? 'grid' : 'chips';
  }

  if (isBinaryLike(options)) {
    return 'segmented';
  }

  if (
    options.length >= 3 &&
    options.length <= 6 &&
    options.some((option) => /(mild|moderate|severe|worst|very)/i.test(option.text))
  ) {
    return 'ladder';
  }

  if (
    options.length >= 5 &&
    options.every((option) => /^(\d+|none|mild|moderate|severe)$/i.test(option.text))
  ) {
    return 'scale';
  }

  if (options.length <= 4 && mode === 'single') return 'segmented';
  return options.length >= 6 ? 'grid' : 'stack';
};

const shouldUseFunctionalScale = (
  question: string,
  options: ResponseOptions['options']
): boolean => {
  const functionalPattern =
    /(daily|function|activity|activities|task|tasks|difficulty|energy|fatigue|impact|functioning)/i;
  return functionalPattern.test(question) && (options.length === 0 || isBinaryLike(options));
};

const forceNumericScaleIfNeeded = (
  question: string,
  mode: ResponseOptions['mode'],
  options: ResponseOptions['options'],
  hintedVariant?: ResponseOptions['ui_variant']
): {
  mode: ResponseOptions['mode'];
  options: ResponseOptions['options'];
  uiVariantHint?: ResponseOptions['ui_variant'];
  scale?: ResponseOptions['scale'];
} => {
  if (!isScaleIntentQuestion(question)) {
    return { mode, options, uiVariantHint: hintedVariant };
  }

  const range = parseScaleRange(question) || { min: 1, max: 10 };
  if (isNumericScaleOptionSet(options) && (hintedVariant === 'scale' || hintedVariant === undefined)) {
    return {
      mode: 'single',
      options,
      uiVariantHint: 'scale',
      scale: { min: range.min, max: range.max, step: 1, low_label: 'Mild', high_label: 'Severe' },
    };
  }

  return {
    mode: 'single',
    options: buildNumericScaleOptions(range.min, range.max),
    uiVariantHint: 'scale',
    scale: { min: range.min, max: range.max, step: 1, low_label: 'Mild', high_label: 'Severe' },
  };
};

const normalizeResponseOptions = (
  raw: Partial<ResponseOptions>,
  question: string
): ResponseOptions => {
  let mode: ResponseOptions['mode'] =
    raw.mode === 'multiple' || raw.mode === 'freeform' || raw.mode === 'confirm'
      ? raw.mode
      : 'single';

  const maxOptions = mode === 'multiple' ? 8 : 10;
  let options = sanitizeOptions(raw.options || []).slice(0, maxOptions);
  let hintedVariant = raw.ui_variant;

  if (shouldUseFunctionalScale(question, options)) {
    options = FUNCTIONAL_SCALE_OPTIONS;
  }

  const scaleAdjusted = forceNumericScaleIfNeeded(question, mode, options, hintedVariant);
  const forcedScale: ResponseOptions['scale'] | undefined = scaleAdjusted.scale;
  mode = scaleAdjusted.mode;
  options = scaleAdjusted.options;
  hintedVariant = scaleAdjusted.uiVariantHint;

  if (options.length === 0) {
    options = [
      { id: 'yes', text: 'Yes', category: 'confirmation' },
      { id: 'no', text: 'No', category: 'confirmation' },
      { id: 'unsure', text: 'Not sure', category: 'confirmation' },
    ];
  }

  const uiVariant = inferVariant(mode, options, hintedVariant);

  const sanitizeContextHint = (hint: string | undefined): string => {
    const cleaned = (hint || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return isDirectYesNoQuestion(question) ? 'Yes or No.' : 'Select response.';
    if (
      cleaned.length > 64 ||
      /(helps|distinguish|because|important|used to|clinical|diagnos)/i.test(cleaned)
    ) {
      return isDirectYesNoQuestion(question) ? 'Yes or No.' : 'Select response.';
    }
    return cleaned;
  };

  return {
    mode,
    options,
    ui_variant: uiVariant,
    scale:
      uiVariant === 'scale'
        ? forcedScale || {
            min: 1,
            max: options.length,
            step: 1,
            low_label: 'Low',
            high_label: 'High',
          }
        : undefined,
    context_hint: sanitizeContextHint(raw.context_hint),
    allow_custom_input: raw.allow_custom_input ?? true,
  };
};

export const generateResponseOptions = async (
  lastQuestion: string,
  agentState: ClinicalState['agent_state'],
  currentSOAP: ClinicalState['soap']
): Promise<ResponseOptions> => {
  const optionsCacheKey = [
    'options',
    lastQuestion.trim().toLowerCase(),
    agentState.phase,
    agentState.focus_area,
    JSON.stringify(currentSOAP?.S || {}),
    JSON.stringify(currentSOAP?.A || {}),
  ].join('::');

  const cached = getPromptCache<ResponseOptions>(optionsCacheKey);
  if (cached) {
    return normalizeResponseOptions(cached, lastQuestion);
  }

  recordPromptUsage('options', optionsCacheKey);

  try {
    const response = await fetch('/api/options', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lastQuestion,
        agentState,
        currentSOAP,
      })
    });

    if (!response.ok) {
      const rawError = await response.text().catch(() => '');
      let parsedError = '';
      if (rawError) {
        try {
          const json = JSON.parse(rawError) as { error?: string };
          parsedError = json.error || '';
        } catch {
          parsedError = rawError.trim();
        }
      }
      throw new Error(`Options API Error: ${parsedError || response.status}`);
    }

    const optionsResponse = await response.json();
    const normalized = normalizeResponseOptions(optionsResponse, lastQuestion);
    setPromptCache(optionsCacheKey, normalized, OPTIONS_CACHE_TTL_MS);
    return normalized;

  } catch (error) {
    console.error('Options Engine Error:', error);
    throw error instanceof Error ? error : new Error('Options generation failed.');
  }
};
