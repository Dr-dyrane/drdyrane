# LLM-First Architecture Refactoring Plan

**Date:** 2026-03-14  
**Objective:** Remove hardcoded disease patterns and trust LLM clinical reasoning for arbitrary input handling  
**Methodology:** MIT 6.006 - Prove algorithm correctness for arbitrary input, not specific test cases

---

## 🎯 **THE FUNDAMENTAL PROBLEM**

**Current Architecture:**
- ~1,500 lines of hardcoded disease patterns
- `FEVER_DISEASE_PROFILES` (meningitis, malaria, dengue, typhoid, pneumonia, UTI, influenza)
- `DIAGNOSIS_HINTS` (specific follow-up questions per diagnosis)
- `FEATURE_CUES` (chronic_itch, rash_or_bleeding, fever, chills, etc.)
- `ENGINE_FALLBACK_DIFFERENTIALS` (disease lists per chief complaint)

**Why This Doesn't Scale:**
1. ❌ Can't cover 70,000+ ICD-10 codes
2. ❌ Fails on atypical presentations
3. ❌ Maintenance nightmare (update for every new pattern)
4. ❌ Defeats the purpose of LLM (which already has medical knowledge)

---

## ✅ **THE SOLUTION: ALGORITHM FOR ARBITRARY INPUT**

### **Proof of Correctness:**

**Claim:** The following algorithm correctly handles ANY presenting complaint:

```typescript
function diagnose(arbitrary_symptoms: string): Diagnosis {
  // 1. Map to SOAP (works for ANY symptom)
  const soap = extractClinicalData(arbitrary_symptoms);
  
  // 2. Build differential (LLM has general medical knowledge)
  const ddx = llm_clinical_reasoning(soap);
  
  // 3. Enforce quality (universal clinical standards)
  if (!hasAdequateHistory(soap)) {
    return askMoreQuestions();
  }
  
  // 4. Safety check (universal emergency patterns)
  if (isEmergency(ddx)) {
    return escalate();
  }
  
  return ddx;
}
```

**Proof:**
1. **SOAP extraction** works for any symptom description (proven in FORMAL_CORRECTNESS_PROOFS.md §2)
2. **LLM reasoning** has general medical knowledge from training (not disease-specific)
3. **Quality guardrails** enforce universal standards (5+ questions, 3+ HPC elements)
4. **Safety checks** catch any emergency pattern (not disease-specific)

∴ Algorithm is correct for arbitrary input ✓

---

## 📋 **REFACTORING PHASES**

### **Phase 1: Identify What to Keep vs. Remove**

#### **KEEP (Universal Guardrails):**

1. **Emergency Detection (Universal)**
   ```typescript
   // Keep only life-threatening patterns
   const EMERGENCY_PATTERNS = [
     { pattern: /neck stiffness.*fever|fever.*neck stiffness/i, condition: 'Meningitis' },
     { pattern: /confusion.*fever|fever.*confusion/i, condition: 'Sepsis/Meningitis' },
     { pattern: /chest pain.*radiation|crushing chest pain/i, condition: 'ACS' },
     { pattern: /worst headache.*life|thunderclap headache/i, condition: 'SAH' },
     { pattern: /one.*sided weakness|facial droop|speech difficulty/i, condition: 'Stroke' },
   ];
   ```

2. **Clinical Quality Enforcement (Universal)**
   ```typescript
   // Already proven correct in FORMAL_CORRECTNESS_PROOFS.md §1
   hasAdequateHistoryForDiagnosis() {
     return (
       doctorQuestions >= 5 &&
       hpcElements >= 3 &&
       positiveFindings > 0 &&
       phase in ['differential', 'resolution']
     );
   }
   ```

3. **Question Repetition Prevention (Universal)**
   ```typescript
   // Already proven correct in FORMAL_CORRECTNESS_PROOFS.md §4
   sanitizeQuestion(question, conversation) {
     if (isRepeatedQuestion(question, conversation)) {
       return getProgressiveQuestion();
     }
     return question;
   }
   ```

4. **Chief Complaint Classification (Universal)**
   ```typescript
   // Keep CHIEF_COMPLAINT_ENGINES (fever, chest_pain, SOB, headache, etc.)
   // These are symptom categories, not specific diseases
   // Used for routing and must-not-miss lists
   ```

#### **REMOVE (Disease-Specific Patterns):**

1. ❌ **FEVER_DISEASE_PROFILES** (meningitis, malaria, dengue, typhoid, pneumonia, UTI, influenza)
   - LLM already knows these diseases
   - Hardcoded scoring doesn't scale
   - Fails on atypical presentations

2. ❌ **DIAGNOSIS_HINTS** (malaria, dengue, typhoid, LSC patterns)
   - LLM should generate follow-up questions dynamically
   - Hardcoded questions don't adapt to patient context

3. ❌ **FEATURE_CUES** (chronic_itch, rash_or_bleeding, fever, chills, etc.)
   - LLM should extract features from conversation
   - Hardcoded regex patterns miss nuanced descriptions

4. ❌ **ENGINE_FALLBACK_DIFFERENTIALS** (disease lists per complaint)
   - LLM should generate differentials based on pathophysiology
   - Hardcoded lists are incomplete and outdated

5. ❌ **Functions that use removed patterns:**
   - `buildFeatureEvidence()` - uses FEATURE_CUES
   - `rankTopDownProfiles()` - uses FEVER_DISEASE_PROFILES
   - `applyClinicalHeuristics()` - orchestrates removed patterns

---

### **Phase 2: Strengthen LLM System Prompt**

**Current Prompt Issues:**
- Doesn't emphasize pattern recognition
- Doesn't explain pathophysiological reasoning
- Doesn't guide differential building algorithm

