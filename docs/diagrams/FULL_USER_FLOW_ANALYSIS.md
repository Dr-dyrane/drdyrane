# Full User Flow Analysis: Landing → Consultation → Diagnosis → PDF Export

**Date:** 2026-03-14  
**Purpose:** Complete trace of user journey through Dr. Dyrane with focus on response options/suggestions

---

## 🚀 User Flow Overview

### 1. **Landing Page** (`LaunchSpotlightModal.tsx`)

**Entry Point:** User opens the app → sees the Launch Spotlight modal

**Options:**
- **Featured: Scan** - Opens diagnostic scanner (spot diagnosis flow)
- **Consult Room** - Opens step-by-step consultation (clerking flow) ← **Our focus**
- **Drug Protocols** - Opens medication calculator
- **History** - Opens past consultations

**Navigation:** User clicks "Consult Room" → `onNavigate('consult')` → `dispatch({ type: 'SET_VIEW', payload: 'consult' })`

---

### 2. **Consultation View** (`StepRenderer.tsx`)

**Component:** `StepRenderer` renders the main consultation interface

**Key Elements:**
1. **Conversation Transcript** - Shows doctor/patient messages
2. **Response Options Panel** - Suggests answers to help patient respond
3. **Text Input** - Allows custom freeform input
4. **Image Upload** - For visual symptoms

**Flow:**
```
Patient sees doctor's question
  ↓
Response Options Panel shows suggestions
  ↓
Patient can:
  - Click a suggested option
  - Type their own answer
  - Upload an image
  ↓
Input sent to AgentCoordinator
  ↓
AI processes and returns next question
  ↓
Cycle repeats until diagnosis ready
```

---

### 3. **Response Options System** (The "Response Helper")

#### **How It Works:**

**Step 1: Doctor asks a question**
- Example: "How did the fever start - suddenly or gradually?"

**Step 2: Options Engine generates suggestions** (`optionsEngine.ts`)
- Calls `/api/options` endpoint
- Sends: `lastQuestion`, `agentState`, `currentSOAP`
- AI model (using `OPTIONS_SYSTEM_PROMPT`) generates contextual options

**Step 3: Options displayed** (`ResponseOptionsPanel.tsx`)
- UI variants: `stack`, `grid`, `binary`, `segmented`, `scale`, `ladder`, `chips`
- Patient can select or type custom answer

**Step 4: Patient responds**
- Selected option text is sent as patient's answer
- Maintains patient's voice while providing guidance

#### **Current OPTIONS_SYSTEM_PROMPT:**
```
- Keep options atomic (one clinical variable per option)
- Match options tightly to the exact question intent
- Keep options short (2-5 words each) and patient-friendly
- If question is direct yes/no, return yes/no/not sure only
- If question asks severity, return numeric or severity-scale options
- If question asks duration/onset, return timeline options
- Allow custom input where useful
```

#### **Example Flow:**

**Doctor:** "How did the fever start - suddenly or gradually?"

**Options Generated:**
```json
{
  "mode": "single",
  "ui_variant": "segmented",
  "options": [
    { "id": "sudden", "text": "Suddenly", "category": "onset" },
    { "id": "gradual", "text": "Gradually", "category": "onset" },
    { "id": "unsure", "text": "Not sure", "category": "confirmation" }
  ],
  "context_hint": "Choose how symptoms began",
  "allow_custom_input": true
}
```

