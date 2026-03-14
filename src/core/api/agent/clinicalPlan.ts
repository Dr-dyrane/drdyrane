import { ClinicalOutputContract, ClinicalState, PillarData } from '../../types/clinical';

interface ClinicalPlanInput {
  ddx: string[];
  soap: ClinicalState['soap'];
  urgency: ClinicalState['urgency'];
  profile: ClinicalState['profile'];
  contract?: ClinicalOutputContract;
}

type DoseFactor = number | 'ACTFactor' | 'ZincFactor' | 'ORSFactor';

interface DrugProtocolRow {
  name: string;
  form: string;
  factor: DoseFactor;
  max: number;
  unit: string;
  frequency: string;
  duration: string;
}

type WeightDoseMeta = NonNullable<
  NonNullable<PillarData['encounter']>['prescriptions'][number]['weight_based']
>;

interface MalariaProtocol {
  label: string;
  rows: DrugProtocolRow[];
}

const stripIcd = (value: string): string =>
  value.replace(/\s*\(ICD-10:\s*[A-Z0-9.]+\)\s*/gi, '').trim();

const ensureIcdLabel = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return '';
  if (/\(ICD-10:\s*[A-Z0-9.]+\)/i.test(normalized)) return normalized;
  if (/malaria/i.test(normalized)) return `${stripIcd(normalized)} (ICD-10: B54)`;
  if (/dengue/i.test(normalized)) return `${stripIcd(normalized)} (ICD-10: A97.9)`;
  if (/typhoid/i.test(normalized)) return `${stripIcd(normalized)} (ICD-10: A01.0)`;
  if (/viral/i.test(normalized)) return `${stripIcd(normalized)} (ICD-10: B34.9)`;
  return normalized;
};

const getTopDiagnosis = (ddx: string[]): string => {
  const first = ddx.find((entry) => entry && entry.trim().length > 0) || 'Undifferentiated febrile illness';
  return ensureIcdLabel(first);
};

const toLikelihoodLabel = (value: ClinicalOutputContract['differentials'][number]['likelihood']): string => {
  if (value === 'high') return 'High likelihood';
  if (value === 'low') return 'Low likelihood';
  return 'Medium likelihood';
};

const dedupeList = (items: string[], maxItems: number): string[] =>
  [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, maxItems);

const buildDifferentialDisplay = (
  ddx: string[],
  contract?: ClinicalOutputContract
): string[] => {
  const fromContract = (contract?.differentials || []).map((entry) => {
    const coded = entry.icd10 ? `${entry.label} (ICD-10: ${entry.icd10})` : entry.label;
    return `${coded} - ${toLikelihoodLabel(entry.likelihood)}`;
  });
  const fromDdx = ddx.map((entry) => ensureIcdLabel(entry));
  return dedupeList([...fromContract, ...fromDdx], 6);
};

