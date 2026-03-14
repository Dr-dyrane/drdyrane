import { ClinicalOutputContract, ClinicalState, PillarData } from '../../types/clinical';
import { generatePrescriptionsWithLLM } from './prescriptionGenerator';

interface ClinicalPlanInput {
  ddx: string[];
  soap: ClinicalState['soap'];
  urgency: ClinicalState['urgency'];
  profile: ClinicalState['profile'];
  contract?: ClinicalOutputContract;
}

type DoseFactor = number | 'ACTFactor' | 'ZincFactor' | 'ORSFactor';

type WeightDoseMeta = NonNullable<
  NonNullable<PillarData['encounter']>['prescriptions'][number]['weight_based']
>;

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

// Weight-based dosing utilities (preserved for ACT, Zinc, ORS special calculations)

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

// Removed hardcoded malaria-specific logic - now using universal LLM prescription generation

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

// Transform LLM prescription response into PillarData prescription format
const transformLLMPrescriptionsToPillarFormat = (
  llmPrescriptions: Array<{
    medication: string;
    form: string;
    dose_per_kg?: number | null;
    max_dose?: number | null;
    unit: string;
    frequency: string;
    duration: string;
    note?: string;
  }>,
  profile: ClinicalState['profile']
): NonNullable<PillarData['encounter']>['prescriptions'] => {
  const isChild = typeof profile.age === 'number' && profile.age < 13;
  const explicitWeight = getProfileWeightKg(profile);
  const dosingWeight = explicitWeight ?? estimateWeightKg(profile);

  return llmPrescriptions.map((rx) => {
    // Check if this is a special weight-band medication (ACT, Zinc, ORS)
    const isACT = /ACT|artemether.*lumefantrine/i.test(rx.medication);
    const isZinc = /zinc/i.test(rx.medication);
    const isORS = /ORS|oral.*rehydration/i.test(rx.medication);

    let dose: string;
    let weightMeta: WeightDoseMeta | undefined;

    if (isACT && rx.max_dose) {
      const factor: DoseFactor = 'ACTFactor';
      dose = deriveDose(factor, rx.max_dose, rx.unit, dosingWeight, isChild);
      weightMeta = buildWeightDoseMeta(factor, rx.max_dose, rx.unit);
    } else if (isZinc && rx.max_dose) {
      const factor: DoseFactor = 'ZincFactor';
      dose = deriveDose(factor, rx.max_dose, rx.unit, dosingWeight, isChild);
      weightMeta = buildWeightDoseMeta(factor, rx.max_dose, rx.unit);
    } else if (isORS && rx.max_dose) {
      const factor: DoseFactor = 'ORSFactor';
      dose = deriveDose(factor, rx.max_dose, rx.unit, dosingWeight, isChild);
      weightMeta = buildWeightDoseMeta(factor, rx.max_dose, rx.unit);
    } else if (rx.dose_per_kg && rx.max_dose && dosingWeight) {
      // Standard weight-based dosing
      const calculatedDose = Math.round(Math.min(dosingWeight * rx.dose_per_kg, rx.max_dose));
      dose = `${calculatedDose} ${rx.unit}`;
      weightMeta = buildWeightDoseMeta(rx.dose_per_kg, rx.max_dose, rx.unit);
    } else if (rx.max_dose) {
      // Fixed dose
      dose = `${rx.max_dose} ${rx.unit}`;
    } else {
      // Fallback
      dose = `as directed`;
    }

    const note =
      rx.note ||
      (isChild && !explicitWeight && dosingWeight
        ? `Dose currently uses age-estimated weight (${dosingWeight} kg). Enter actual weight before print/export.`
        : undefined);

    return {
      medication: rx.medication,
      form: rx.form,
      dose,
      frequency: rx.frequency,
      duration: sanitizeDuration(rx.duration),
      note,
      weight_based: weightMeta,
    };
  });
};

const extractIcd10 = (diagnosis: string): string | undefined => {
  const match = diagnosis.match(/\(ICD-10:\s*([A-Z0-9.]+)\)/i);
  return match ? match[1] : undefined;
};

export const buildClinicalPlan = async (input: ClinicalPlanInput): Promise<PillarData> => {
  const diagnosis = getTopDiagnosis(input.ddx);

  let basePlan: PillarData;

  try {
    // Call LLM to generate prescriptions for ANY diagnosis
    const prescriptionResponse = await generatePrescriptionsWithLLM({
      diagnosis,
      icd10: extractIcd10(diagnosis),
      age: input.profile.age,
      weight_kg: input.profile.weight_kg,
      sex: input.profile.sex,
      pregnancy: false, // TODO: Add pregnancy field to UserProfile if needed
      urgency: input.urgency,
      soap: input.soap,
    });

    const prescriptions = transformLLMPrescriptionsToPillarFormat(
      prescriptionResponse.prescriptions,
      input.profile
    );

    basePlan = {
      diagnosis,
      management: [
        '1. Start evidence-based management for the confirmed diagnosis.',
        '2. Run focused investigations and monitor clinical response over 24-48 hours.',
        '3. Deliver full medication and counseling instructions with strict return precautions.',
        '4. Reassess early and refine treatment based on investigation results.',
        prescriptionResponse.rationale ? `\nClinical rationale: ${prescriptionResponse.rationale}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      prognosis: 'Early targeted management improves outcome and lowers escalation risk.',
      prevention: 'Preventive strategy is aligned to diagnosis, exposures, and recurrence risk.',
      encounter: {
        source: 'LLM-generated evidence-based prescription (WHO/UpToDate/BNF guidelines)',
        investigations: [
          'Focused labs and bedside tests guided by highest-risk differentials.',
          'Baseline safety markers with repeat interval reassessment.',
        ],
        prescriptions,
        counseling: [
          'Follow medication instructions exactly and complete the full course.',
          'Seek urgent review if any danger signs emerge or symptoms worsen.',
          'Return immediately if new symptoms develop or condition deteriorates.',
        ],
        follow_up: [
          'Short-interval review to confirm response and refine differential ranking.',
          'Escalate same-day if red-flag symptoms appear.',
        ],
      },
    };
  } catch (error) {
    console.error('[buildClinicalPlan] LLM prescription generation failed:', error);
    // Fallback to empty prescriptions if LLM fails
    basePlan = {
      diagnosis,
      management: [
        '1. Start diagnosis-directed management for the lead condition.',
        '2. Run focused investigations now and trend response over 24-48 hours.',
        '3. Deliver full medication and counseling instructions with strict return precautions.',
        '4. Reassess early and refine treatment based on investigation results.',
      ].join('\n'),
      prognosis: 'Early targeted management improves outcome and lowers escalation risk.',
      prevention: 'Preventive strategy is aligned to diagnosis, exposures, and recurrence risk.',
      encounter: {
        source: 'Fallback plan (LLM prescription generation unavailable)',
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
    };
  }

  const withContract = mergeContractIntoPlan(basePlan, input.ddx, input.contract);
  const withSoap = injectSoapSummary(withContract, input.soap);
  const profileLine = buildProfileLine(input.profile);
  if (!profileLine) return withSoap;
  return {
    ...withSoap,
    diagnosis: `${withSoap.diagnosis}\n${profileLine}`,
  };
};
