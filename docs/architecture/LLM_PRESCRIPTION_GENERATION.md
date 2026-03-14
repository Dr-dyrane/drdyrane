# LLM-Driven Prescription Generation Architecture

**Date:** 2026-03-14  
**Status:** 🚧 Design Phase  
**Goal:** Replace hardcoded drug protocols with LLM-generated prescriptions for arbitrary diagnoses

---

## 🎯 **Problem Statement**

### **Current Architecture (Hardcoded):**

**File:** `src/core/api/agent/clinicalPlan.ts`

```typescript
export const buildClinicalPlan = (input: ClinicalPlanInput): PillarData => {
  const diagnosis = getTopDiagnosis(input.ddx);
  const basePlan = hasMalariaSignal(diagnosis)
    ? buildMalariaPlan(diagnosis, ...)  // ✅ Detailed prescriptions (ONLY for malaria)
    : buildGenericPlan(diagnosis);       // ❌ Empty prescriptions: []
  // ...
};
```

**Issues:**
- ❌ **Only malaria gets prescriptions** (~200 lines of hardcoded protocols)
- ❌ **All other diagnoses get empty `prescriptions: []`**
- ❌ **Doesn't scale to 70,000+ ICD-10 codes**
- ❌ **Inconsistent with LLM-First consultation engine**

---

## ✅ **Proposed Solution: LLM-First Prescription Generation**

### **Architecture:**

```typescript
export const buildClinicalPlan = (input: ClinicalPlanInput): PillarData => {
  const diagnosis = getTopDiagnosis(input.ddx);
  
  // NEW: LLM generates prescriptions for ANY diagnosis
  const prescriptions = await generatePrescriptionsWithLLM({
    diagnosis,
    icd10: extractIcd10(diagnosis),
    age: input.profile.age,
    weight_kg: input.profile.weight_kg,
    sex: input.profile.sex,
    pregnancy: input.profile.pregnancy,
    urgency: input.urgency,
    soap: input.soap,
  });
  
  const basePlan = buildUniversalPlan(diagnosis, prescriptions);
  // ...
};
```

---

## 📋 **LLM Prescription Generation System Prompt**

```typescript
const PRESCRIPTION_GENERATION_SYSTEM_PROMPT = `
You are a clinical pharmacology expert generating evidence-based prescriptions.

CONTEXT:
- Diagnosis: {diagnosis}
- ICD-10: {icd10}
- Patient: {age}y, {weight_kg}kg, {sex}
- Urgency: {urgency}
- Clinical features: {soap_summary}

TASK:
Generate appropriate first-line prescriptions following WHO/UpToDate/BNF guidelines.

RULES:
1. Use evidence-based, guideline-concordant medications
2. Provide weight-based dosing when appropriate (mg/kg)
3. Include formulation (Tab/Syrup/IM/IV), dose, frequency, duration
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
      "dose_per_kg": 15,        // mg/kg (if weight-based)
      "max_dose": 1000,         // mg (maximum single dose)
      "unit": "mg",
      "frequency": "tds",
      "duration": "5/7",
      "note": "For fever control"
    }
  ],
  "rationale": "Brief clinical reasoning for prescription choices"
}

EXAMPLES:

**Lichen Simplex Chronicus (L28.0):**
{
  "prescriptions": [
    {
      "medication": "Betamethasone 0.1%",
      "form": "Cream",
      "dose_per_kg": null,
      "max_dose": null,
      "unit": "application",
      "frequency": "bd",
      "duration": "14/7",
      "note": "Potent topical corticosteroid for itch-scratch cycle"
    },
    {
      "medication": "Cetirizine",
      "form": "Tab",
      "dose_per_kg": 0.2,
      "max_dose": 10,
      "unit": "mg",
      "frequency": "od (at night)",
      "duration": "14/7",
      "note": "Antihistamine for pruritus"
    }
  ],
  "rationale": "LSC requires breaking itch-scratch cycle with potent topical steroid + antihistamine for nocturnal itch"
}

**Hypertensive Emergency:**
{
  "prescriptions": [
    {
      "medication": "Amlodipine",
      "form": "Tab",
      "dose_per_kg": 0.1,
      "max_dose": 10,
      "unit": "mg",
      "frequency": "od",
      "duration": "1/12",
      "note": "Long-acting CCB for BP control"
    }
  ],
  "rationale": "Gradual BP reduction with long-acting agent to avoid precipitous drop"
}

Generate prescriptions now.
`;
```

---

## 🏗️ **Implementation Plan**

### **Phase 1: Create LLM Prescription Generator**

**File:** `src/core/api/agent/prescriptionGenerator.ts`

```typescript
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

interface PrescriptionResponse {
  prescriptions: Array<{
    medication: string;
    form: string;
    dose_per_kg?: number | null;
    max_dose?: number | null;
    unit: string;
    frequency: string;
    duration: string;
    note?: string;
  }>;
  rationale: string;
}

export const generatePrescriptionsWithLLM = async (
  request: PrescriptionRequest
): Promise<PrescriptionResponse> => {
  // Call LLM with system prompt
  // Parse JSON response
  // Validate prescription structure
  // Return prescriptions
};
```

### **Phase 2: Update `buildClinicalPlan`**

**File:** `src/core/api/agent/clinicalPlan.ts`

1. **Remove:**
   - `MALARIA_PROTOCOLS` (~200 lines)
   - `buildMalariaPlan()` function
   - `hasMalariaSignal()` check
   - `pickMalariaTrack()` logic

2. **Keep:**
   - Weight-based dosing utilities (`deriveDose`, `getACTFactor`, etc.)
   - `buildWeightDoseMeta()` for weight-based prescriptions
   - `formatPrescriptionLine()` for display

3. **Add:**
   - Call `generatePrescriptionsWithLLM()` for ALL diagnoses
   - Transform LLM response to `PillarData.encounter.prescriptions` format

---

## 🎯 **Benefits**

1. ✅ **Universal Scaling:** Works for ALL 70,000+ ICD-10 codes
2. ✅ **Evidence-Based:** LLM uses WHO/UpToDate/BNF guidelines
3. ✅ **Consistent Architecture:** Same LLM-First approach as consultation engine
4. ✅ **Personalized:** Adjusts for age, weight, pregnancy, urgency
5. ✅ **MIT 6.006 Correctness:** Algorithm works for arbitrary input

---

## 📊 **Testing Strategy**

### **Test Cases:**

1. **Malaria (B54)** - Verify LLM generates ACT + antipyretic
2. **Lichen Simplex Chronicus (L28.0)** - Verify topical steroid + antihistamine
3. **Hypertension (I10)** - Verify antihypertensive
4. **Rare Disease (e.g., Porphyria)** - Verify LLM handles edge cases
5. **Pediatric Case** - Verify syrup formulations + weight-based dosing
6. **Pregnancy** - Verify pregnancy-safe medications

---

**Status:** 🚧 **DESIGN COMPLETE - Ready for implementation**