const mergeContractIntoPlan = (
  plan: PillarData,
  ddx: string[],
  contract?: ClinicalOutputContract
): PillarData => {
  const leadDiagnosis = contract?.diagnosis
    ? `${contract.diagnosis.label} (ICD-10: ${contract.diagnosis.icd10})`
    : plan.diagnosis.split('\n')[0] || plan.diagnosis;
  const differentials = buildDifferentialDisplay(ddx, contract);
  const managementLines = contract?.management || [];
  const mergedInvestigations = dedupeList(
    [...(contract?.investigations || []), ...(plan.encounter?.investigations || [])],
    10
  );
  const mergedCounseling = dedupeList(
    [...(contract?.counseling || []), ...(plan.encounter?.counseling || [])],
    10
  );
  const redFlags = dedupeList(contract?.red_flags || [], 8);
  const mergedFollowUp = dedupeList(
    [
      ...(plan.encounter?.follow_up || []),
      ...redFlags.map((flag) => `Urgent escalation if ${flag.toLowerCase()}.`),
    ],
    10
  );

  const diagnosisBlock = [
    `Most likely diagnosis: ${ensureIcdLabel(leadDiagnosis)}`,
    differentials.length > 0
      ? `Differential diagnosis:\n${differentials.map((entry, index) => `${index + 1}. ${entry}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const managementBlock = managementLines.length > 0
    ? managementLines.map((entry, index) => `${index + 1}. ${entry}`).join('\n')
    : plan.management;

  return {
    ...plan,
    diagnosis: diagnosisBlock || plan.diagnosis,
    management: managementBlock,
    encounter: {
      source: plan.encounter?.source || 'Dr Dyrane contract synthesis',
      investigations: mergedInvestigations,
      prescriptions: plan.encounter?.prescriptions || [],
      counseling: mergedCounseling,
      follow_up: mergedFollowUp,
    },
  };
};

const hasMalariaSignal = (diagnosis: string): boolean => /\bmalaria\b/i.test(diagnosis);

const MALARIA_PROTOCOLS: {
  adult: Record<'mild' | 'mild_urti' | 'moderate' | 'moderate_urti' | 'moderate_ge', MalariaProtocol>;
  child: Record<'mild' | 'mild_urti' | 'moderate' | 'moderate_urti' | 'moderate_ge', MalariaProtocol>;
} = {
  adult: {
    mild: {
      label: 'Mild Malaria (Adult)',
      rows: [
        { name: 'ACT', form: 'Tab', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Tab', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
      ],
    },
    mild_urti: {
      label: 'Mild Malaria + URTI (Adult)',
      rows: [
        { name: 'ACT', form: 'Tab', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Tab', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
        { name: 'Loratidine', form: 'Tab', factor: 0.2, max: 10, unit: 'mg', frequency: 'od', duration: '5/7' },
        { name: 'Cefuroxime', form: 'Tab', factor: 15, max: 500, unit: 'mg', frequency: 'bd', duration: '5/7' },
      ],
    },
    moderate: {
      label: 'Moderate Malaria (Adult)',
      rows: [
        { name: 'Artemether', form: 'IM', factor: 3.2, max: 160, unit: 'mg', frequency: 'od', duration: '3/7 then oral step-down' },
        { name: 'ACT', form: 'Tab', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Tab', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
      ],
    },
    moderate_urti: {
      label: 'Moderate Malaria + URTI (Adult)',
      rows: [
        { name: 'Artemether', form: 'IM', factor: 3.2, max: 160, unit: 'mg', frequency: 'od', duration: '3/7 then oral step-down' },
        { name: 'ACT', form: 'Tab', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Tab', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
        { name: 'Loratidine', form: 'Tab', factor: 0.2, max: 10, unit: 'mg', frequency: 'od', duration: '5/7' },
        { name: 'Cefuroxime', form: 'Tab', factor: 15, max: 500, unit: 'mg', frequency: 'bd', duration: '5/7' },
      ],
    },
    moderate_ge: {
      label: 'Moderate Malaria + Gastroenteritis (Adult)',
      rows: [
        { name: 'Artemether', form: 'IM', factor: 3.2, max: 160, unit: 'mg', frequency: 'od', duration: '3/7 then oral step-down' },
        { name: 'ACT', form: 'Tab', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Tab', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
        { name: 'ORS', form: 'Syrup', factor: 'ORSFactor', max: 400, unit: 'mls', frequency: 'per loose stool', duration: '3/7' },
        { name: 'Zinc', form: 'Tab', factor: 'ZincFactor', max: 20, unit: 'mg', frequency: 'od', duration: '10/7' },
      ],
    },
  },
  child: {
    mild: {
      label: 'Mild Malaria (Child)',
      rows: [
        { name: 'ACT', form: 'Syrup', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Syrup', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
      ],
    },
    mild_urti: {
      label: 'Mild Malaria + URTI (Child)',
      rows: [
        { name: 'ACT', form: 'Syrup', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Syrup', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
        { name: 'Piriton', form: 'Syrup', factor: 0.1, max: 12, unit: 'mg', frequency: 'tds', duration: '5/7' },
      ],
    },
    moderate: {
      label: 'Moderate Malaria (Child)',
      rows: [
        { name: 'Artemether', form: 'IM', factor: 3.2, max: 160, unit: 'mg', frequency: 'od', duration: '3/7 then oral step-down' },
        { name: 'ACT', form: 'Syrup', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Syrup', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
      ],
    },
    moderate_urti: {
      label: 'Moderate Malaria + URTI (Child)',
      rows: [
        { name: 'Artemether', form: 'IM', factor: 3.2, max: 160, unit: 'mg', frequency: 'od', duration: '3/7 then oral step-down' },
        { name: 'ACT', form: 'Syrup', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Syrup', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
        { name: 'Piriton', form: 'Syrup', factor: 0.1, max: 12, unit: 'mg', frequency: 'tds', duration: '5/7' },
      ],
    },
    moderate_ge: {
      label: 'Moderate Malaria + Gastroenteritis (Child)',
      rows: [
        { name: 'Artemether', form: 'IM', factor: 3.2, max: 160, unit: 'mg', frequency: 'od', duration: '3/7 then oral step-down' },
        { name: 'ACT', form: 'Syrup', factor: 'ACTFactor', max: 480, unit: 'mg', frequency: 'bd', duration: '3/7' },
        { name: 'Paracetamol', form: 'Syrup', factor: 15, max: 1000, unit: 'mg', frequency: 'tds', duration: '3/7' },
        { name: 'ORS', form: 'Syrup', factor: 'ORSFactor', max: 400, unit: 'mls', frequency: 'per loose stool', duration: '3/7' },
        { name: 'Zinc', form: 'Syrup', factor: 'ZincFactor', max: 20, unit: 'mg', frequency: 'od', duration: '10/7' },
      ],
    },
  },
};

const getACTFactor = (weight: number): number => {
  if (weight >= 35) return 480;
  if (weight >= 25) return 360;
  if (weight >= 15) return 240;
  return 120;
};

const getZincFactor = (weight: number): number => (weight <= 7 ? 10 : 20);

const getORSFactor = (weight: number): number => {
  if (weight < 10) return 75;
  if (weight <= 28) return 150;
  return 300;
};

const estimateWeightKg = (profile: ClinicalState['profile']): number | null => {
  if (typeof profile.age !== 'number') return null;
  if (profile.age <= 0) return null;
  if (profile.age <= 12) return Math.max(8, Math.round(2 * profile.age + 8));
  return 60;
};

const getProfileWeightKg = (profile: ClinicalState['profile']): number | null => {
  if (typeof profile.weight_kg !== 'number') return null;
  if (Number.isNaN(profile.weight_kg)) return null;
  if (profile.weight_kg <= 0 || profile.weight_kg > 300) return null;
  return Math.round(profile.weight_kg * 10) / 10;
};

const sanitizeDuration = (duration: string): string => duration.trim().replace(/\s+/g, ' ');

const deriveDose = (
  factor: DoseFactor,
  maxDose: number,
  unit: string,
  weight: number | null,
  isChild: boolean
): string => {
  const suffix = unit ? ` ${unit}` : '';

  if (factor === 'ACTFactor') {
    if (weight !== null) return `${getACTFactor(weight)}${suffix}`;
    return isChild ? `Weight band dosing (up to ${maxDose}${suffix})` : `${maxDose}${suffix}`;
  }
  if (factor === 'ZincFactor') {
    if (weight !== null) return `${getZincFactor(weight)}${suffix}`;
    return isChild ? `Weight-based zinc (${maxDose}${suffix} max)` : `${maxDose}${suffix}`;
  }
  if (factor === 'ORSFactor') {
    if (weight !== null) return `${getORSFactor(weight)}${suffix}`;
    return isChild ? `Weight-based ORS volume (${maxDose}${suffix} max)` : `${maxDose}${suffix}`;
  }

  if (weight !== null) {
    return `${Math.round(Math.min(weight * factor, maxDose))}${suffix}`;
  }

  if (isChild) {
    return `Weight-based (${maxDose}${suffix} max)`;
  }

  return `${Math.round(maxDose)}${suffix}`;
};

const buildWeightDoseMeta = (factor: DoseFactor, maxDose: number, unit: string): WeightDoseMeta => {
  if (factor === 'ACTFactor') {
    return {
      mode: 'act_band',
      unit,
      max_dose: maxDose,
      fallback_dose: `Weight band dosing (up to ${maxDose} ${unit})`,
    };
  }
  if (factor === 'ZincFactor') {
    return {
      mode: 'zinc_band',
      unit,
      max_dose: maxDose,
      fallback_dose: `Weight-based zinc (${maxDose} ${unit} max)`,
    };
  }
  if (factor === 'ORSFactor') {
    return {
      mode: 'ors_band',
      unit,
      max_dose: maxDose,
      fallback_dose: `Weight-based ORS volume (${maxDose} ${unit} max)`,
    };
  }
  return {
    mode: 'per_kg',
    unit,
    factor,
    max_dose: maxDose,
    fallback_dose: `Weight-based (${maxDose} ${unit} max)`,
  };
};

const pickMalariaTrack = (
  urgency: ClinicalState['urgency'],
  soap: ClinicalState['soap'],
  profile: ClinicalState['profile']
): { protocol: MalariaProtocol; severityLabel: string } => {
  const clinicalCorpus = JSON.stringify(soap.S || {}).toLowerCase();
  const isChild = typeof profile.age === 'number' && profile.age < 13;
  const base = isChild ? MALARIA_PROTOCOLS.child : MALARIA_PROTOCOLS.adult;

  const hasRespiratoryOverlay = /cough|sore throat|catarrh|runny nose|nasal congestion/.test(clinicalCorpus);
  const hasGastroOverlay = /diarrh|abdominal pain|stomach pain|loose stool/.test(clinicalCorpus);
  const severeSignal =
    urgency === 'high' ||
    urgency === 'critical' ||
    /persistent vomiting|cannot keep fluids down|confusion|very weak|seizure/.test(clinicalCorpus);

  if (severeSignal) {
    if (hasGastroOverlay) return { protocol: base.moderate_ge, severityLabel: 'moderate/severe pattern' };
    if (hasRespiratoryOverlay) return { protocol: base.moderate_urti, severityLabel: 'moderate/severe pattern' };
    return { protocol: base.moderate, severityLabel: 'moderate/severe pattern' };
  }

  if (hasRespiratoryOverlay) return { protocol: base.mild_urti, severityLabel: 'uncomplicated pattern' };
  return { protocol: base.mild, severityLabel: 'uncomplicated pattern' };
};

const formatPrescriptionLine = (item: {
  medication: string;
  form: string;
  dose: string;
  frequency: string;
  duration: string;
}): string =>
  `${item.form} ${item.medication} ${item.dose}${item.frequency ? ` ${item.frequency}` : ''} ${item.duration}`.replace(
    /\s+/g,
    ' '
  );

const buildMalariaPlan = (
  diagnosis: string,
  urgency: ClinicalState['urgency'],
  soap: ClinicalState['soap'],
  profile: ClinicalState['profile']
): PillarData => {
  const { protocol, severityLabel } = pickMalariaTrack(urgency, soap, profile);
  const isChild = typeof profile.age === 'number' && profile.age < 13;
  const explicitWeight = getProfileWeightKg(profile);
  const dosingWeight = explicitWeight ?? estimateWeightKg(profile);
  const prescriptions = protocol.rows.map((row) => ({
    medication: row.name,
    form: row.form,
    dose: deriveDose(row.factor, row.max, row.unit, dosingWeight, isChild),
    frequency: row.frequency || 'as directed',
    duration: sanitizeDuration(row.duration),
    note:
      isChild && !explicitWeight && dosingWeight !== null
        ? `Dose currently uses age-estimated weight (${dosingWeight} kg). Enter actual weight before print/export.`
        : undefined,
    weight_based: buildWeightDoseMeta(row.factor, row.max, row.unit),
  }));
  const investigations = [
    'Confirm fever pattern: intermittent/nocturnal pattern with evening chills and morning relief.',
    'Confirm exposure: mosquito bites, net use, travel or high-mosquito environment.',
    'Malaria RDT and/or thick-thin blood film.',
    'FBC, electrolytes/creatinine, LFT, blood glucose.',
  ];
  const counseling = [
    'Complete full antimalarial course; do not stop early when symptoms improve.',
    'Take oral medications with adequate fluids and food when appropriate.',
    'Avoid self-mixing antimalarials or adding random antibiotics without indication.',
    'Return immediately for confusion, persistent vomiting, breathing difficulty, bleeding, or worsening weakness.',
  ];
  const followUp = [
    'Reassess in 24-48h with symptom trend and vital signs.',
    'Escalate to urgent care/hospital now if severe features emerge.',
  ];
  const managementSummary = [
    `Track: ${protocol.label} (${severityLabel})`,
    `Investigations: ${investigations.join(' ')}`,
    `Prescription: ${prescriptions.map(formatPrescriptionLine).join(' | ')}`,
    `Pharmacy counseling: ${counseling.join(' ')}`,
    `Follow-up: ${followUp.join(' ')}`,
  ].join('\n');

  return {
    diagnosis: `${diagnosis}\nClinical pattern is consistent with malaria and management pathway is activated.`,
    management: managementSummary,
    prognosis:
      'With early confirmed treatment, response is usually favorable. Risk rises with delayed treatment, dehydration, or severe features.',
    prevention:
      'Use insecticide-treated nets, reduce mosquito exposure, seek testing early for recurrent fever, and maintain hydration.',
    encounter: {
      source: 'Mapped from ../drug malaria protocol dataset (legacy formulary)',
      investigations,
      prescriptions,
      counseling,
      follow_up: followUp,
    },
  };
};

const buildGenericPlan = (diagnosis: string): PillarData => ({
  diagnosis: diagnosis,
  management: [
    '1. Start diagnosis-directed management for the lead condition.',
    '2. Run focused investigations now and trend response over 24-48 hours.',
    '3. Deliver full medication and counseling instructions with strict return precautions.',
    '4. Reassess early and refine treatment based on investigation results.',
  ].join('\n'),
  prognosis: 'Early targeted management improves outcome and lowers escalation risk.',
  prevention: 'Preventive strategy is aligned to diagnosis, exposures, and recurrence risk.',
  encounter: {
    investigations: [
      'Focused labs and bedside tests guided by highest-risk differentials.',
      'Baseline safety markers with repeat interval reassessment.',
    ],
    prescriptions: [],
    counseling: [
      'Follow medication instructions exactly and avoid unsupervised additions.',
      'Seek urgent review if any danger signs emerge or symptoms worsen.',
    ],
    follow_up: [
      'Short-interval review to confirm response and refine differential ranking.',
      'Escalate same-day if red-flag symptoms appear.',
    ],
  },
});

const buildProfileLine = (profile: ClinicalState['profile']): string => {
  const bits: string[] = [];
  if (profile.age) bits.push(`${profile.age}y`);
  if (profile.weight_kg) bits.push(`${profile.weight_kg}kg`);
  if (profile.sex) bits.push(profile.sex);
  return bits.length > 0 ? `Patient context: ${bits.join(', ')}` : '';
};

const injectSoapSummary = (plan: PillarData, soap: ClinicalState['soap']): PillarData => {
  const subjective = soap.S && Object.keys(soap.S).length > 0 ? JSON.stringify(soap.S) : '';
  if (!subjective) return plan;
  return {
    ...plan,
    diagnosis: `${plan.diagnosis}\nClinical cues: ${subjective}`,
  };
};

export const buildClinicalPlan = (input: ClinicalPlanInput): PillarData => {
  const diagnosis = getTopDiagnosis(input.ddx);
  const basePlan = hasMalariaSignal(diagnosis)
    ? buildMalariaPlan(diagnosis, input.urgency, input.soap, input.profile)
    : buildGenericPlan(diagnosis);
  const withContract = mergeContractIntoPlan(basePlan, input.ddx, input.contract);
  const withSoap = injectSoapSummary(withContract, input.soap);
  const profileLine = buildProfileLine(input.profile);
  if (!profileLine) return withSoap;
  return {
    ...withSoap,
    diagnosis: `${withSoap.diagnosis}\n${profileLine}`,
  };
};
