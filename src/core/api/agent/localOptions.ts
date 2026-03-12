import { ClinicalState, ResponseOptions } from '../../types/clinical';
import {
  buildNumericScaleOptions,
  isScaleIntentQuestion,
  parseScaleRange,
} from './scaleIntent';

const STRUCTURED_QUESTION_PATTERNS: RegExp[] = [
  /(when did|since when|how long|when .* start|started|start)/,
  /(highest.*(temperature|temp)|temperature|temp|how high|measured|reading|degrees|thermometer)/,
  /(how many|number of|count|frequency|times?\s+(?:in|per|over|within)|episodes?\s+(?:in|per|over|within))/,
  /(which symptom cluster|symptom cluster|within .* pattern|which cluster stands out)/,
  /(what other symptoms|other symptoms|which symptoms|what symptoms|associated symptoms|along with)/,
  /(danger signs?|breathlessness|confusion|persistent vomiting|bleeding|chest pain)/,
  /(what other detail should i clarify before i summarize|ready for summary|working diagnosis and plan)/,
  /(one side|both sides|which side|left side|right side|left or right|right or left|unilateral|bilateral)/,
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
  return /^(is|are|do|did|have|has|can|could|will|would|should|any)\b/.test(normalized);
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
  const countPattern =
    /(how many|number of|count|frequency|times?\s+(?:in|per|over|within)|episodes?\s+(?:in|per|over|within))/;
  const gastroPattern = /(vomit|vomiting|throwing up|nausea|diarrhea|diarrhoea|loose stool|stool|bowel)/;
  const hydrationPattern =
    /(keep fluids down|keep liquid down|hold down fluids|able to drink|drinking fluids|hydration|dehydrat|oral intake|sips)/;
  const symptomInventoryPattern =
    /(what other symptoms|other symptoms|which symptoms|what symptoms|associated symptoms|along with)/;
  const associatedMostPattern =
    /(which|what).*(associated symptom|symptom).*(stand out|most|prominent)|most prominent associated symptom/;
  const respiratoryContextPattern =
    /\bcough|chest pain|breath|shortness of breath|sputum|phlegm|wheez/;
  const feverContextPattern = /\bfever|chills?|rigors?|sweat|night\b/;
  const painContextPattern = /\bpain|ache|chest\b/;
  const symptomClusterPattern =
    /(which symptom cluster|symptom cluster|which cluster stands out|cluster stands out)/;
  const feverDetailPattern = /(within fever pattern|fever pattern.*stand out|fever cluster)/;
  const headPainDetailPattern = /(within head\/pain pattern|head\/pain pattern.*stand out|head pain cluster)/;
  const airwayDetailPattern = /(within airway\/throat pattern|airway\/throat pattern.*stand out|airway cluster)/;
  const gutDetailPattern = /(within stomach\/gut pattern|stomach\/gut pattern.*stand out|gut cluster)/;
  const generalDetailPattern = /(within energy\/general pattern|energy\/general pattern.*stand out|general cluster)/;
  const lateralityPattern =
    /(one side|both sides|which side|left side|right side|left or right|right or left|unilateral|bilateral|\bside\b)/;
  const triggerPattern =
    /(worse when|worsen when|deep breath|breathe deeply|cough|movement|touch|pain on breathing|pleuritic)/;
  const dangerSignsPattern =
    /(danger signs?|breathlessness|confusion|persistent vomiting|bleeding|chest pain)/;
  const summaryClarifyPattern =
    /(what other detail should i clarify before i summarize|ready for summary|working diagnosis and plan)/;
  const yesNoPattern = isDirectYesNoQuestion(normalized);

  if (symptomClusterPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'cluster-fever-pattern', text: 'Fever pattern', category: 'symptom_cluster', priority: 10 },
        { id: 'cluster-head-pain', text: 'Head or pain', category: 'symptom_cluster', priority: 9 },
        { id: 'cluster-airway-throat', text: 'Airway or throat', category: 'symptom_cluster', priority: 8 },
        { id: 'cluster-stomach-gut', text: 'Stomach or gut', category: 'symptom_cluster', priority: 7 },
        { id: 'cluster-energy-general', text: 'Energy or general', category: 'symptom_cluster', priority: 6 },
        { id: 'cluster-none', text: 'None fits', category: 'symptom_cluster', priority: 5 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose one symptom cluster first.',
    };
  }

  if (feverDetailPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'fever-evening-chills', text: 'Evening chills', category: 'fever_detail', priority: 10 },
        { id: 'fever-night-spike', text: 'Night fever spike', category: 'fever_detail', priority: 9 },
        { id: 'fever-morning-relief', text: 'Morning relief', category: 'fever_detail', priority: 8 },
        { id: 'fever-sweating', text: 'Sweating', category: 'fever_detail', priority: 7 },
        { id: 'fever-bitter-acid-taste', text: 'Bitter or acid taste', category: 'fever_detail', priority: 6 },
        { id: 'fever-none', text: 'None stand out', category: 'fever_detail', priority: 5 },
      ],
      allow_custom_input: true,
      context_hint: 'Pick the most prominent fever-pattern cue.',
    };
  }

  if (headPainDetailPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'headache', text: 'Headache', category: 'head_pain_detail', priority: 10 },
        { id: 'body-aches', text: 'Body aches', category: 'head_pain_detail', priority: 9 },
        { id: 'eye-pain', text: 'Pain behind eyes', category: 'head_pain_detail', priority: 8 },
        { id: 'joint-pain', text: 'Joint pain', category: 'head_pain_detail', priority: 7 },
        { id: 'none', text: 'None stand out', category: 'head_pain_detail', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose one standout symptom.',
    };
  }

  if (airwayDetailPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'sore-throat', text: 'Sore throat', category: 'airway_detail', priority: 10 },
        { id: 'cough', text: 'Cough', category: 'airway_detail', priority: 9 },
        { id: 'catarrh', text: 'Catarrh or runny nose', category: 'airway_detail', priority: 8 },
        { id: 'breathless', text: 'Breathlessness', category: 'airway_detail', priority: 7 },
        { id: 'none', text: 'None stand out', category: 'airway_detail', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose one standout symptom.',
    };
  }

  if (gutDetailPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'nausea', text: 'Nausea', category: 'gut_detail', priority: 10 },
        { id: 'vomiting', text: 'Vomiting', category: 'gut_detail', priority: 9 },
        { id: 'abdominal-pain', text: 'Abdominal pain', category: 'gut_detail', priority: 8 },
        { id: 'diarrhea', text: 'Diarrhea', category: 'gut_detail', priority: 7 },
        { id: 'loss-of-appetite', text: 'Loss of appetite', category: 'gut_detail', priority: 6 },
        { id: 'none', text: 'None stand out', category: 'gut_detail', priority: 5 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose one standout symptom.',
    };
  }

  if (generalDetailPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'stack',
      options: [
        { id: 'fatigue', text: 'Fatigue or malaise', category: 'general_detail', priority: 10 },
        { id: 'weakness', text: 'Weakness', category: 'general_detail', priority: 9 },
        { id: 'poor-appetite', text: 'Reduced appetite', category: 'general_detail', priority: 8 },
        { id: 'stress', text: 'Stress or poor sleep', category: 'general_detail', priority: 7 },
        { id: 'none', text: 'None stand out', category: 'general_detail', priority: 6 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose one standout symptom.',
    };
  }

  if (associatedMostPattern.test(normalized)) {
    if (respiratoryContextPattern.test(normalized)) {
      return {
        mode: 'single',
        ui_variant: 'grid',
        options: [
          { id: 'resp-short-breath', text: 'Shortness of breath', category: 'associated_symptom', priority: 10 },
          { id: 'resp-chest-pain', text: 'Chest pain', category: 'associated_symptom', priority: 9 },
          { id: 'resp-fever-chills', text: 'Fever or chills', category: 'associated_symptom', priority: 8 },
          { id: 'resp-sputum', text: 'Sputum or phlegm', category: 'associated_symptom', priority: 7 },
          { id: 'resp-fatigue', text: 'Fatigue', category: 'associated_symptom', priority: 6 },
          { id: 'resp-none', text: 'None stand out', category: 'associated_symptom', priority: 5 },
        ],
        allow_custom_input: true,
        context_hint: 'Pick one key associated symptom.',
      };
    }

    if (feverContextPattern.test(normalized)) {
      return {
        mode: 'single',
        ui_variant: 'grid',
        options: [
          { id: 'fever-chills', text: 'Chills or rigors', category: 'associated_symptom', priority: 10 },
          { id: 'fever-headache', text: 'Headache', category: 'associated_symptom', priority: 9 },
          { id: 'fever-body-aches', text: 'Body aches', category: 'associated_symptom', priority: 8 },
          { id: 'fever-sweating', text: 'Sweating', category: 'associated_symptom', priority: 7 },
          { id: 'fever-nausea', text: 'Nausea', category: 'associated_symptom', priority: 6 },
          { id: 'fever-none', text: 'None stand out', category: 'associated_symptom', priority: 5 },
        ],
        allow_custom_input: true,
        context_hint: 'Pick one key associated symptom.',
      };
    }

    if (painContextPattern.test(normalized)) {
      return {
        mode: 'single',
        ui_variant: 'grid',
        options: [
          { id: 'pain-breathlessness', text: 'Breathlessness', category: 'associated_symptom', priority: 10 },
          { id: 'pain-nausea', text: 'Nausea', category: 'associated_symptom', priority: 9 },
          { id: 'pain-dizziness', text: 'Dizziness', category: 'associated_symptom', priority: 8 },
          { id: 'pain-sweating', text: 'Sweating', category: 'associated_symptom', priority: 7 },
          { id: 'pain-palpitations', text: 'Palpitations', category: 'associated_symptom', priority: 6 },
          { id: 'pain-none', text: 'None stand out', category: 'associated_symptom', priority: 5 },
        ],
        allow_custom_input: true,
        context_hint: 'Pick one key associated symptom.',
      };
    }

    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'assoc-pain', text: 'Pain', category: 'associated_symptom', priority: 10 },
        { id: 'assoc-breathing', text: 'Breathing issues', category: 'associated_symptom', priority: 9 },
        { id: 'assoc-fever', text: 'Fever or chills', category: 'associated_symptom', priority: 8 },
        { id: 'assoc-stomach', text: 'Stomach symptoms', category: 'associated_symptom', priority: 7 },
        { id: 'assoc-fatigue', text: 'Fatigue', category: 'associated_symptom', priority: 6 },
        { id: 'assoc-none', text: 'None stand out', category: 'associated_symptom', priority: 5 },
      ],
      allow_custom_input: true,
      context_hint: 'Pick one key associated symptom.',
    };
  }

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

  if (dangerSignsPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'danger-none', text: 'None of these', category: 'danger_sign', priority: 10 },
        { id: 'danger-breathlessness', text: 'Breathlessness', category: 'danger_sign', priority: 9 },
        { id: 'danger-confusion', text: 'Confusion', category: 'danger_sign', priority: 8 },
        { id: 'danger-chest-pain', text: 'Chest pain', category: 'danger_sign', priority: 7 },
        { id: 'danger-vomiting', text: 'Persistent vomiting', category: 'danger_sign', priority: 6 },
        { id: 'danger-bleeding', text: 'Bleeding', category: 'danger_sign', priority: 5 },
      ],
      allow_custom_input: true,
      context_hint: 'Select any danger sign, or choose none.',
    };
  }

  if (summaryClarifyPattern.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'segmented',
      options: [
        { id: 'summary-ready', text: 'Ready for summary', category: 'summary', priority: 10 },
        { id: 'summary-add-detail', text: 'Add one detail', category: 'summary', priority: 9 },
        { id: 'summary-not-sure', text: 'Not sure', category: 'summary', priority: 8 },
      ],
      allow_custom_input: true,
      context_hint: 'Choose to summarize now or add one last detail.',
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
