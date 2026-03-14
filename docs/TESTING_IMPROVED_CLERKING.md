# Testing Guide: Improved Clinical Clerking System

**Date:** 2026-03-14  
**Purpose:** Verify that Dr. Dyrane now behaves like a true consultant conducting proper clinical clerking

---

## Quick Test Scenarios

### Test 1: Fever Presentation (Malaria Suspicion)

**Patient Input:** "I have fever for 3 days"

**Expected AI Behavior:**
1. ✅ Acknowledges fever and duration
2. ✅ Asks about onset (sudden vs gradual)
3. ✅ Asks about fever pattern (constant vs intermittent, time of day)
4. ✅ Asks about associated symptoms (chills, headache, vomiting, etc.)
5. ✅ Asks about mosquito exposure (epidemiology)
6. ✅ Asks about danger signs (confusion, breathlessness, etc.)
7. ✅ Asks about previous similar episodes (PMH)
8. ✅ Only offers diagnosis after 5+ questions minimum

**Red Flags (Should NOT happen):**
- ❌ "Would you like your working diagnosis and plan?" after 1-2 questions
- ❌ Skipping HPC elements (onset, pattern, associated symptoms)
- ❌ Not asking about malaria-specific features in Nigeria context

---

### Test 2: Abdominal Pain Presentation

**Patient Input:** "I have stomach pain since yesterday"

**Expected AI Behavior:**
1. ✅ Asks about location (which part of abdomen)
2. ✅ Asks about character (sharp, dull, cramping, burning)
3. ✅ Asks about radiation (does it spread anywhere)
4. ✅ Asks about timing (constant vs colicky)
5. ✅ Asks about relationship to food/bowel movements
6. ✅ Asks about associated symptoms (vomiting, diarrhea, fever)
7. ✅ Asks about exacerbating/relieving factors
8. ✅ Screens for surgical red flags (peritonitis, obstruction)

**Red Flags:**
- ❌ Offering diagnosis without asking about location and character
- ❌ Not considering surgical vs medical causes
- ❌ Missing red flag screening

---

### Test 3: Headache Presentation (Danger Sign Screening)

**Patient Input:** "I have severe headache"

**Expected AI Behavior:**
1. ✅ Asks about onset (sudden = thunderclap = SAH red flag)
2. ✅ Asks about location and character
3. ✅ Asks about associated symptoms (fever, neck stiffness, photophobia)
4. ✅ Screens for danger signs (confusion, seizures, focal weakness)
5. ✅ Asks about triggers (stress, food, sleep)
6. ✅ Asks about previous similar headaches
7. ✅ Considers must-not-miss: meningitis, SAH, space-occupying lesion

**Red Flags:**
- ❌ Not screening for sudden onset (SAH)
- ❌ Not screening for meningitis features
- ❌ Offering diagnosis without danger sign assessment

---

### Test 4: Chest Pain Presentation (Emergency Screening)

**Patient Input:** "I have chest pain"

**Expected AI Behavior:**
1. ✅ Immediately assesses character (crushing, sharp, burning)
2. ✅ Asks about radiation (arm, jaw, back)
3. ✅ Asks about associated symptoms (breathlessness, sweating, nausea)
4. ✅ Asks about exertion relationship
5. ✅ Screens for MI red flags
6. ✅ Considers PE, pneumothorax, GERD differentials
7. ✅ May escalate to emergency status if red flags present

**Red Flags:**
- ❌ Not prioritizing cardiac vs non-cardiac causes
- ❌ Missing MI red flag screening
- ❌ Not considering PE in differential

---

## How to Test

### Option 1: Manual Testing in Browser
1. Start the development server: `npm run dev`
2. Open the app in browser
3. Start a new consultation
4. Enter one of the test scenarios above
5. Observe the AI's questions and flow
6. Count how many questions before diagnosis is offered
7. Check if proper HPC elements are covered

### Option 2: Check Audit Logs
1. Open browser console (F12)
2. Look for `premature_diagnosis_blocked` events
3. These should appear if AI tries to offer diagnosis too early
4. Verify the system is blocking premature diagnosis

