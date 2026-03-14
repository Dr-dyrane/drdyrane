# Clinical Plan Refactoring Summary

**Date:** 2026-03-14  
**File:** `src/core/api/agent/clinicalPlan.ts`  
**Goal:** Remove hardcoded malaria prescriptions, implement LLM-First prescription generation

---

## 🎯 **Current State Analysis**

### **File Structure (481 lines):**

```
Lines 1-125:   Utilities & Contract Merging (✅ KEEP)
Lines 126-346: MALARIA_PROTOCOLS hardcoded data (❌ DELETE ~220 lines)
Lines 347-421: buildMalariaPlan() function (❌ DELETE ~75 lines)
Lines 423-448: buildGenericPlan() function (✅ KEEP, modify)
Lines 450-481: Utilities & main export (✅ KEEP)
```

**Total to delete:** ~295 lines of hardcoded malaria logic

---

## ❌ **Code to Remove**

### **1. MALARIA_PROTOCOLS constant (Lines 128-221)**
```typescript
const MALARIA_PROTOCOLS: {
  adult: Record<'mild' | 'mild_urti' | 'moderate' | 'moderate_urti' | 'moderate_ge', MalariaProtocol>;
  child: Record<'mild' | 'mild_urti' | 'moderate' | 'moderate_urti' | 'moderate_ge', MalariaProtocol>;
} = {
  adult: {
    mild: { label: 'Mild Malaria (Adult)', rows: [...] },
    // ... 5 variants
  },
  child: {
    mild: { label: 'Mild Malaria (Child)', rows: [...] },
    // ... 5 variants
  },
};
```

### **2. Helper Functions (Lines 222-346)**
- `getACTFactor()` - ✅ **KEEP** (weight-based dosing utility)
- `getZincFactor()` - ✅ **KEEP** (weight-based dosing utility)
- `getORSFactor()` - ✅ **KEEP** (weight-based dosing utility)
- `getProfileWeightKg()` - ✅ **KEEP** (weight extraction)
- `estimateWeightKg()` - ✅ **KEEP** (age-based weight estimation)
- `deriveDose()` - ✅ **KEEP** (dose calculation)
- `buildWeightDoseMeta()` - ✅ **KEEP** (weight metadata)
- `sanitizeDuration()` - ✅ **KEEP** (duration formatting)
- `pickMalariaTrack()` - ❌ **DELETE** (malaria-specific)
- `formatPrescriptionLine()` - ✅ **KEEP** (prescription formatting)

### **3. buildMalariaPlan() (Lines 360-421)**
```typescript
const buildMalariaPlan = (
  diagnosis: string,
  urgency: ClinicalState['urgency'],
  soap: ClinicalState['soap'],
  profile: ClinicalState['profile']
): PillarData => {
  // ~60 lines of malaria-specific logic
};
```
❌ **DELETE** - Replace with LLM call

### **4. hasMalariaSignal() (Line 126)**
```typescript
const hasMalariaSignal = (diagnosis: string): boolean => /\bmalaria\b/i.test(diagnosis);
```
❌ **DELETE** - No longer needed

---

## ✅ **Code to Keep & Modify**

### **1. buildGenericPlan() - MODIFY**

**Before:**
```typescript
const buildGenericPlan = (diagnosis: string): PillarData => ({
  diagnosis: diagnosis,
  management: [...],
  prognosis: '...',
  prevention: '...',
  encounter: {
    investigations: [...],
    prescriptions: [],  // ❌ Empty!
    counseling: [...],
    follow_up: [...],
  },
});
```

**After:**
```typescript
const buildUniversalPlan = async (
  diagnosis: string,
  prescriptions: RawPrescriptionLine[],
  profile: ClinicalState['profile']
): Promise<PillarData> => ({
  diagnosis: diagnosis,
  management: [...],
  prognosis: '...',
  prevention: '...',
  encounter: {
    investigations: [...],
    prescriptions: transformPrescriptions(prescriptions, profile),  // ✅ LLM-generated!
    counseling: [...],
    follow_up: [...],
  },
});
```

### **2. buildClinicalPlan() - MODIFY**

**Before:**
```typescript
export const buildClinicalPlan = (input: ClinicalPlanInput): PillarData => {
  const diagnosis = getTopDiagnosis(input.ddx);
  const basePlan = hasMalariaSignal(diagnosis)
    ? buildMalariaPlan(diagnosis, input.urgency, input.soap, input.profile)  // ❌ Hardcoded
    : buildGenericPlan(diagnosis);  // ❌ Empty prescriptions
  const withContract = mergeContractIntoPlan(basePlan, input.ddx, input.contract);
  const withSoap = injectSoapSummary(withContract, input.soap);
  const profileLine = buildProfileLine(input.profile);
  if (!profileLine) return withSoap;
  return {
    ...withSoap,
    diagnosis: `${withSoap.diagnosis}\n${profileLine}`,
  };
};
```

**After:**
```typescript
export const buildClinicalPlan = async (input: ClinicalPlanInput): Promise<PillarData> => {
  const diagnosis = getTopDiagnosis(input.ddx);
  
  // ✅ LLM generates prescriptions for ANY diagnosis
  const prescriptionResponse = await generatePrescriptionsWithLLM({
    diagnosis,
    icd10: extractIcd10(diagnosis),
    age: input.profile.age,
    weight_kg: input.profile.weight_kg,
    sex: input.profile.sex,
    pregnancy: input.profile.pregnancy,
    urgency: input.urgency,
    soap: input.soap,
  });
  
  const basePlan = await buildUniversalPlan(diagnosis, prescriptionResponse.prescriptions, input.profile);
  const withContract = mergeContractIntoPlan(basePlan, input.ddx, input.contract);
  const withSoap = injectSoapSummary(withContract, input.soap);
  const profileLine = buildProfileLine(input.profile);
  if (!profileLine) return withSoap;
  return {
    ...withSoap,
    diagnosis: `${withSoap.diagnosis}\n${profileLine}`,
  };
};
```

---

## 📊 **Impact Summary**

### **Lines of Code:**
- **Before:** 481 lines
- **Delete:** ~295 lines (malaria-specific)
- **Add:** ~50 lines (LLM integration)
- **After:** ~236 lines (51% reduction!)

### **Functionality:**
- **Before:** Detailed prescriptions for malaria only, empty for everything else
- **After:** LLM-generated prescriptions for ALL 70,000+ ICD-10 codes

### **Architecture:**
- **Before:** Hardcoded pattern-matching (inconsistent with consultation engine)
- **After:** LLM-First (consistent with consultation engine)

---

## 🚀 **Next Steps**

1. ✅ Design complete (`LLM_PRESCRIPTION_GENERATION.md`)
2. ✅ Prescription generator created (`prescriptionGenerator.ts`)
3. ⏳ Implement LLM call in `prescriptionGenerator.ts`
4. ⏳ Refactor `clinicalPlan.ts` to use LLM
5. ⏳ Update all callers to handle async `buildClinicalPlan()`
6. ⏳ Test with LSC, malaria, and rare diseases

---

**Status:** 🚧 **DESIGN COMPLETE - Ready for implementation**

