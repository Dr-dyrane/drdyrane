# Improved Clinical Clerking System

**Date:** 2026-03-14  
**Author:** Augment Agent  
**Purpose:** Transform Dr. Dyrane from a restrictive diagnostic assistant to a true consultant-level physician conducting proper clinical clerking

---

## Problem Statement

The previous system was jumping to "working diagnosis and plan" too quickly without properly clerking the patient through a complete history. This resulted in:

1. **Premature diagnosis offers** - AI asking "Would you like your working diagnosis?" after only 2-3 questions
2. **Incomplete history-taking** - Skipping essential HPC elements (onset, character, radiation, timing, etc.)
3. **Missing systematic approach** - Not following the proper clerking structure (PC → HPC → PMH → DH → SH → FH → Systematic Review)
4. **Poor differential reasoning** - Not actively ruling in/out conditions based on pathophysiology

---

## Solution Overview

### 1. **Enhanced System Prompt** (`api/_aiOrchestrator.ts`)

Completely rewrote `CONVERSATION_SYSTEM_PROMPT` to:

#### Core Identity Changes
- **Before:** "Senior Clinical Registrar"
- **After:** "Consultant General Physician with comprehensive training across all medical specialties"
- Emphasizes expertise in internal medicine, surgery, pediatrics, obstetrics, psychiatry, and all subspecialties
- Thinks like a registrar preparing a complete case presentation for rounds

#### Structured Clerking Order (MANDATORY)
1. **PRESENTING COMPLAINT(S) with DURATION**
2. **HISTORY OF PRESENTING COMPLAINT (HPC)**
   - Onset, Character, Radiation, Associated symptoms, Timing/Pattern
   - Exacerbating factors, Relieving factors, Severity/Progression
   - Match questions to pathophysiology of suspected conditions
3. **PAST MEDICAL HISTORY (PMH)**
4. **DRUG HISTORY (DH)**
5. **SOCIAL HISTORY (SH)**
6. **FAMILY HISTORY (FH)**
7. **SYSTEMATIC REVIEW**
8. **EXAMINATION FINDINGS** (via lens_trigger)
9. **WORKING DIAGNOSIS & DIFFERENTIALS** (only after adequate history)
10. **INVESTIGATIONS & MANAGEMENT PLAN**

#### Clinical Reasoning Rules
- **Bayesian thinking:** Each answer updates probability of each differential
- **Negative findings matter:** Absent symptoms actively lower likelihood
- **Match to pathophysiology:** e.g., for malaria: evening chills → night fever → morning sweats
- **Natural history awareness:** acute (<1 week), subacute (1-4 weeks), chronic (>4 weeks)
- **Must-not-miss vigilance:** Always consider meningitis, sepsis, MI, PE, ectopic, etc.
- **Epidemiological context:** Nigeria = high malaria, typhoid, TB prevalence
- **Challenge anchoring bias:** Actively consider alternative explanations

#### Phase Discipline (KEY CHANGE)
- **"intake" phase:** Focus ONLY on presenting complaint(s) with duration
- **"assessment" phase:** Complete HPC, then PMH/DH/SH/FH as needed
- **"differential" phase:** Systematic review, examination, formulate differentials
- **"resolution" phase:** Confirm diagnosis, explain, plan investigations/treatment
- **CRITICAL RULE:** DO NOT jump to "working diagnosis and plan" until adequate history is completed
- **CRITICAL RULE:** DO NOT ask "would you like your working diagnosis" until enough information exists

---

### 2. **Phase Progression Validation** (`src/core/api/agentCoordinator.ts`)

Added programmatic enforcement to prevent premature diagnosis:

#### New Validation Function
```typescript
const hasAdequateHistoryForDiagnosis = (
  conversation: ConversationMessage[],
  soap: ClinicalState['soap'],
  agentState: ClinicalState['agent_state']
): boolean
```

**Checks:**
1. Minimum 5 doctor questions asked
2. Minimum 3 HPC elements captured in SOAP
3. At least some positive findings documented
4. Phase must be at least 'differential' (not 'intake' or 'assessment')

