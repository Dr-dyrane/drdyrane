# Dr. Dyrane Core Dataset Blueprint

## Goal
Build a serious diagnostic engine with a **small, high-yield medical brain first**, then expand safely.

The right move is **not** to start with 1,000 diseases at once.
Start with a **Core 150–250 disease layer** that covers the majority of common and dangerous presentations, then expand to 500+, then 1,000.

---

## Recommended Build Phases

### Phase 1 — Core Emergency + Common Disease Set (150–250)
Covers most primary care, urgent care, and ER-style triage patterns.

Buckets:
- Infectious diseases
- Cardiovascular emergencies
- Respiratory diseases
- GI/hepatobiliary diseases
- Renal/urinary diseases
- Neurologic diseases
- Endocrine/metabolic diseases
- Hematologic diseases
- Rheumatologic/autoimmune diseases
- Dermatologic conditions
- OB/GYN conditions
- Pediatric high-yield illnesses
- Toxicology / drug-related states
- Psychiatric presentations

### Phase 2 — Extended General Medicine Layer (250–500)
Add less common but important hospital and outpatient conditions.

### Phase 3 — Specialist Enrichment Layer (500–1000)
Add rarer diseases, atypical variants, syndromes, tropical diseases, oncology detail, and edge-case presentations.

---

## Core Data Model
Each disease should be one structured object.

### Minimal disease schema
```json
{
  "id": "disease_malaria",
  "name": "Malaria",
  "category": ["infectious", "tropical"],
  "description": "Parasitic infection transmitted by Anopheles mosquitoes.",
  "chief_complaint_engines": ["fever", "weakness", "vomiting", "altered_mental_status"],
  "danger_level": "high",
  "must_not_miss": true,
  "pretest_context": {
    "age_groups": ["child", "adult"],
    "sex": ["all"],
    "regions": ["endemic_region"],
    "risk_factors": ["mosquito_exposure", "travel_to_endemic_area"]
  },
  "time_course": ["acute", "subacute"],
  "key_symptoms": [
    {"name": "fever", "weight": 10},
    {"name": "chills", "weight": 8},
    {"name": "sweating", "weight": 7},
    {"name": "headache", "weight": 6},
    {"name": "myalgia", "weight": 5},
    {"name": "vomiting", "weight": 5}
  ],
  "key_negatives": [
    {"name": "localized_chest_pain", "penalty": 3},
    {"name": "productive_cough", "penalty": 2}
  ],
  "exam_signs": [
    {"name": "fever", "weight": 5},
    {"name": "pallor", "weight": 3},
    {"name": "splenomegaly", "weight": 4}
  ],
  "red_flags": ["altered_consciousness", "jaundice", "persistent_vomiting", "respiratory_distress"],
  "suggested_questions": [
    "How long have you had the fever?",
    "Do you have chills or rigors?",
    "Any mosquito exposure or travel?",
    "Any vomiting or confusion?"
  ],
  "differentials": ["typhoid_fever", "viral_febrile_illness", "sepsis", "meningitis"],
  "tests": ["malaria_rdt", "blood_smear", "cbc"],
  "initial_management": ["oral_hydration", "antipyretic", "urgent_assessment_if_red_flags"],
  "triage_rules": {
    "urgent_if": ["altered_consciousness", "unable_to_drink", "seizure", "severe_weakness"]
  }
}
```

---

## Supporting Tables You Need
Do **not** store only diseases. Store reusable linked entities.

### 1. Symptoms table
```json
{
  "id": "symptom_fever",
  "name": "Fever",
  "aliases": ["high temperature", "hot body"],
  "type": "symptom"
}
```

### 2. Signs table
```json
{
  "id": "sign_jaundice",
  "name": "Jaundice",
  "type": "sign"
}
```

### 3. Risk factors table
```json
{
  "id": "risk_mosquito_exposure",
  "name": "Mosquito exposure",
  "type": "risk_factor"
}
```

### 4. Tests table
```json
{
  "id": "test_malaria_rdt",
  "name": "Malaria rapid diagnostic test",
  "type": "test"
}
```

