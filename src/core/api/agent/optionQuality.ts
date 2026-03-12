import { ResponseOptions } from '../../types/clinical';

const BINARY_SET = new Set(['yes', 'no', 'not sure', 'unsure', 'unknown']);
const TRAJECTORY_PATTERN =
  /(much worse|slightly worse|no change|slightly better|much better|improving|worsening)/i;
const TEMPERATURE_PATTERN = /(temperature|temp|degrees|highest|c|f|fever reading)/i;
const LATERALITY_PATTERN = /(left|right|both|one side|either side|same side)/i;
const TRIGGER_PATTERN = /(deep breath|breath|cough|movement|touch|when i)/i;
const EPISODE_PATTERN = /(\d|none|0|1-2|3-5|6-9|10\+|episodes|times)/i;

const isBinaryLike = (texts: string[]): boolean =>
  texts.length > 0 && texts.length <= 3 && texts.every((text) => BINARY_SET.has(text));

const toTexts = (options: ResponseOptions): string[] =>
  options.options.map((option) => option.text.toLowerCase().trim()).filter(Boolean);

export const isOptionSetRelevant = (question: string, options: ResponseOptions): boolean => {
  const q = question.toLowerCase();
  const texts = toTexts(options);
  if (texts.length === 0) return false;

  const binaryLike = isBinaryLike(texts);
  const trajectoryCount = texts.filter((text) => TRAJECTORY_PATTERN.test(text)).length;

  if (/(what other symptoms|which symptoms|other symptoms|along with|associated symptoms)/i.test(q)) {
    return options.mode === 'multiple' || texts.length >= 4;
  }

  if (/(one side|both sides|which side|left or right|side)/i.test(q)) {
    return texts.some((text) => LATERALITY_PATTERN.test(text));
  }

  if (/(deep breath|breathe deeply|worse when.*cough|pain.*cough|pleuritic|does it worsen when)/i.test(q)) {
    const hasTriggerSpecific = texts.some((text) => TRIGGER_PATTERN.test(text));
    return (binaryLike || hasTriggerSpecific) && trajectoryCount < 2;
  }

  if (/(how have.*changed|overall.*change|since.*started.*better|since.*started.*worse|improving or worsening|changed since)/i.test(q)) {
    return trajectoryCount >= 2;
  }

  if (TEMPERATURE_PATTERN.test(q)) {
    return texts.some((text) => TEMPERATURE_PATTERN.test(text));
  }

  if (/(how many|number of|episodes|times|count|frequency)/i.test(q)) {
    return texts.some((text) => EPISODE_PATTERN.test(text));
  }

  if (binaryLike && /(what|which|describe|how many|when|where|severity|rate)/i.test(q)) {
    return false;
  }

  if (trajectoryCount >= 3 && !/(changed|improv|worse|better|progress)/i.test(q)) {
    return false;
  }

  return true;
};