### Option 3: Review Conversation History
1. Complete a full consultation
2. Go to History view
3. Review the conversation transcript
4. Verify proper clerking structure was followed
5. Check that SOAP notes are properly populated

---

## Success Criteria

### Minimum Requirements
- [ ] AI asks at least 5 questions before offering diagnosis
- [ ] AI covers key HPC elements: onset, character, associated symptoms
- [ ] AI asks about danger signs before finalizing
- [ ] AI maintains 2-4 differentials with ICD-10 codes
- [ ] AI matches questions to disease pathophysiology

### Ideal Behavior
- [ ] AI follows proper clerking order: PC → HPC → PMH → systematic review
- [ ] AI actively rules in/out differentials based on answers
- [ ] AI considers must-not-miss diagnoses
- [ ] AI uses epidemiological context (Nigeria = malaria, typhoid, TB)
- [ ] Conversation feels natural, not robotic
- [ ] AI doesn't repeat questions
- [ ] AI pivots appropriately when patient gives new information

---

## Troubleshooting

### If AI still offers diagnosis too early:
1. Check browser console for `premature_diagnosis_blocked` events
2. If events are NOT appearing, the validation may not be triggering
3. Check that `WORKING_DIAGNOSIS_PATTERN` regex matches the AI's question
4. Consider lowering thresholds in `agentCoordinator.ts`:
   - `MIN_QUESTIONS_FOR_DIAGNOSIS` (currently 5)
   - `MIN_HPC_QUESTIONS` (currently 3)

### If AI asks too many questions:
1. This is actually GOOD for proper clerking
2. But if excessive (>15 questions), check phase progression
3. Verify AI is moving from 'assessment' to 'differential' phase
4. Check that SOAP notes are being populated

### If AI repeats questions:
1. This should be blocked by existing repetition guards
2. Check console for `duplicate_question_blocked` events
3. Verify the repetition guard is working
4. May need to adjust `CONSULT_RELAXED_GUARDS_MODE`

---

## Monitoring Metrics

Track these over time:
1. **Average questions before diagnosis:** Should be 8-12 for typical cases
2. **Premature diagnosis blocks:** Should decrease as prompt learning improves
3. **SOAP completeness:** S section should have 5+ entries before diagnosis
4. **Differential quality:** Should maintain 2-4 differentials with ICD-10
5. **User satisfaction:** Qualitative feedback on consultation quality

---

## Example Good Consultation Flow

```
Turn 1:
Patient: "I have fever for 3 days"
AI: "Fever for 3 days noted. How did it start - suddenly or gradually?"

Turn 2:
Patient: "Suddenly, yesterday evening"
AI: "Sudden onset noted. Does the fever follow a pattern throughout the day?"

Turn 3:
Patient: "Yes, it comes with chills in the evening and peaks at night"
AI: "Evening chills with night fever noted. What other symptoms came with it?"

Turn 4:
Patient: "Headache and body aches"
AI: "Headache and body aches noted. Any vomiting, confusion, or difficulty breathing?"

Turn 5:
Patient: "No, none of those"
AI: "Good, no danger signs. Have you been around mosquitoes or in a malaria area?"

Turn 6:
Patient: "Yes, I live in Lagos"
AI: "Lagos noted - malaria endemic area. Have you had similar fever episodes before?"

Turn 7:
Patient: "Yes, last year I had malaria"
AI: "Previous malaria noted. Any chronic conditions like diabetes or hypertension?"

Turn 8:
Patient: "No chronic conditions"
AI: "Based on your history - 3-day fever with evening chills, night peaks, headache, body aches, mosquito exposure in Lagos, previous malaria - I'm thinking of Malaria (ICD-10: B50.9) as most likely. Would you like the full diagnosis and treatment plan?"
```

**Analysis:** ✅ 8 questions, proper HPC, PMH covered, pathophysiology-matched questions, appropriate timing for diagnosis offer.

---

## Report Issues

If you find the AI is still not clerking properly:
1. Save the conversation transcript
2. Note which HPC elements were skipped
3. Note how many questions before diagnosis was offered
4. Check browser console for any errors
5. Report with specific examples for further tuning

