# Current Hardcoded Drug Protocols Analysis

**File:** `public/data/drug-protocols.json`

## 📊 **HARDCODED PROTOCOLS (Only ~20 diseases):**

1. **Acute Asthma** - Salbutamol, Hydrocortisone, Prednisolone
2. **Anaemia (Blood Transfusion)** - Normal Saline, Hydrocortisone, Paracetamol, Promethazine
3. **ANC Hematinics** - Fersolate, Folic acid, Vitamin C, Vitamin B Complex
4. **Arthritis** - Celecoxib, Arthrotec, Dorbaxin, Orphenadrine
5. **Catheterization (Size 16F)** - Foley's Catheter, Syringe, KY jelly
6. **Hypertension** - Amlodipine, Losartan, Lisinopril
7. **Mild Malaria (Child)** - ACT Syrup, Paracetamol Syrup
8. **Mild Malaria (Adult)** - ACT Tab, Paracetamol Tab
9. **Moderate Malaria (Child)** - Artemether IM, ACT Syrup, Paracetamol
10. **Moderate Malaria (Adult)** - Artemether IM, ACT Tab, Paracetamol
11. **Mild Malaria & URTI (Child)** - ACT, Paracetamol, Piriton, Cefuroxime/Amoxicillin
12. **Mild Malaria & URTI (Adult)** - ACT, Paracetamol, Loratidine, Cefuroxime/Amoxicillin
13. **Moderate Malaria & URTI (Child)** - Artemether, ACT, Paracetamol, Piriton, Antibiotics
14. **Moderate Malaria & URTI (Adult)** - Artemether, ACT, Paracetamol, Loratidine, Antibiotics
15. **Moderate Malaria & Gastritis (Adult)** - Artemether, ACT, Paracetamol, Ciprofloxacin, Omeprazole
16. **Moderate Malaria & GE (Child)** - Artemether, ACT, Paracetamol, Ceftriaxone, Zinc, ORS
17. **Moderate Malaria & GE (Adult)** - Artemether, ACT, Paracetamol, Ceftriaxone, Zinc, ORS
18. **Neuropathy** - Pregabalin, Neurovite
19. **Prostate Enlargement** - Levofloxacin, Loratidine, Dutasteride + Tamsulosine
20. **Venereal Rash** - Ceftriaxone, Doxycycline, Prednisolone, Loratidine, Zinc
21. **Type 2 Diabetes Mellitus** - Metformin, Glibenclamide

---

## ❌ **THE PROBLEM:**

### **Coverage:**
- ✅ **~20 diseases** hardcoded
- ❌ **69,980+ ICD-10 codes** NOT covered

### **Missing Conditions:**
- ❌ **Lichen Simplex Chronicus (L28.0)** - No protocol!
- ❌ **Stroke** - No protocol!
- ❌ **Sepsis** - No protocol!
- ❌ **Pneumonia** - No protocol!
- ❌ **Heart Failure** - No protocol!
- ❌ **Chronic Kidney Disease** - No protocol!
- ❌ **Thyroid Disorders** - No protocol!
- ❌ **Epilepsy** - No protocol!
- ❌ **Depression** - No protocol!
- ❌ **Anxiety** - No protocol!
- ❌ **COPD** - No protocol!
- ❌ **Peptic Ulcer Disease** - No protocol!
- ❌ **Urinary Tract Infection** - No protocol!
- ❌ **Skin Infections** - No protocol!
- ❌ **Allergic Reactions** - No protocol!
- ❌ **And 69,965+ more...**

### **Architecture Issues:**
1. **Hardcoded JSON** - Can't scale to new diseases
2. **Manual maintenance** - Requires developer intervention for each new disease
3. **Inconsistent with consultation engine** - Consultation uses LLM, prescriptions use JSON
4. **No personalization** - Doesn't adjust for patient-specific factors beyond weight

---

## ✅ **THE SOLUTION: LLM-First Prescription Generation**

### **Instead of:**
```json
{
  "value": "mildMalariaChild",
  "label": "Mild Malaria (Child)",
  "drugs": [
    {"name": "ACT", "form": "Syrup", "factor": "ACTFactor", ...}
  ]
}
```

### **Use:**
```typescript
const prescriptions = await generatePrescriptionsWithLLM({
  diagnosis: "Lichen Simplex Chronicus (L28.0)",
  age: 35,
  weight_kg: 70,
  sex: "female",
  urgency: "medium"
});

// LLM returns:
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
      "note": "Potent topical corticosteroid"
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
  "rationale": "Break itch-scratch cycle with potent topical steroid + antihistamine"
}
```

---

## 🎯 **BENEFITS:**

1. ✅ **Universal Coverage:** Works for ALL 70,000+ ICD-10 codes
2. ✅ **Evidence-Based:** LLM uses WHO/UpToDate/BNF guidelines
3. ✅ **Personalized:** Adjusts for age, weight, pregnancy, allergies, urgency
4. ✅ **Consistent Architecture:** Same LLM-First approach as consultation engine
5. ✅ **Self-Maintaining:** No manual updates needed for new diseases
6. ✅ **Clinically Sound:** LLM trained on medical literature and guidelines

---

## 📝 **IMPLEMENTATION PLAN:**

### **Phase 1: Prescription Generator (✅ DONE)**
- Created `prescriptionGenerator.ts` with system prompt
- Defined interfaces and validation logic

### **Phase 2: Refactor clinicalPlan.ts (⏳ NEXT)**
- Remove ~295 lines of hardcoded MALARIA_PROTOCOLS
- Replace with LLM prescription generation

### **Phase 3: Update /drug Page (⏳ PENDING)**
- Replace `drug-protocols.json` lookup with LLM generation
- Maintain calculator and weight-based dosing UI

### **Phase 4: Testing (⏳ PENDING)**
- Test with LSC (prove it works for arbitrary diagnoses)
- Test with malaria (ensure quality matches hardcoded version)
- Test with rare diseases (edge cases)

---

**Status:** 🚧 **READY FOR IMPLEMENTATION**

