# Why the Previous Restrictive Approach Failed

**Date:** 2026-03-14  
**Purpose:** Document the failures of the initial restrictive approach to prevent repeating mistakes

---

## 🚫 The Failed Approach: Over-Restriction

### **What Was Tried:**

The initial attempt to enforce proper clinical clerking used **hard programmatic restrictions** that tried to force the AI into a rigid structure:

1. **Strict phase gates** - AI couldn't move to next phase without completing exact checklist
2. **Hard-coded question sequences** - Predefined question order that AI had to follow
3. **Blocking all flexibility** - No ability to adapt to patient's natural flow
4. **Forced template responses** - AI had to use specific question templates

### **Example of Restrictive Code (Conceptual):**

```typescript
// FAILED APPROACH - Too restrictive
if (phase === 'intake' && !hasExactPC()) {
  return FORCED_PC_QUESTION; // No flexibility
}

if (phase === 'hpc' && hpcElements.length < 9) {
  return NEXT_HPC_TEMPLATE[hpcElements.length]; // Robotic
}

if (conversationTurns < 15) {
  blockDiagnosis(); // Arbitrary hard limit
}
```

---

## ❌ Why It Failed

### **1. Felt Like a Survey, Not a Consultation**

**Problem:**
- Questions felt robotic and templated
- No natural conversation flow
- Patient couldn't tell their story naturally
- AI couldn't adapt to context

**User Experience:**
```
❌ BAD (Restrictive):
Dr: "What is your presenting complaint?"
Patient: "I have fever and headache"
Dr: "Duration of presenting complaint?"
Patient: "3 days"
Dr: "Onset of presenting complaint - sudden or gradual?"
Patient: "Sudden"
Dr: "Character of presenting complaint?"
Patient: "???" (doesn't make sense for fever)
```

**Why it failed:** Rigid template didn't adapt to symptom type

---

### **2. Blocked AI's Clinical Reasoning**

**Problem:**
- AI couldn't follow clinical intuition
- Couldn't pursue red flags immediately
- Couldn't adapt questioning based on answers
- Lost the "consultant gestalt"

**Example:**
```
❌ BAD (Restrictive):
Patient: "I have severe chest pain radiating to my left arm and jaw, 
         with sweating and breathlessness"
         
Dr: [BLOCKED from asking about cardiac risk factors because 
     "must complete HPC first"]
     
Dr: "What makes the pain worse?" [Following rigid HPC template]
```

**Why it failed:** Dangerous - couldn't prioritize urgent assessment

---

### **3. Arbitrary Hard Limits**

**Problem:**
- Fixed minimum question counts (e.g., "must ask 15 questions")
- Didn't account for simple vs complex cases
- Some diagnoses obvious in 3 questions, others need 20+

**Example:**
```
❌ BAD (Restrictive):
Patient: "I stepped on a rusty nail 2 hours ago, it went deep, 
         I haven't had tetanus shot in 10 years"
         
Dr: [BLOCKED from offering diagnosis because only 1 question asked]
     
Dr: "Tell me about your past medical history..." [Unnecessary delay]
```

**Why it failed:** Obvious diagnosis (tetanus prophylaxis needed) delayed by arbitrary rules

---

### **4. Lost Patient's Natural Voice**

**Problem:**
- Forced patients into medical terminology
- Couldn't handle natural storytelling
- Broke conversational flow

**Example:**
```
❌ BAD (Restrictive):
Patient: "My stomach has been killing me since I ate that street food 
         yesterday evening, and I've been running to the toilet all night"
         
Dr: [System tries to parse into rigid SOAP categories, fails]
     
Dr: "Please describe your presenting complaint" [Ignoring rich context]
```

**Why it failed:** Patient already gave excellent history, but system couldn't process it

---

### **5. Couldn't Handle Edge Cases**

**Problem:**
- Multiple presenting complaints broke the system
- Vague symptoms didn't fit templates
- Chronic vs acute presentations confused the logic

**Example:**
```
❌ BAD (Restrictive):
Patient: "I've had on-and-off headaches for months, but this week 
         they're much worse, and now I'm seeing flashing lights"
         
Dr: [System confused - is PC "headache" or "visual disturbance"?]
     [Duration is "months" or "this week"?]
     
Dr: [Returns generic fallback question, loses clinical thread]
```

**Why it failed:** Real clinical presentations are messy, not template-friendly

---

## ✅ The Successful Approach: Flexible Guardrails