### 5. Chief complaint engines table
```json
{
  "id": "engine_fever",
  "name": "Fever Engine"
}
```

---

## The 12 Chief Complaint Engines
These should sit above the disease layer.

1. Fever
2. Chest pain
3. Shortness of breath
4. Headache
5. Abdominal pain
6. Vomiting / nausea
7. Diarrhea
8. Rash
9. Joint pain
10. Weakness / fatigue
11. Bleeding
12. Altered mental status

Each engine should map to:
- high-danger diagnoses
- common diagnoses
- next-best questions
- escalation rules

---

## Must-Have Global Fields
Every disease should include these:
- `danger_level`
- `must_not_miss`
- `time_course`
- `key_symptoms`
- `key_negatives`
- `risk_factors`
- `red_flags`
- `suggested_questions`
- `differentials`
- `tests`
- `initial_management`
- `triage_rules`

Without these, the engine will feel shallow.

---

## Scoring Model
Start with a transparent weighted model before ML.

### Example scoring formula
```python
score = 0
score += sum(weights for matched key symptoms)
score += sum(weights for matched exam signs)
score += sum(weights for matched risk factors)
score -= sum(penalties for conflicting symptoms)
score += time_course_bonus
score += epidemiology_bonus
score -= strong_negative_penalty
```

Then convert scores into bands:
- High likelihood
- Medium likelihood
- Low likelihood

Also keep a separate boolean path for:
- dangerous diagnosis present?
- emergency escalation needed?

---

## Triage Layer
This must run before diagnosis ranking.

### Universal red flags
- altered mental status
- severe respiratory distress
- chest pain with collapse
- seizures
- uncontrolled bleeding
- persistent vomiting with inability to retain fluids
- severe dehydration
- focal neurologic deficit
- shock features

If present, system should shift from “diagnostic mode” to “urgent care escalation mode.”

---

## Core 200 Disease Starter Buckets

### Infectious
- Malaria
- Typhoid fever
- Viral upper respiratory infection
- Influenza
- COVID-like viral illness
- Pneumonia
- Tuberculosis
- Acute gastroenteritis
- Meningitis
- Sepsis
- Cellulitis
- UTI
- Pyelonephritis
- Dengue
- Hepatitis
- HIV-related febrile illness

### Cardiovascular
- Acute coronary syndrome
- Stable angina
- Heart failure
- Hypertensive urgency
- Hypertensive emergency
- Pericarditis
- Aortic dissection
- Arrhythmia / AF with RVR
- DVT
- Pulmonary embolism

### Respiratory
- Asthma exacerbation
- COPD exacerbation
- Pneumothorax
- Pleural effusion
- Bronchitis
- URTI

### GI / Hepatobiliary
- GERD
- Gastritis
- Peptic ulcer disease
- GI bleed
- Appendicitis
- Pancreatitis
- Cholecystitis
- Biliary colic
- Hepatitis
- Intestinal obstruction
- Peritonitis
- Hemorrhoids

### Renal / Urinary
- Cystitis
- Pyelonephritis
- Renal colic
- Acute kidney injury
- Chronic kidney disease flare

### Neurologic
- Migraine
- Tension headache
- Cluster headache
- Stroke
- TIA
- Meningitis
- Seizure disorder
- Syncope
- Peripheral neuropathy
- Bell palsy

### Endocrine / Metabolic
- Hypoglycemia
- Hyperglycemia
- DKA
- HHS
- Hypothyroidism
- Hyperthyroidism
- Adrenal crisis
- Dehydration
- Electrolyte imbalance

### Hematology
- Iron deficiency anemia
- Hemolytic anemia
- Sickle cell crisis
- Leukemia presentation
- Thrombocytopenia

### Rheum / Autoimmune
- Rheumatoid arthritis
- SLE
- Gout
- Osteoarthritis
- Vasculitis
- Reactive arthritis

### Dermatology
- Urticaria
- Eczema flare
- Contact dermatitis
- Drug rash
- Herpes zoster
- Fungal skin infection
- Scabies

### OB/GYN
- Ectopic pregnancy
- PID
- Dysmenorrhea
- Fibroids
- Miscarriage
- Hyperemesis gravidarum
- Preeclampsia red-flag pathway

