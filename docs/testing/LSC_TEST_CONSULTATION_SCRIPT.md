# LSC Test Consultation Script

**Date:** 2026-03-14  
**Objective:** Test if LLM can diagnose Lichen Simplex Chronicus WITHOUT hardcoded patterns  
**Patient:** Francis Moneke (simulated)

---

## 🎯 **TEST HYPOTHESIS**

**Claim:** The LLM can diagnose LSC using pure pathophysiological reasoning without hardcoded disease patterns.

**Success Criteria:**
1. ✅ LLM asks relevant questions about itch-scratch cycle
2. ✅ LLM recognizes pattern: chronic itch → scratching → dark patches
3. ✅ LLM generates differential including LSC
4. ✅ LLM reaches diagnosis: Lichen Simplex Chronicus (L28.0)
5. ✅ LLM provides appropriate management plan

---

## 📝 **CONSULTATION SCRIPT**

### **Turn 1: Initial Presentation**

**Patient Input:**
```
I've been having itching for years now. It sometimes comes and goes, but it's basically always present. When I scratch, I get dry skin and dark patches.
```

**Expected LLM Response:**
- Acknowledge chronic nature
- Ask about location/distribution
- Ask about triggers
- Begin building differential (itch-scratch cycle pattern)

---

### **Turn 2: Location & Pattern**

**Patient Input:**
```
It's mainly on my face and neck. The itching gets worse when I'm hot or sweating, especially after exercise.
```

**Expected LLM Response:**
- Recognize heat/sweat as triggers
- Ask about scratching behavior
- Ask about timeline (when dark patches appear)
- Consider: LSC, atopic dermatitis, contact dermatitis

---

### **Turn 3: Itch-Scratch Cycle**

**Patient Input:**
```
Yes, I scratch a lot, sometimes without even realizing it. The dark patches appear where I scratch the most.
```

**Expected LLM Response:**
- **KEY PATTERN RECOGNITION:** Itch → Scratch → Dark patches = Itch-scratch cycle
- Ask about skin thickening (lichenification)
- Ask about previous treatments
- Differential narrowing toward LSC

---

### **Turn 4: Previous Treatment**

**Patient Input:**
```
I tried Cetirizine but it didn't help. I also used Biocoten cream which helped, but when I stopped, it came back.
```

**Expected LLM Response:**
- Recognize antihistamine failure (not allergic)
- Recognize steroid response (Biocoten contains dexamethasone)
- Recognize relapse pattern (confirms chronic condition)
- Ask about moisturizing routine

---

### **Turn 5: Skincare & Examination**

**Patient Input:**
```
I use Dove soap and sometimes moisturize with CeraVe or La Roche-Posay, but not regularly.
```

**Expected LLM Response:**
- Request visual examination (lens_trigger)
- OR ask about skin texture (thickened/leathery)
- Prepare to formulate diagnosis

---

### **Turn 6: Examination Findings**

**Patient Input (after image upload):**
```
[Image shows lichenified plaques on neck with post-inflammatory hyperpigmentation]
```

**Expected LLM Response:**
- **DIAGNOSIS:** Lichen Simplex Chronicus (L28.0)
- **PATHOPHYSIOLOGY EXPLANATION:** Chronic itch-scratch cycle → lichenification → post-inflammatory hyperpigmentation
- **MANAGEMENT PLAN:**
  - Potent topical corticosteroid (neck)
  - Steroid-sparing agent (face)
  - Oral antihistamine (nocturnal itch)
  - Barrier repair (moisturizer 3x daily)
  - Trigger avoidance
  - Patient education

---

## 🧪 **VALIDATION CHECKLIST**

### **Clinical Reasoning Quality:**
- [ ] LLM identified itch-scratch cycle pattern
- [ ] LLM recognized pathophysiology (lichenification → hyperpigmentation)
- [ ] LLM asked about triggers (heat, sweat, friction)
- [ ] LLM asked about scratching behavior
- [ ] LLM asked about previous treatments
- [ ] LLM requested examination when appropriate

### **Differential Diagnosis:**
- [ ] LSC included in differential
- [ ] Atopic dermatitis considered
- [ ] Contact dermatitis considered
- [ ] Fungal infection ruled out

### **Diagnosis Accuracy:**
- [ ] Correct diagnosis: Lichen Simplex Chronicus (L28.0)
- [ ] Correct ICD-10 code
- [ ] Pathophysiology explained correctly

### **Management Plan:**
- [ ] Topical corticosteroid recommended
- [ ] Barrier repair emphasized
- [ ] Trigger avoidance discussed
- [ ] Patient education provided
- [ ] Follow-up plan mentioned

---

## 📊 **COMPARISON: Hardcoded vs. LLM-First**

### **Old Architecture (Hardcoded):**
```typescript
// FEATURE_CUES
{
  id: 'chronic_itch',
  positive: [
    /\bitch(ing|y)?.*years?|chronic itch|persistent itch/i,
    /\bdry skin.*dark patches|dark patches.*itch/i,
  ],
  question: 'How long have you had the itching, and do you notice dark patches where you scratch?',
}

// DIAGNOSIS_HINTS
{
  pattern: /\blichen simplex chronicus\b|\blsc\b/i,
  followUpQuestion: 'Do the dark patches appear specifically where you scratch most?',
  pendingActions: ['Confirm lichenification on examination', 'Assess itch-scratch cycle'],
}
```

**Problem:** Only works if patient says exact keywords. Fails on atypical presentations.

### **New Architecture (LLM-First):**
```typescript
// CONVERSATION_SYSTEM_PROMPT
PATTERN RECOGNITION (Pathophysiology-First Thinking):
- "Chronic itch + dark patches" → Itch-scratch cycle → Lichenification → 
  Post-inflammatory hyperpigmentation → Lichen Simplex Chronicus
- Think: "What pathophysiological process explains ALL these findings together?"
```

**Advantage:** Works for ANY description. Adapts to patient's language. Handles atypical presentations.

---

## 🚀 **NEXT STEPS**

1. ✅ Start development server
2. ✅ Begin test consultation with Francis's presentation
3. ✅ Document LLM's reasoning at each turn
4. ✅ Validate against success criteria
5. ✅ Compare with expected responses
6. ✅ Document results

---

**Status:** Ready for testing  
**Expected Duration:** 5-10 minutes  
**Expected Outcome:** LLM diagnoses LSC without hardcoded patterns ✓

