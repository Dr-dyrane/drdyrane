# Response Options Enhancement for Improved Clerking

**Date:** 2026-03-14  
**Purpose:** Document the enhancement of the response options system to better support clinical clerking

---

## 🎯 What Was Enhanced

### **File Modified:** `api/_aiOrchestrator.ts`

**Section:** `OPTIONS_SYSTEM_PROMPT` (lines 292-353)

---

## 📋 Changes Made

### **Before: Generic Options Matching**

The previous prompt focused on basic question type matching:
- Yes/no questions → yes/no/not sure
- Severity questions → numeric scale
- Duration questions → timeline options

**Limitation:** Didn't recognize specific HPC (History of Presenting Complaint) patterns

---

### **After: HPC-Aware + Phase-Aware Options**

The enhanced prompt now includes:

#### **1. HPC Pattern Recognition**

Explicitly recognizes and provides appropriate options for all HPC elements:

| HPC Element | Example Question | Suggested Options |
|-------------|------------------|-------------------|
| **Onset** | "How did [symptom] start?" | Suddenly, Gradually, Can't remember |
| **Character** | "What does [pain] feel like?" | Sharp, Dull, Cramping, Burning, Throbbing, Aching, Stabbing |
| **Radiation** | "Does [pain] spread anywhere?" | Stays in one place, Spreads to [location], Moves around |
| **Timing/Pattern** | "When does [symptom] occur?" | Constant, Comes and goes, Only at night, Only in morning, After meals, With activity |
| **Associated Symptoms** | "What other symptoms?" | Multiple selection of common associated symptoms |
| **Exacerbating Factors** | "What makes it worse?" | Movement, Food, Stress, Deep breathing, Lying down, Standing |
| **Relieving Factors** | "What makes it better?" | Rest, Medication, Position change, Food, Nothing helps |
| **Severity** | "How severe?" | Numeric scale 1-10 or Mild, Moderate, Severe, Very severe |
| **Progression** | "Has it changed?" | Getting worse, Getting better, Staying the same, Fluctuating |

#### **2. Phase-Aware Suggestions**

Options now adapt based on the consultation phase:

- **intake phase** → Focus on presenting complaint and duration
- **assessment phase** → Focus on HPC elements (onset, character, timing, associated symptoms)
- **differential phase** → Focus on systematic review, danger signs, specific disease features
- **resolution phase** → Focus on confirmation, additional clarifying details

#### **3. Danger Sign Handling**

Special handling for danger sign questions:
- Recognizes: breathlessness, confusion, chest pain, bleeding, persistent vomiting
- Returns: Multiple selection options with "None of these" as first option
- UI variant: grid for easy scanning

#### **4. Patient-Friendly Language**

Emphasizes:
- No medical jargon
- Short options (2-5 words)
- Natural language that maintains patient's voice
- Always allows custom input for autonomy

---

## 🔄 How It Works in Practice

### **Example 1: Onset Question**

**Doctor:** "How did the fever start - suddenly or gradually?"

**Old System:**
```json
{
  "mode": "single",
  "options": [
    {"text": "Suddenly"},
    {"text": "Gradually"}
  ]
}
```

**New System:**
```json
{
  "mode": "single",
  "ui_variant": "segmented",
  "options": [
    {"text": "Suddenly", "category": "onset"},
    {"text": "Gradually", "category": "onset"},
    {"text": "Can't remember", "category": "onset"}
  ],
  "context_hint": "Choose how symptoms began",
  "allow_custom_input": true
}
```

**Improvement:** ✅ Adds "Can't remember" option, better UI variant, context hint

---

### **Example 2: Character Question**

**Doctor:** "What does the pain feel like?"

**New System:**
```json
{
  "mode": "single",
  "ui_variant": "grid",
  "options": [
    {"text": "Sharp", "category": "character"},
    {"text": "Dull", "category": "character"},
    {"text": "Cramping", "category": "character"},
    {"text": "Burning", "category": "character"},
    {"text": "Throbbing", "category": "character"},
    {"text": "Aching", "category": "character"}
  ],
  "context_hint": "Describe the pain quality",
  "allow_custom_input": true
}
```