#### Integration Point
Modified `ensureProgressiveQuestion()` to:
1. Detect when AI tries to ask about "working diagnosis"
2. Check if adequate history has been taken
3. Block the question if history is insufficient
4. Redirect to continue history-taking instead

#### Audit Trail
Added new invariant event type: `'premature_diagnosis_blocked'`
- Tracks when the system prevents premature diagnosis
- Logs turn count and phase for debugging
- Helps monitor system behavior

---

### 3. **Updated Invariant Audit** (`src/core/api/agent/invariantAudit.ts`)

Added `'premature_diagnosis_blocked'` to the event type system to track when the guardrail activates.

---

## Expected Behavior Changes

### Before
```
Patient: "I have fever for 3 days"
AI: "Noted. Would you like your working diagnosis and plan?"
```

### After
```
Patient: "I have fever for 3 days"
AI: "Fever for 3 days noted. How did the fever start - suddenly or gradually?"
Patient: "It started suddenly yesterday evening"
AI: "Sudden onset noted. Does the fever follow a pattern - constant or does it come and go?"
Patient: "It comes at night with chills"
AI: "Evening chills with night fever noted. What other symptoms came with the fever?"
Patient: "Headache and body aches"
AI: "Headache and body aches noted. Any vomiting, confusion, or difficulty breathing?"
Patient: "No"
AI: "Good, no danger signs. Have you had similar episodes before?"
... [continues proper clerking]
... [only after 8-10+ questions and adequate HPC/PMH]
AI: "Based on your history - evening chills, night fever, headache, body aches for 3 days - I'm thinking of Malaria (ICD-10: B50.9) as the most likely diagnosis. Would you like the full plan?"
```

---

## Testing Recommendations

1. **Test with fever presentation** (common in Nigeria)
   - Verify AI asks about onset, pattern, associated symptoms
   - Verify AI asks about mosquito exposure for malaria
   - Verify AI doesn't offer diagnosis until 5+ questions

2. **Test with abdominal pain**
   - Verify AI asks about location, character, radiation
   - Verify AI asks about timing, food relationship
   - Verify AI considers surgical vs medical causes

3. **Test with headache**
   - Verify AI asks about onset (sudden = red flag)
   - Verify AI asks about character, location, triggers
   - Verify AI screens for danger signs (meningitis, SAH)

4. **Monitor audit logs**
   - Check for `premature_diagnosis_blocked` events
   - Verify they occur early in conversations
   - Verify they decrease as history accumulates

---

## Files Modified

1. **`api/_aiOrchestrator.ts`** (lines 158-290)
   - Complete rewrite of `CONVERSATION_SYSTEM_PROMPT`
   
2. **`src/core/api/agentCoordinator.ts`** (lines 136-181, 1754-1788)
   - Added `hasAdequateHistoryForDiagnosis()` validation function
   - Modified `ensureProgressiveQuestion()` to block premature diagnosis
   
3. **`src/core/api/agent/invariantAudit.ts`** (lines 1-13, 31-44)
   - Added `'premature_diagnosis_blocked'` event type

---

## Next Steps

1. **Deploy and test** with real patient scenarios
2. **Monitor audit logs** for premature_diagnosis_blocked frequency
3. **Adjust thresholds** if needed:
   - `MIN_QUESTIONS_FOR_DIAGNOSIS` (currently 5)
   - `MIN_HPC_QUESTIONS` (currently 3)
4. **Gather user feedback** on consultation quality
5. **Consider adding** more specific HPC element tracking (onset, character, timing, etc.)

---

## Success Metrics

- ✅ AI completes proper HPC before offering diagnosis
- ✅ AI asks pathophysiology-matched questions
- ✅ AI actively rules in/out differentials
- ✅ AI maintains 2-4 differentials with ICD-10 codes
- ✅ AI considers must-not-miss diagnoses
- ✅ Consultation feels like talking to a real consultant, not a chatbot