**Patient clicks:** "Suddenly"  
**Sent as:** "Suddenly" (maintains patient's voice, not robotic)

---

### 4. **Diagnosis Phase** (`PillarCard.tsx`)

**Trigger:** When `state.status === 'complete'` and `state.pillars` exists

**Display:**
- **Diagnosis** with ICD-10 code
- **Management Plan**
- **Investigations** needed
- **Prescriptions** (if applicable)
- **Counseling** points
- **Follow-up** instructions
- **Prognosis**
- **Prevention** advice

**Actions:**
- **Copy Summary** - Copies text to clipboard
- **Export PDF** - Generates printable clinical record
- **Reset** - Starts new consultation

---

### 5. **PDF Export** (`clinicalPdf.ts`)

**Function:** `exportEncounterPdf()`

**Includes:**
- Patient demographics (name, age, sex, weight)
- Diagnosis with ICD-10
- Management plan
- Investigations
- Prescriptions with dosing
- Counseling points
- Follow-up schedule
- Prognosis and prevention

**Format:** Professional clinical document suitable for continuity of care

**Trigger Points:**
1. From `PillarCard` - "Export PDF" button
2. From `BottomNav` - "PDF" action (when consultation complete)
3. From `HistoryView` - Export archived consultation

---

## 🎯 Response Options Alignment with New Clerking System

### **Current State: ✅ GOOD**

The response options system is **already well-designed** to support proper clerking:

1. **Context-Aware:** Options match the question intent (onset, severity, timeline, etc.)
2. **Patient-Friendly:** Short, natural language (not medical jargon)
3. **Flexible:** Allows custom input alongside suggestions
4. **Atomic:** One clinical variable per option (not compound questions)
5. **Maintains Voice:** Patient's selection feels like their own words

### **Potential Improvements:**

#### **1. HPC-Specific Option Sets**

The OPTIONS_SYSTEM_PROMPT could be enhanced to recognize HPC elements:

**Current:** Generic "match question intent"  
**Enhanced:** Recognize specific HPC patterns:
- **Onset:** Sudden, Gradual, Can't remember
- **Character:** Sharp, Dull, Cramping, Burning, Throbbing
- **Radiation:** Stays in one place, Spreads to [location]
- **Timing:** Constant, Comes and goes, Only at [time]
- **Associated symptoms:** Multiple selection of common symptoms
- **Exacerbating factors:** Movement, Food, Stress, etc.
- **Relieving factors:** Rest, Medication, Position change

#### **2. Phase-Aware Suggestions**

Options could adapt based on `agentState.phase`:

- **'intake' phase:** Focus on presenting complaint and duration
- **'assessment' phase:** Focus on HPC elements (onset, character, timing)
- **'differential' phase:** Focus on systematic review, danger signs
- **'resolution' phase:** Focus on confirmation, additional details

---

## 📊 Complete User Journey Example

### **Scenario: Patient with Fever**

```
1. LANDING
   User opens app → Sees Launch Spotlight → Clicks "Consult Room"

2. INTAKE PHASE
   Dr: "What brings you in today?"
   Options: [Fever, Cough, Pain, Rash, Other]
   Patient: Clicks "Fever"

   Dr: "How long have you had fever?"
   Options: [Started today, 1-2 days, 3-4 days, 5-7 days, >1 week]
   Patient: Clicks "3-4 days"

3. ASSESSMENT PHASE (HPC)
   Dr: "How did the fever start - suddenly or gradually?"
   Options: [Suddenly, Gradually, Not sure]
   Patient: Clicks "Suddenly"

   Dr: "Does the fever follow a pattern throughout the day?"
   Options: [Constant, Comes and goes, Worse at night, Worse in morning]
   Patient: Clicks "Worse at night"

   Dr: "What other symptoms came with the fever?"
   Options: [Headache, Body aches, Chills, Vomiting, Diarrhea, None]
   Mode: Multiple selection
   Patient: Selects "Headache" + "Body aches" + "Chills"

   Dr: "Any vomiting, confusion, or difficulty breathing?"
   Options: [None of these, Vomiting, Confusion, Breathing trouble]
   Patient: Clicks "None of these"

   Dr: "Have you been around mosquitoes or in a malaria area?"
   Options: [Yes, No, Not sure]
   Patient: Clicks "Yes" (types: "I live in Lagos")

4. PMH/DH/SH
   Dr: "Have you had similar fever episodes before?"
   Options: [Yes, No, Not sure]
   Patient: Clicks "Yes" (types: "Had malaria last year")

   Dr: "Any chronic conditions like diabetes or hypertension?"
   Options: [None, Diabetes, Hypertension, Other]
   Patient: Clicks "None"

5. DIFFERENTIAL PHASE
   [AI has enough history - 8+ questions, adequate HPC]
   Dr: "Based on your history - 3-day fever with evening chills, night peaks, headache, body aches, mosquito exposure in Lagos, previous malaria - I'm thinking of Malaria (ICD-10: B50.9) as most likely. Would you like the full diagnosis and plan?"
   Options: [Yes, ready for plan, Add one more detail]
   Patient: Clicks "Yes, ready for plan"

6. RESOLUTION (PillarCard)
   Displays:
   - Diagnosis: Malaria (ICD-10: B50.9)
   - Management: Artemether-Lumefantrine, Paracetamol
   - Investigations: Malaria RDT, FBC
   - Counseling: Complete full course, avoid mosquitoes
   - Follow-up: Return if fever persists >3 days
   - Prognosis: Excellent with treatment
   - Prevention: Use mosquito nets, prophylaxis if traveling

7. PDF EXPORT
   Patient clicks "Export PDF"
   → Downloads professional clinical summary
   → Can print or share with other healthcare providers
```

---

## ✅ Conclusion

### **Response Helper Status: WORKING WELL**

The response options system is **already supporting the clerking flow effectively**:

✅ Generates context-aware suggestions  
✅ Maintains patient's natural voice  
✅ Allows custom input alongside suggestions  
✅ Adapts to question type (yes/no, timeline, severity, etc.)  
✅ Provides helpful guidance without being restrictive  

### **Full Flow Status: COMPLETE**

✅ Landing page → Consultation entry  
✅ Consultation → Proper clerking with response helpers  
✅ Diagnosis → Professional pillar card display  
✅ PDF Export → Clinical-grade documentation  

### **Recommended Enhancement:**

Update `OPTIONS_SYSTEM_PROMPT` to be more HPC-aware and phase-aware for even better clerking support.