**Improvement:** ✅ Comprehensive character options matching clinical terminology

---

### **Example 3: Associated Symptoms**

**Doctor:** "What other symptoms came with the fever?"

**New System:**
```json
{
  "mode": "multiple",
  "ui_variant": "chips",
  "options": [
    {"text": "Headache", "category": "associated"},
    {"text": "Body aches", "category": "associated"},
    {"text": "Chills", "category": "associated"},
    {"text": "Vomiting", "category": "associated"},
    {"text": "Diarrhea", "category": "associated"},
    {"text": "None", "category": "associated"}
  ],
  "context_hint": "Select all that apply",
  "allow_custom_input": true
}
```

**Improvement:** ✅ Multiple selection mode, common associated symptoms for fever

---

### **Example 4: Danger Signs**

**Doctor:** "Any danger signs now: confusion, fainting, breathing trouble, chest pain, persistent vomiting, or bleeding?"

**New System:**
```json
{
  "mode": "multiple",
  "ui_variant": "grid",
  "options": [
    {"text": "None of these", "category": "danger_signs", "priority": 10},
    {"text": "Breathlessness", "category": "danger_signs"},
    {"text": "Confusion", "category": "danger_signs"},
    {"text": "Chest pain", "category": "danger_signs"},
    {"text": "Persistent vomiting", "category": "danger_signs"},
    {"text": "Bleeding", "category": "danger_signs"}
  ],
  "context_hint": "Select any danger signs present",
  "allow_custom_input": true
}
```

**Improvement:** ✅ "None of these" first, multiple selection, grid layout for scanning

---

## ✅ Benefits

### **1. Better Clerking Support**
- Options now match the structured HPC approach
- Helps guide patients through proper history-taking
- Maintains clinical rigor while being patient-friendly

### **2. Maintains Patient Voice**
- Suggestions feel natural, not robotic
- Always allows custom input
- Short, conversational options

### **3. Phase-Appropriate**
- Options adapt to where patient is in consultation
- Supports the intake → assessment → differential → resolution flow
- Aligns with the new clerking enforcement system

### **4. Clinically Comprehensive**
- Covers all HPC elements systematically
- Recognizes danger sign patterns
- Provides appropriate option sets for each clinical context

---

## 🔗 Integration with Clerking System

This enhancement works seamlessly with the improved clerking system:

1. **System Prompt** (`CONVERSATION_SYSTEM_PROMPT`) → Guides AI to ask proper HPC questions
2. **Phase Validation** (`hasAdequateHistoryForDiagnosis`) → Blocks premature diagnosis
3. **Options Engine** (`OPTIONS_SYSTEM_PROMPT`) → Provides HPC-aware suggestions ← **NEW**
4. **Response Panel** (`ResponseOptionsPanel.tsx`) → Displays suggestions beautifully
5. **Patient Input** → Natural, guided, maintains voice

---

## 📊 Expected Impact

- ✅ More structured history-taking
- ✅ Better HPC element coverage
- ✅ Improved patient guidance
- ✅ Maintained patient autonomy (custom input always available)
- ✅ More natural conversation flow
- ✅ Better alignment with clinical clerking standards

---

## 🧪 Testing

Test the enhanced options with these scenarios:

1. **Onset question** → Should suggest "Suddenly", "Gradually", "Can't remember"
2. **Character question** → Should suggest pain descriptors (Sharp, Dull, Cramping, etc.)
3. **Associated symptoms** → Should allow multiple selection
4. **Danger signs** → Should show "None of these" first with multiple selection
5. **Severity** → Should show numeric scale or severity ladder
6. **Timeline** → Should show duration options (started today, 1-2 days, etc.)

---

## 📝 Summary

The response options system is now **HPC-aware and phase-aware**, providing better support for proper clinical clerking while maintaining the patient's natural voice. This complements the improved system prompt and phase validation to create a comprehensive clerking enforcement system.

