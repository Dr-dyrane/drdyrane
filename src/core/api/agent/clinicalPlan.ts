import { ClinicalState, PillarData } from '../../types/clinical';

interface ClinicalPlanInput {
  ddx: string[];
  soap: ClinicalState['soap'];
  urgency: ClinicalState['urgency'];
  profile: ClinicalState['profile'];
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

const hasMalariaSignal = (diagnosis: string): boolean => /\bmalaria\b/i.test(diagnosis);

const buildMalariaPlan = (
  diagnosis: string,
  urgency: ClinicalState['urgency']
): PillarData => {
  const severityLine =
    urgency === 'high' || urgency === 'critical'
      ? 'Escalate immediately for severe-malaria assessment and monitored care.'
      : 'Current pattern suggests uncomplicated malaria pending confirmation.';

  return {
    diagnosis: `${diagnosis}\nPattern: fever + systemic symptoms in endemic context.`,
    management: [
      severityLine,
      'Investigations: malaria RDT and/or thick-thin blood film, FBC, U&E/creatinine, LFT, blood glucose.',
      'Prescription pathway (clinician-confirmed): artemisinin-based combination therapy per local protocol, antipyretic (e.g. paracetamol), and oral rehydration.',
      'Pharmacy counseling: complete full antimalarial course, take doses with food when applicable, avoid self-mixing antimalarials.',
      'Review: reassess in 24-48h or sooner if worsening.',
    ].join('\n'),
    prognosis:
      'With early confirmed treatment, response is usually favorable. Risk rises with delayed treatment, dehydration, or severe features.',
    prevention:
      'Use insecticide-treated nets, reduce mosquito exposure, seek testing early for recurrent fever, and maintain hydration.',
  };
};

const buildGenericPlan = (diagnosis: string): PillarData => ({
  diagnosis: diagnosis,
  management: [
    'Investigations: focused labs guided by top differential and red flags.',
    'Prescription pathway: start treatment only after clinician confirmation of most likely diagnosis.',
    'Pharmacy counseling: explain dose schedule, side effects, interactions, and strict return precautions.',
    'Follow-up: short interval review to confirm clinical response.',
  ].join('\n'),
  prognosis: 'Prognosis depends on confirmation and early targeted treatment.',
  prevention: 'Preventive advice should match confirmed diagnosis and patient risk profile.',
});

const buildProfileLine = (profile: ClinicalState['profile']): string => {
  const bits: string[] = [];
  if (profile.age) bits.push(`${profile.age}y`);
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
    ? buildMalariaPlan(diagnosis, input.urgency)
    : buildGenericPlan(diagnosis);
  const withSoap = injectSoapSummary(basePlan, input.soap);
  const profileLine = buildProfileLine(input.profile);
  if (!profileLine) return withSoap;
  return {
    ...withSoap,
    diagnosis: `${withSoap.diagnosis}\n${profileLine}`,
  };
};