### Pediatrics
- Malaria in child
- Pneumonia in child
- Diarrheal dehydration
- Febrile seizure
- Otitis media
- Measles pattern

### Toxicology / Iatrogenic
- Drug overdose
- Alcohol intoxication
- NSAID gastritis
- Drug-induced hepatitis
- Steroid complications

### Psychiatry / Functional
- Panic attack
- Depression
- Somatization pattern
- Acute psychosis

---

## Example Starter Records

### 1. Malaria
```json
{
  "id": "malaria",
  "name": "Malaria",
  "chief_complaint_engines": ["fever", "weakness", "vomiting"],
  "danger_level": "high",
  "must_not_miss": true,
  "time_course": ["acute", "subacute"],
  "key_symptoms": [
    {"name": "fever", "weight": 10},
    {"name": "chills", "weight": 8},
    {"name": "sweating", "weight": 8},
    {"name": "headache", "weight": 6},
    {"name": "myalgia", "weight": 5},
    {"name": "vomiting", "weight": 5}
  ],
  "risk_factors": [
    {"name": "mosquito_exposure", "weight": 8},
    {"name": "endemic_region", "weight": 9}
  ],
  "red_flags": ["confusion", "seizure", "jaundice", "respiratory_distress"],
  "tests": ["malaria_rdt", "blood_smear", "cbc"]
}
```

### 2. Pneumonia
```json
{
  "id": "pneumonia",
  "name": "Pneumonia",
  "chief_complaint_engines": ["fever", "shortness_of_breath", "chest_pain"],
  "danger_level": "high",
  "must_not_miss": true,
  "time_course": ["acute", "subacute"],
  "key_symptoms": [
    {"name": "fever", "weight": 8},
    {"name": "productive_cough", "weight": 10},
    {"name": "pleuritic_chest_pain", "weight": 7},
    {"name": "dyspnea", "weight": 8},
    {"name": "fatigue", "weight": 4}
  ],
  "exam_signs": [
    {"name": "crackles", "weight": 8},
    {"name": "tachypnea", "weight": 6}
  ],
  "tests": ["chest_xray", "cbc", "pulse_oximetry"]
}
```

### 3. Acute Coronary Syndrome
```json
{
  "id": "acute_coronary_syndrome",
  "name": "Acute Coronary Syndrome",
  "chief_complaint_engines": ["chest_pain", "shortness_of_breath", "weakness"],
  "danger_level": "critical",
  "must_not_miss": true,
  "time_course": ["hyperacute", "acute"],
  "key_symptoms": [
    {"name": "central_chest_pressure", "weight": 10},
    {"name": "exertional_pain", "weight": 8},
    {"name": "radiation_to_arm_or_jaw", "weight": 9},
    {"name": "diaphoresis", "weight": 8},
    {"name": "nausea", "weight": 5}
  ],
  "risk_factors": [
    {"name": "hypertension", "weight": 4},
    {"name": "diabetes", "weight": 5},
    {"name": "smoking", "weight": 5},
    {"name": "older_age", "weight": 6}
  ],
  "tests": ["ecg", "troponin", "vitals"]
}
```

---

## Best Build Order
1. Define your universal schema.
2. Build the 12 complaint engines.
3. Add the first 50 must-not-miss diseases.
4. Add the next 100 common diseases.
5. Build weighted scoring.
6. Add dynamic questioning.
7. Add red-flag triage.
8. Expand to 250 diseases.
9. Then expand to 500+.

---

## What Not to Do
- Do not start with free-text chaos only.
- Do not store diseases as plain paragraphs.
- Do not skip red-flag triage.
- Do not pretend certainty when probability is low.
- Do not let treatment output outrun safety escalation.

---

## What You Want Dr. Dyrane to Feel Like
Not a symptom checker.
A structured clinical mind that:
- listens
- narrows
- ranks
- warns
- asks the next best question

That is the difference.

## Next Best Step
Turn this into:
1. a JSON schema,
2. a seed dataset of 100 diseases,
3. and a reasoning pseudocode engine.

