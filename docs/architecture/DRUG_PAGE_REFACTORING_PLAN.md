# Drug Page Refactoring Plan - LLM-First Architecture

**Date:** 2026-03-14  
**File:** `src/features/drug/DrugProtocolsView.tsx` (815 lines)  
**Goal:** Transform from hardcoded JSON lookup to LLM-driven prescription generation

---

## 🎯 **CURRENT STATE ANALYSIS**

### **What Works Well (✅ KEEP):**

1. **Beautiful UI/UX** - Alexander Canon compliant
   - Glassmorphic surfaces, borderless design
   - Smooth animations (Framer Motion)
   - iOS-style bottom sheets
   - Weight/Age calculator with volume dosing

2. **Weight-Based Dosing Logic** - Clinically sound
   - `getActBandDose()` - ACT weight bands
   - `getZincBandDose()` - Zinc dosing
   - `getOrsBandDose()` - ORS volume
   - `buildDose()` - Generic weight-based calculation
   - `estimateWeightFromAge()` - Age-based weight estimation

3. **Prescription Formatting** - Professional output
   - PDF export (`exportDrugProtocolPdf`)
   - Clipboard copy
   - History tracking (upserts to archive)
   - Timestamp and weight basis metadata

4. **Calculator Feature** - Useful clinical tool
   - Weight/Age mode toggle
   - Dose per kg calculation
   - Drug concentration → volume conversion
   - Profile persistence

### **What's Broken (❌ FIX):**

1. **Hardcoded Protocol Lookup** (Lines 154-180)
   ```typescript
   const response = await fetch('/data/drug-protocols.json');  // ❌ Only ~20 diseases
   ```

2. **Limited Search** (Lines 213-220)
   - Only searches hardcoded protocols
   - Can't find LSC, Stroke, Sepsis, etc.

3. **Quick Pick Hardcoded** (Lines 222-230)
   - Regex filter for specific diseases only
   - Doesn't scale to arbitrary diagnoses

---

## ✅ **PROPOSED SOLUTION: LLM-FIRST DRUG PAGE**

### **Architecture Changes:**

#### **1. Replace Hardcoded Protocol Loading**

**Before:**
```typescript
const loadProtocols = async () => {
  const response = await fetch('/data/drug-protocols.json');  // ❌ Hardcoded
  const payload = await response.json();
  setProtocols(sanitized);
};
```

**After:**
```typescript
const searchProtocols = async (query: string) => {
  if (!query.trim()) return [];
  
  // LLM generates prescription for ANY diagnosis
  const response = await fetch('/api/generate-prescription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      diagnosis: query,
      age: state.profile.age,
      weight_kg: state.profile.weight_kg,
      sex: state.profile.sex,
      pregnancy: state.profile.pregnancy,
      urgency: 'medium',
    }),
  });
  
  const prescription = await response.json();
  return transformLLMToDrugProtocol(prescription, query);
};
```

#### **2. Transform LLM Response to UI Format**

```typescript
const transformLLMToDrugProtocol = (
  llmResponse: PrescriptionResponse,
  diagnosis: string
): DrugProtocolEntry => {
  return {
    value: `llm-${normalize(diagnosis)}`,
    label: diagnosis,
    drugs: llmResponse.prescriptions.map(rx => ({
      name: rx.medication,
      form: rx.form,
      factor: rx.dose_per_kg ?? 0,
      max: rx.max_dose ?? 0,
      unit: rx.unit,
      frequency: rx.frequency,
      duration: rx.duration,
    })),
  };
};
```

#### **3. Update Search Flow**

**Before:** Search hardcoded JSON array  
**After:** LLM generates prescription on-demand

**User Flow:**
1. User types "Lichen Simplex Chronicus"
2. LLM generates prescription (Betamethasone + Cetirizine)
3. Display as protocol with weight-based dosing
4. User can export PDF / copy / save to history

---

## 🏗️ **IMPLEMENTATION PHASES**

### **Phase 1: Create API Endpoint** ✅ (Partially Done)

**File:** `src/core/api/agent/prescriptionGenerator.ts`
- ✅ System prompt created
- ✅ Interfaces defined
- ⏳ LLM call implementation (next step)

### **Phase 2: Add API Route**

**File:** `api/generate-prescription.ts` (NEW)
```typescript
import { generatePrescriptionsWithLLM } from '../src/core/api/agent/prescriptionGenerator';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { diagnosis, age, weight_kg, sex, pregnancy, urgency } = req.body;
  
  const prescriptions = await generatePrescriptionsWithLLM({
    diagnosis,
    age,
    weight_kg,
    sex,
    pregnancy,
    urgency: urgency || 'medium',
    soap: { S: {}, O: {}, A: {}, P: {} },
  });
  
  return res.status(200).json(prescriptions);
}
```

### **Phase 3: Refactor DrugProtocolsView.tsx**

**Changes:**
1. Remove hardcoded JSON loading (lines 154-180)
2. Add LLM search function
3. Update search to call LLM on-demand
4. Keep all weight-based dosing logic
5. Keep calculator, PDF export, copy, history

**Hybrid Approach (Best of Both Worlds):**
- **Fallback protocols:** Keep `drug-protocols.json` for offline/quick access
- **LLM enhancement:** Generate prescriptions for queries not in JSON
- **Caching:** Cache LLM responses to avoid repeated calls

---

## 📊 **USER EXPERIENCE IMPROVEMENTS**

### **Before:**
1. User searches "Lichen Simplex Chronicus"
2. ❌ No results found
3. User frustrated

### **After:**
1. User searches "Lichen Simplex Chronicus"
2. ✅ LLM generates prescription (Betamethasone + Cetirizine)
3. User sees protocol with weight-based dosing
4. User exports PDF / copies prescription
5. Prescription saved to history

---

## 🎯 **BENEFITS**

1. ✅ **Universal Coverage:** Works for ALL 70,000+ ICD-10 codes
2. ✅ **Maintains Structure:** Keeps weight-based dosing, calculator, PDF export
3. ✅ **Consistent Architecture:** Same LLM-First approach as consultation engine
4. ✅ **Offline Fallback:** Can still use hardcoded protocols if LLM unavailable
5. ✅ **Professional Output:** Same PDF/copy functionality
6. ✅ **History Tracking:** All LLM-generated prescriptions saved to archive

---

## 🚀 **NEXT STEPS**

1. ⏳ **Implement LLM call** in `prescriptionGenerator.ts`
2. ⏳ **Create API endpoint** (`api/generate-prescription.ts`)
3. ⏳ **Refactor DrugProtocolsView** to use LLM search
4. ⏳ **Test with LSC** (prove it works for arbitrary diagnoses)
5. ⏳ **Test with malaria** (ensure quality matches hardcoded version)

---

**Status:** 🚧 **DESIGN COMPLETE - Ready for implementation**