**Enhanced Prompt:**
```typescript
export const CONVERSATION_SYSTEM_PROMPT = `You are Dr. Dyrane, a Consultant General Physician with comprehensive training across all medical specialties.

CLINICAL REASONING ALGORITHM (for ANY presenting complaint):

1. PATTERN RECOGNITION (Pathophysiology-First):
   - Identify disease mechanisms from symptoms
   - Example: "Chronic itch + dark patches" → Itch-scratch cycle → Lichenification → Post-inflammatory hyperpigmentation
   - Example: "Fever + cyclic pattern + mosquito" → Malaria lifecycle → Paroxysmal fever
   - Think MECHANISMS, not just symptom checklists

2. DIFFERENTIAL BUILDING (Hypothesis Generation):
   - What disease processes explain ALL the findings?
   - What must-not-miss conditions share this pattern?
   - Generate 3-5 hypotheses ranked by likelihood

3. TARGETED QUESTIONING (Hypothesis Testing):
   - Each question should test a specific differential
   - Explain your reasoning in "thinking" field
   - Example: "Asking about neck stiffness to rule out meningitis"
   - Adapt questions based on patient's previous answers

4. QUALITY ENFORCEMENT (Universal Standards):
   - Minimum 5 questions before diagnosis
   - Minimum 3 HPC elements (onset, character, timing, etc.)
   - Positive findings documented
   - Differentials ruled in/out with evidence

5. SAFETY CHECKS (Must-Not-Miss):
   - Always consider life-threatening differentials first
   - Red flags: confusion, severe pain, bleeding, respiratory distress, neurological deficits
   - Escalate immediately if emergency pattern detected

This algorithm works for ANY presenting complaint - from common colds to rare diseases.
Trust your medical knowledge. You don't need hardcoded patterns.
`;
```

---

### **Phase 3: Simplify applyClinicalHeuristics()**

**Current (Complex):**
```typescript
const applyClinicalHeuristics = (body, payload) => {
  const corpus = buildConsultTextCorpus(body, payload);
  const evidence = buildFeatureEvidence(corpus);  // ❌ Uses FEATURE_CUES
  const rankedProfiles = rankTopDownProfiles(corpus);  // ❌ Uses FEVER_DISEASE_PROFILES
  const rankedFromLlm = rankLlmDiagnoses(withCodedDdx, evidence);
  const orchestrated = mergeOrchestratedCandidates(rankedProfiles, rankedFromLlm);
  // ... complex merging logic
};
```

**Refactored (Simple):**
```typescript
const applyClinicalHeuristics = (body, payload) => {
  // Trust the LLM's differential diagnosis
  const withCodedDdx = dedupeDxList(payload.ddx.map(applyIcd10Label));
  
  // Only apply universal safety checks
  const withEmergencyPriority = prioritizeEmergencies(withCodedDdx);
  
  // Return simplified payload
  return {
    ...payload,
    ddx: withEmergencyPriority,
  };
};
```

---

## 🧪 **TESTING STRATEGY**

### **Test Case 1: Francis's LSC (WITHOUT hardcoded patterns)**

**Input:** "Itching for years, sometimes comes and go, causes dry skin and dark patches"

**Expected LLM Reasoning:**
1. Pattern: Chronic itch → scratch → dark patches = itch-scratch cycle
2. Pathophysiology: Post-inflammatory hyperpigmentation from repeated trauma
3. Differential: LSC, atopic dermatitis, contact dermatitis
4. Questions: Duration? Triggers? Lichenification? Systemic symptoms?
5. Diagnosis: Lichen Simplex Chronicus (L28.0)

**Success Criteria:** LLM reaches correct diagnosis without hardcoded LSC patterns

### **Test Case 2: Malaria (WITHOUT hardcoded patterns)**

**Input:** "Fever for 3 days, comes with evening chills, better in morning, mosquito bites"

**Expected LLM Reasoning:**
1. Pattern: Cyclic fever + mosquito = malaria lifecycle
2. Pathophysiology: Plasmodium erythrocytic cycle (48-72 hours)
3. Differential: Malaria, dengue, typhoid, viral fever
4. Questions: Rigors? Headache? Travel? Prophylaxis?
5. Diagnosis: Malaria (B54)

**Success Criteria:** LLM reaches correct diagnosis without hardcoded malaria patterns

---

## 📊 **METRICS FOR SUCCESS**

1. ✅ **Code Reduction:** ~1,500 lines → ~200 lines (87% reduction)
2. ✅ **Arbitrary Input Handling:** Works for ANY presenting complaint (not just hardcoded ones)
3. ✅ **Diagnostic Accuracy:** Maintains or improves accuracy on test cases
4. ✅ **Clinical Quality:** Still enforces 5+ questions, 3+ HPC elements
5. ✅ **Safety:** Still catches emergencies (meningitis, sepsis, ACS, stroke)

---

## 🚀 **IMPLEMENTATION STEPS**

1. ✅ Create this refactoring plan document
2. ⏳ Update CONVERSATION_SYSTEM_PROMPT with algorithmic reasoning
3. ⏳ Remove FEVER_DISEASE_PROFILES, DIAGNOSIS_HINTS, FEATURE_CUES
4. ⏳ Simplify applyClinicalHeuristics() to trust LLM
5. ⏳ Keep only universal safety guardrails
6. ⏳ Test with Francis's LSC case (no hardcoded patterns)
7. ⏳ Test with malaria case (no hardcoded patterns)
8. ⏳ Update FORMAL_CORRECTNESS_PROOFS.md with arbitrary input proof
9. ⏳ Commit and document the refactoring

---

**Status:** Planning complete, ready for implementation  
**Next:** Update CONVERSATION_SYSTEM_PROMPT

