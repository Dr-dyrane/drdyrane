import { ConsultPayload, ChiefComplaintEngineId, ChiefComplaintEngine, EngineContractDefaults } from './types';
import { sanitizeText } from './utils';

export const URGENCY_RANK: Record<NonNullable<ConsultPayload['urgency']>, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const STATUS_RANK: Record<NonNullable<ConsultPayload['status']>, number> = {
  idle: 0,
  intake: 1,
  active: 2,
  lens: 3,
  complete: 4,
  emergency: 5,
};

export type Icd10Rule = {
  pattern: RegExp;
  code: string;
};

export const ICD10_RULES: Icd10Rule[] = [
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

export const CHIEF_COMPLAINT_ENGINES: ChiefComplaintEngine[] = [
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

export const ENGINE_CONTRACT_DEFAULTS: Record<ChiefComplaintEngineId, EngineContractDefaults> = {
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
      'For chronic itching with lichenification: Consider lichen simplex chronicus (L28.0) - itch-scratch cycle.',
      'Escalate urgently for systemic instability or mucosal involvement.',
    ],
    investigations: [
      'Full skin and mucosal examination',
      'CBC and inflammatory markers when systemic signs exist',
      'For chronic itch: Assess for lichenification, post-inflammatory hyperpigmentation, excoriation marks',
    ],
    counseling: [
      'Avoid new topical or oral triggers until reviewed.',
      'For chronic itch: Break itch-scratch cycle with topical steroids and antihistamines.',
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

export const ENGINE_FALLBACK_DIFFERENTIALS: Record<ChiefComplaintEngineId, string[]> = {
  fever: ['Malaria', 'Viral infection', 'Typhoid fever', 'Sepsis'],
  chest_pain: ['Acute coronary syndrome', 'Pulmonary embolism', 'Aortic dissection', 'Musculoskeletal chest pain'],
  shortness_of_breath: ['Pulmonary embolism', 'Acute heart failure', 'Pneumonia', 'Asthma exacerbation'],
  headache: ['Migraine', 'Meningitis', 'Subarachnoid hemorrhage', 'Tension headache'],
  abdominal_pain: ['Appendicitis', 'Gastroenteritis', 'Pancreatitis', 'Peritonitis'],
  vomiting_nausea: ['Acute gastroenteritis', 'Dehydration', 'Medication reaction', 'Metabolic disturbance'],
  diarrhea: ['Acute gastroenteritis', 'Food-borne illness', 'Inflammatory bowel process', 'GI bleeding'],
  rash: [
    'Lichen simplex chronicus (L28.0)',
    'Allergic dermatitis',
    'Viral exanthem',
    'Drug reaction',
    'Invasive infection',
  ],
  joint_pain: ['Rheumatoid arthritis flare', 'Septic arthritis', 'Gout flare', 'Reactive arthritis'],
  weakness_fatigue: ['Anemia', 'Viral illness', 'Endocrine disturbance', 'Stroke'],
  bleeding: ['Hemorrhoidal bleeding', 'Upper GI bleeding', 'Coagulopathy', 'Major hemorrhage'],
  altered_mental_status: ['Delirium', 'Stroke', 'Sepsis-associated encephalopathy', 'Drug toxicity'],
  general: ['Undifferentiated illness', 'Systemic infection', 'Metabolic disturbance'],
};

export const ICD10_CAPTURE_PATTERN = /\(ICD-10:\s*([A-Z0-9.-]+)\)/i;

export const classifyChiefComplaint = (corpus: string): {
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

export const detectEmergencyInDifferential = (ddx: string[], corpus: string): boolean => {
  const emergencyPatterns = [
    /meningitis/i,
    /sepsis/i,
    /acute coronary syndrome|acs|myocardial infarction|heart attack/i,
    /pulmonary embol/i,
    /aortic dissection/i,
    /stroke|cerebrovascular accident/i,
    /subarachnoid hemorrhage|sah/i,
    /appendicitis/i,
    /peritonitis/i,
    /ectopic pregnancy/i,
  ];

  const hasEmergencyDx = ddx.some((diagnosis) =>
    emergencyPatterns.some((pattern) => pattern.test(diagnosis))
  );

  const emergencyRedFlags = [
    /neck stiffness.*fever|fever.*neck stiffness/i,
    /confusion.*fever|fever.*confusion/i,
    /crushing chest pain|chest pain.*radiation/i,
    /worst headache.*life|thunderclap headache/i,
    /one.*sided weakness|facial droop|speech difficulty/i,
    /severe.*abdominal pain.*rigid/i,
  ];

  const hasRedFlag = emergencyRedFlags.some((pattern) => pattern.test(corpus));

  return hasEmergencyDx || hasRedFlag;
};
