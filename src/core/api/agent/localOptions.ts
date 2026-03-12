import { ClinicalState, ResponseOptions } from '../../types/clinical';
import {
  buildNumericScaleOptions,
  isScaleIntentQuestion,
  parseScaleRange,
} from './scaleIntent';

const STRUCTURED_QUESTION_PATTERNS: RegExp[] = [
  /(when did|since when|how long|when .* start|started|start)/,
  /(highest.*(temperature|temp)|temperature|temp|how high|measured|reading|degrees|thermometer)/,
  /(how many|number of|episodes?|times|count|frequency)/,
  /(what other symptoms|other symptoms|which symptoms|what symptoms|associated symptoms|along with)/,
  /(one side|both sides|which side|left|right|unilateral|bilateral)/,
  /(worse when|worsen when|deep breath|breathe deeply|cough|movement|touch|pain on breathing|pleuritic)/,
  /(how old|your age|age\?)/,
  /(how.*(changed|change|improv|wors)|overall.*(better|worse)|since.*started.*(better|worse|change)|progress(ion|ed)?\b|has .* (improved|worsened|changed))/,
];

export const isStructuredLocalQuestion = (question: string): boolean => {
  const normalized = (question || '').toLowerCase();
  if (!normalized) return false;
  if (isScaleIntentQuestion(normalized)) return true;
  if (isDirectYesNoQuestion(normalized)) return true;
  return STRUCTURED_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isDirectYesNoQuestion = (question: string): boolean => {
  const normalized = (question || '').toLowerCase().trim();
  if (!normalized) return false;
  if (/^(how many|how long|what|which|where|when|why)\b/.test(normalized)) return false;
  if (/(scale|rate|severity|intensity|score|\d+\s*(?:-|to)\s*\d+)/.test(normalized)) return false;
  return /^(is|are|do|did|have|has|can|could|will|would|should)\b/.test(normalized);
};

export const buildLocalOptions = (
  question: string,
  profile: ClinicalState['profile']
): ResponseOptions => {
  const normalized = question.toLowerCase();
  const knownAge = profile.age;
  const onsetPattern = /(when did|since when|how long|when .* start|started|start)/;
  const tempPattern =
    /(highest.*(temperature|temp)|temperature|temp|how high|measured|reading|degrees|thermometer)/;
  const countPattern = /(how many|number of|episodes?|times|count|frequency)/;
  const gastroPattern = /(vomit|vomiting|throwing up|nausea|diarrhea|diarrhoea|loose stool|stool|bowel)/;
  const hydrationPattern =
    /(keep fluids down|keep liquid down|hold down fluids|able to drink|drinking fluids|hydration|dehydrat|oral intake|sips)/;
  const symptomInventoryPattern =
    /(what other symptoms|other symptoms|which symptoms|what symptoms|associated symptoms|along with)/;
  const lateralityPattern = /(one side|both sides|which side|left|right|unilateral|bilateral)/;
  const triggerPattern =
    /(worse when|worsen when|deep breath|breathe deeply|cough|movement|touch|pain on breathing|pleuritic)/;
  const yesNoPattern = isDirectYesNoQuestion(normalized);

  if (symptomInventoryPattern.test(normalized)) {
    return {
      mode: 'multiple',
      ui_variant: 'chips',
      options: [
        { id: 'symptom-chills', text: 'Chills', category: 'associated_symptom', priority: 10 },
        { id: 'symptom-headache', text: 'Headache', category: 'associated_symptom', priority: 9 },
        { id: 'symptom-body-aches', text: 'Body aches', category: 'associated_symptom', priority: 8 },
        { id: 'symptom-fatigue', text: 'Fatigue', category: 'associated_symptom', priority: 7 },
        { id: 'symptom-nausea', text: 'Nausea', category: 'associated_symptom', priority: 6 },
        { id: 'symptom-vomiting', text: 'Vomiting', category: 'associated_symptom', priority: 5 },
        { id: 'symptom-diarrhea', text: 'Diarrhea', category: 'associated_symptom', priority: 4 },
        { id: 'symptom-cough', text: 'Cough', category: 'associated_symptom', priority: 3 },
      ],
      allow_custom_input: true,
      context_hint: 'Select all symptoms that apply, then continue.',
    };
  }

  if (onsetPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'onset-today', text: 'Started today', category: 'timeline', priority: 10 },
        { id: 'onset-1-2d', text: '1-2 days ago', category: 'timeline', priority: 9 },
        { id: 'onset-3-4d', text: '3-4 days ago', category: 'timeline', priority: 8 },
        { id: 'onset-5-7d', text: '5-7 days ago', category: 'timeline', priority: 7 },
        { id: 'onset-gt-7d', text: 'More than a week ago', category: 'timeline', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose when symptoms began.',
    };
  }

  if (tempPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'temp-37', text: '< 37.5 C (99.5 F)', category: 'temperature', priority: 10 },
        { id: 'temp-38', text: '37.5-38.0 C (99.5-100.4 F)', category: 'temperature', priority: 9 },
        { id: 'temp-39', text: '38.1-39.0 C (100.5-102.2 F)', category: 'temperature', priority: 8 },
        { id: 'temp-40', text: '39.1-40.0 C (102.3-104.0 F)', category: 'temperature', priority: 7 },
        { id: 'temp-40-plus', text: '> 40.0 C (> 104.0 F)', category: 'temperature', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Select your highest measured temperature.',
    };
  }

  if (lateralityPattern.test(normalized) && triggerPattern.test(normalized)) {
    return {
      mode: 'multiple',
      ui_variant: 'chips',
      options: [
        { id: 'pain-left', text: 'Left side', category: 'laterality', priority: 10 },
        { id: 'pain-right', text: 'Right side', category: 'laterality', priority: 9 },
        { id: 'pain-both', text: 'Both sides', category: 'laterality', priority: 8 },
        { id: 'pain-breath', text: 'Worse with deep breath', category: 'trigger', priority: 7 },
        { id: 'pain-cough', text: 'Worse with cough', category: 'trigger', priority: 6 },
        { id: 'pain-no-trigger', text: 'No breathing/cough change', category: 'trigger', priority: 5 },
      ],
      allow_custom_input: true,
      context_hint: 'Select side and what makes it worse.',
    };
  }

  if (lateralityPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'segmented',
      options: [
        { id: 'pain-left', text: 'Left', category: 'laterality', priority: 10 },
        { id: 'pain-right', text: 'Right', category: 'laterality', priority: 9 },
        { id: 'pain-both', text: 'Both', category: 'laterality', priority: 8 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose the pain side.',
    };
  }

  if (triggerPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'trigger-deep-breath', text: 'Worse with deep breath', category: 'trigger', priority: 10 },
        { id: 'trigger-cough', text: 'Worse with cough', category: 'trigger', priority: 9 },
        { id: 'trigger-both', text: 'Worse with both', category: 'trigger', priority: 8 },
        { id: 'trigger-neither', text: 'Not affected by either', category: 'trigger', priority: 7 },
      ],
      allow_custom_input: true,
      context_hint: 'Pick what triggers pain most.',
    };
  }

  if (gastroPattern.test(normalized) && countPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'ladder',
      options: [
        { id: 'episodes-0', text: '0 episodes', category: 'episode_count', priority: 10 },
        { id: 'episodes-1-2', text: '1-2 episodes', category: 'episode_count', priority: 9 },
        { id: 'episodes-3-5', text: '3-5 episodes', category: 'episode_count', priority: 8 },
        { id: 'episodes-6-9', text: '6-9 episodes', category: 'episode_count', priority: 7 },
        { id: 'episodes-10-plus', text: '10 or more', category: 'episode_count', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Estimate episodes in the last 24 hours.',
    };
  }

  if (hydrationPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'fluids-normal', text: 'Yes, drinking normally', category: 'hydration', priority: 10 },
        { id: 'fluids-sips', text: 'Only small sips stay down', category: 'hydration', priority: 9 },
        { id: 'fluids-vomit', text: 'Most fluids come back up', category: 'hydration', priority: 8 },
        { id: 'fluids-none', text: 'Cannot keep any fluids down', category: 'hydration', priority: 7 },
        { id: 'fluids-unsure', text: 'Not sure', category: 'hydration', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Select the closest match for oral intake.',
    };
  }

  if (countPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'count-0', text: '0', category: 'count', priority: 10 },
        { id: 'count-1-2', text: '1-2', category: 'count', priority: 9 },
        { id: 'count-3-5', text: '3-5', category: 'count', priority: 8 },
        { id: 'count-6-9', text: '6-9', category: 'count', priority: 7 },
        { id: 'count-10-plus', text: '10+', category: 'count', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose the nearest count range.',
    };
  }

  if (isScaleIntentQuestion(normalized)) {
    const range = parseScaleRange(normalized) || { min: 1, max: 10 };
    const options = buildNumericScaleOptions(range.min, range.max);
    return {
      mode: 'single',
      ui_variant: 'scale',
      options,
      scale: { min: range.min, max: range.max, step: 1, low_label: 'Mild', high_label: 'Severe' },
      allow_custom_input: true,
      context_hint: 'Select the closest severity level.',
    };
  }

  if (/(how old|your age|age\?)/.test(normalized)) {
    const options = Array.from({ length: 10 }, (_, idx) => {
      const lower = 10 + idx * 10;
      const upper = lower + 9;
      return {
        id: `age-${lower}-${upper}`,
        text: `${lower}-${upper}`,
        category: 'age_range',
        priority: 10 - idx,
      };
    });
    return {
      mode: 'single',
      ui_variant: 'grid',
      options,
      allow_custom_input: true,
      context_hint: knownAge
        ? `Profile has age ${knownAge}. Confirm or provide a better answer.`
        : 'Select age range or type exact age.',
    };
  }

  if (
    /(how.*(changed|change|improv|wors)|overall.*(better|worse)|since.*started.*(better|worse|change)|progress(ion|ed)?\b|has .* (improved|worsened|changed))/.test(
      normalized
    )
  ) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'much-worse', text: 'Much worse', category: 'trajectory', priority: 10 },
        { id: 'slightly-worse', text: 'Slightly worse', category: 'trajectory', priority: 9 },
        { id: 'no-change', text: 'No change', category: 'trajectory', priority: 8 },
        { id: 'slightly-better', text: 'Slightly better', category: 'trajectory', priority: 7 },
        { id: 'much-better', text: 'Much better', category: 'trajectory', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose how your symptoms have changed.',
    };
  }

  if (yesNoPattern || normalized.includes('yes or no')) {
    return {
      mode: 'single',
      ui_variant: 'segmented',
      options: [
        { id: 'yes', text: 'Yes', category: 'confirmation', priority: 10 },
        { id: 'no', text: 'No', category: 'confirmation', priority: 9 },
        { id: 'unsure', text: 'Not sure', category: 'confirmation', priority: 8 },
      ],
      allow_custom_input: true,
      context_hint: 'Yes or No.',
    };
  }

  return {
    mode: 'single',
    ui_variant: 'segmented',
    options: [
      { id: 'yes', text: 'Yes', category: 'default', priority: 10 },
      { id: 'no', text: 'No', category: 'default', priority: 9 },
      { id: 'unsure', text: 'Not sure', category: 'default', priority: 8 },
    ],
    allow_custom_input: true,
    context_hint: 'Choose a quick option or type details.',
  };
};
