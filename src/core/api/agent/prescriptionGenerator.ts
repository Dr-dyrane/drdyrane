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

// System prompt and parsing logic moved to server-side (api/_aiOrchestrator.ts)
// This client-side module now only handles API communication

export const generatePrescriptionsWithLLM = async (
  request: PrescriptionRequest
): Promise<PrescriptionResponse> => {
  try {
    const response = await fetch('/api/generate-prescription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagnosis: request.diagnosis,
        icd10: request.icd10,
        age: request.age,
        weight_kg: request.weight_kg,
        sex: request.sex,
        pregnancy: request.pregnancy,
        urgency: request.urgency,
        soap: request.soap,
      }),
    });

    if (!response.ok) {
      throw new Error(`Prescription generation failed: ${response.status}`);
    }

    const data = await response.json();
    return data as PrescriptionResponse;
  } catch (error) {
    console.error('[Prescription Generator] Error:', error);
    return {
      prescriptions: [],
      rationale: error instanceof Error ? error.message : 'Unable to generate prescriptions',
    };
  }
};

