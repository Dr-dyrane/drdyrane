const HARD_TRIGGERS = [
  'cannot breathe',
  'unconscious',
  'loss of consciousness',
  'torrential bleeding',
  'severe allergic reaction',
  'anaphylaxis',
  'stroke symptoms',
  'heart attack',
  'fainted and not waking',
];

const CHEST_PAIN_PATTERN = /(chest pain|chest pressure|chest tightness)/;
const CHEST_DANGER_PATTERN =
  /(crushing|severe|radiating|left arm|jaw pain|shortness of breath|cold sweat|passing out|fainting)/;

const BREATHING_PATTERN = /(difficulty breathing|shortness of breath|can't breathe)/;
const BREATHING_DANGER_PATTERN = /(at rest|blue lips|wheezing badly|unable to speak|severe)/;

export const isEmergencyInput = (input: string): boolean => {
  const normalized = input.toLowerCase();

  if (HARD_TRIGGERS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  const hasCriticalChestPattern =
    CHEST_PAIN_PATTERN.test(normalized) && CHEST_DANGER_PATTERN.test(normalized);
  const hasCriticalBreathingPattern =
    BREATHING_PATTERN.test(normalized) && BREATHING_DANGER_PATTERN.test(normalized);

  return hasCriticalChestPattern || hasCriticalBreathingPattern;
};
