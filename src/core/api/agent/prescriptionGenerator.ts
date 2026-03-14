import { SOAPState } from '../../types/clinical';

interface PrescriptionRequest {
  diagnosis: string;
  icd10?: string;
  age?: number;
  weight_kg?: number;
  sex?: string;
  pregnancy?: boolean;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  soap: SOAPState;
}

interface RawPrescriptionLine {
  medication: string;
  form: string;
  dose_per_kg?: number | null;
  max_dose?: number | null;
  unit: string;
  frequency: string;
  duration: string;
  note?: string;
}

interface PrescriptionResponse {
  prescriptions: RawPrescriptionLine[];
  rationale: string;
}

const PRESCRIPTION_GENERATION_SYSTEM_PROMPT = `You are a clinical pharmacology expert generating evidence-based prescriptions.

RULES:
1. Use WHO/UpToDate/BNF guideline-concordant medications
2. Provide weight-based dosing when appropriate (dose_per_kg in mg/kg)
3. Include formulation (Tab/Syrup/IM/IV/Cream), dose, frequency, duration
4. Consider patient age (pediatric vs adult formulations)
5. Adjust for urgency (mild/moderate/severe presentations)
6. Include symptomatic relief + definitive treatment
7. Maximum 8 prescription lines
8. Return strict JSON format

OUTPUT FORMAT:
{
  "prescriptions": [
    {
      "medication": "Paracetamol",
      "form": "Tab",
      "dose_per_kg": 15,
      "max_dose": 1000,
      "unit": "mg",
      "frequency": "tds",
      "duration": "5/7",
      "note": "For fever control"
    }
  ],
  "rationale": "Brief clinical reasoning"
}

EXAMPLES:

Lichen Simplex Chronicus (L28.0):
{
  "prescriptions": [
    {"medication": "Betamethasone 0.1%", "form": "Cream", "dose_per_kg": null, "max_dose": null, "unit": "application", "frequency": "bd", "duration": "14/7", "note": "Potent topical corticosteroid"},
    {"medication": "Cetirizine", "form": "Tab", "dose_per_kg": 0.2, "max_dose": 10, "unit": "mg", "frequency": "od (at night)", "duration": "14/7", "note": "Antihistamine for pruritus"}
  ],
  "rationale": "Break itch-scratch cycle with potent topical steroid + antihistamine"
}

Malaria (B54):
{
  "prescriptions": [
    {"medication": "ACT (Artemether-Lumefantrine)", "form": "Tab", "dose_per_kg": null, "max_dose": 480, "unit": "mg", "frequency": "bd", "duration": "3/7", "note": "Weight-band dosing: <15kg=120mg, 15-25kg=240mg, 25-35kg=360mg, >35kg=480mg"},
    {"medication": "Paracetamol", "form": "Tab", "dose_per_kg": 15, "max_dose": 1000, "unit": "mg", "frequency": "tds", "duration": "3/7", "note": "Antipyretic"}
  ],
  "rationale": "First-line ACT for uncomplicated malaria + symptomatic fever control"
}

Generate prescriptions now. Return ONLY valid JSON.`;

const sanitizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 500);
};

const sanitizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return null;
};

const sanitizePrescriptionLine = (raw: unknown): RawPrescriptionLine | null => {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  
  const medication = sanitizeText(obj.medication);
  const form = sanitizeText(obj.form);
  const unit = sanitizeText(obj.unit);
  const frequency = sanitizeText(obj.frequency);
  const duration = sanitizeText(obj.duration);
  
  if (!medication || !form || !unit || !frequency || !duration) return null;
  
  return {
    medication,
    form,
    dose_per_kg: sanitizeNumber(obj.dose_per_kg),
    max_dose: sanitizeNumber(obj.max_dose),
    unit,
    frequency,
    duration,
    note: sanitizeText(obj.note) || undefined,
  };
};

const parsePrescriptionResponse = (raw: string): PrescriptionResponse => {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const prescriptionsRaw = Array.isArray(parsed.prescriptions) ? parsed.prescriptions : [];
    const prescriptions = prescriptionsRaw
      .map(sanitizePrescriptionLine)
      .filter((line): line is RawPrescriptionLine => line !== null)
      .slice(0, 8);
    
    return {
      prescriptions,
      rationale: sanitizeText(parsed.rationale) || 'Evidence-based prescription generated',
    };
  } catch (error) {
    console.error('Failed to parse prescription response:', error);
    return {
      prescriptions: [],
      rationale: 'Unable to generate prescriptions',
    };
  }
};

const buildSoapSummary = (soap: SOAPState): string => {
  const subjective = soap.S && Object.keys(soap.S).length > 0 ? JSON.stringify(soap.S) : '';
  return subjective || 'No specific clinical features documented';
};

export const generatePrescriptionsWithLLM = async (
  request: PrescriptionRequest
): Promise<PrescriptionResponse> => {
  // TODO: Implement LLM call
  // For now, return empty prescriptions to maintain structure
  // This will be implemented in the next step
  
  console.log('[Prescription Generator] Request:', {
    diagnosis: request.diagnosis,
    icd10: request.icd10,
    age: request.age,
    weight_kg: request.weight_kg,
  });
  
  return {
    prescriptions: [],
    rationale: 'LLM prescription generation not yet implemented',
  };
};