### **What Works:**

Instead of **forcing** structure, we now **guide** toward structure with **soft enforcement**:

1. **Enhanced System Prompt** - Teaches AI proper clerking through instruction, not code
2. **Minimum Thresholds** - Soft minimums (5 questions, 3 HPC elements) not hard sequences
3. **Phase Awareness** - AI knows what phase it's in, but can adapt within phase
4. **Programmatic Blocks** - Only block **premature diagnosis**, not question flow
5. **Natural Conversation** - AI can follow patient's story while gathering structured data

### **Example of Flexible Code:**

```typescript
// ✅ SUCCESSFUL APPROACH - Flexible guardrails
function hasAdequateHistoryForDiagnosis(conversation, soap, agentState) {
  // Soft minimums, not hard sequences
  const questionCount = conversation.filter(m => m.role === 'doctor').length;
  const hpcElements = countHPCElements(soap);
  
  // Allow flexibility - different cases need different depth
  if (questionCount < 5) return false; // Too early
  if (hpcElements < 3) return false; // Insufficient detail
  
  // But don't force exact sequence or count
  return true; // AI can proceed when clinically appropriate
}

// Only block premature diagnosis, not question flow
if (isDiagnosisQuestion(question) && !hasAdequateHistory()) {
  return fallbackQuestion(); // Redirect, don't break
}
```

---

## 📊 Comparison Table

| Aspect | ❌ Restrictive Approach | ✅ Flexible Guardrails |
|--------|------------------------|----------------------|
| **Question Flow** | Hard-coded sequence | AI-driven, context-aware |
| **Minimum Questions** | Fixed count (e.g., 15) | Soft minimum (5+) |
| **HPC Coverage** | Must ask all 9 elements | Must capture 3+ key elements |
| **Phase Transitions** | Forced checklist completion | Natural progression with validation |
| **Red Flag Handling** | Blocked by phase rules | Can prioritize immediately |
| **Patient Story** | Interrupted by templates | Flows naturally |
| **Diagnosis Timing** | Arbitrary turn count | Clinical adequacy check |
| **Edge Cases** | Breaks or falls back | Adapts gracefully |

---

## 🎯 Key Lessons Learned

### **1. Trust the AI, Guide Don't Force**
- Modern LLMs can follow complex instructions
- System prompt > programmatic restrictions
- Teach clinical reasoning, don't hard-code it

### **2. Soft Minimums > Hard Sequences**
- "At least 5 questions" > "Exactly these 15 questions"
- "Cover 3+ HPC elements" > "Ask all 9 in order"
- Allows flexibility while maintaining quality

### **3. Block Outcomes, Not Process**
- ✅ Block: Premature diagnosis
- ❌ Don't block: Question order, phrasing, exploration

### **4. Clinical Context Matters**
- Simple cases: 3-5 questions sufficient
- Complex cases: 15-20 questions needed
- Urgent cases: Prioritize danger signs first
- Let AI adapt to context

### **5. Patient Experience First**
- Natural conversation > rigid templates
- Story flow > checklist completion
- Consultant feel > survey feel

---

## 🔄 Migration Path

**From:** Restrictive hard-coded sequences  
**To:** Flexible AI-guided clerking with programmatic safety nets

**Key Changes:**
1. Removed hard-coded question templates
2. Removed forced phase progression checklists
3. Removed arbitrary turn count limits
4. Added enhanced system prompt with clinical reasoning
5. Added soft minimum thresholds (5 questions, 3 HPC elements)
6. Added premature diagnosis blocking only
7. Kept phase awareness for context, not enforcement

---

## 💡 Remember This

**The goal is not to restrict the AI into being a good doctor.**  
**The goal is to teach the AI to be a good doctor, then trust it.**

**Guardrails should prevent bad outcomes (premature diagnosis), not dictate good process (question order).**

---

## 📝 Summary

The restrictive approach failed because it:
- ❌ Felt robotic and survey-like
- ❌ Blocked clinical reasoning and adaptation
- ❌ Used arbitrary hard limits
- ❌ Lost patient's natural voice
- ❌ Couldn't handle real-world complexity

The flexible approach succeeds because it:
- ✅ Guides through instruction, not force
- ✅ Uses soft minimums, not hard sequences
- ✅ Blocks bad outcomes, not good process
- ✅ Maintains natural conversation flow
- ✅ Adapts to clinical context

**Never forget:** Real consultations are conversations, not checklists.

