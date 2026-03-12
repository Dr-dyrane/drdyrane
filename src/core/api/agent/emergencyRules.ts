const HARD_TRIGGERS = [
  'cannot breathe',
  "can't breathe",
  'unconscious',
  'loss of consciousness',
  'torrential bleeding',
  'severe allergic reaction',
  'anaphylaxis',
  'stroke symptoms',
  'heart attack',
  'fainted and not waking',
  'seizure now',
  'seizures now',
  'coughing blood',
  'vomiting blood',
  'passed out',
];

const CHEST_PAIN_PATTERN = /(chest pain|chest pressure|chest tightness|crushing chest pain)/;
const CHEST_DANGER_PATTERN =
  /(crushing|severe|radiating|left arm|jaw pain|shortness of breath|cold sweat|collapse|passing out|fainting)/;

const BREATHING_PATTERN =
  /(difficulty breathing|shortness of breath|breathless|can't breathe|cannot breathe|respiratory distress)/;
const BREATHING_DANGER_PATTERN =
  /(at rest|blue lips|wheezing badly|unable to speak|gasping|severe|stridor)/;

const NEURO_DANGER_PATTERN =
  /(confusion|disoriented|new one[-\s]?sided weakness|facial droop|slurred speech|cannot speak|seizure|fits|fainting|passed out)/;

const BLEEDING_DANGER_PATTERN =
  /(uncontrolled bleeding|bleeding heavily|vomiting blood|blood in vomit|coughing blood|black stool with weakness)/;

const SHOCK_DANGER_PATTERN =
  /(cold clammy|very weak|unable to stand|severe dehydration|not passing urine|shock)/;

const GI_DANGER_PATTERN =
  /(persistent vomiting|cannot keep fluids down|unable to drink|repeated vomiting with weakness)/;

export const isEmergencyInput = (input: string): boolean => {
  const normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();

  if (HARD_TRIGGERS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  const hasCriticalChestPattern =
    CHEST_PAIN_PATTERN.test(normalized) && CHEST_DANGER_PATTERN.test(normalized);
  const hasCriticalBreathingPattern =
    BREATHING_PATTERN.test(normalized) && BREATHING_DANGER_PATTERN.test(normalized);
  const hasNeurologicRedFlag = NEURO_DANGER_PATTERN.test(normalized);
  const hasBleedingRedFlag = BLEEDING_DANGER_PATTERN.test(normalized);
  const hasShockSignal = SHOCK_DANGER_PATTERN.test(normalized);
  const hasGiCriticalSignal = GI_DANGER_PATTERN.test(normalized);

  return (
    hasCriticalChestPattern ||
    hasCriticalBreathingPattern ||
    hasNeurologicRedFlag ||
    hasBleedingRedFlag ||
    hasShockSignal ||
    hasGiCriticalSignal
  );
};
