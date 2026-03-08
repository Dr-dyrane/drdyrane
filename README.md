# 🩺 Dr. Dyrane: The Digital Consultant — Project Bible

**Mission Statement:** To bridge the gap between patient symptom and pathophysiological reality through a frictionless, empathetic, and mathematically rigorous clinical engine. "Dr. Dyrane" is not a chatbot; it is a Digital Registrar that operates with the clinical gestalt of a Senior Consultant.

---

## I. The Manifesto: Visual Physics & Empathy

The interface must induce zero visual cognitive load. We eliminate borders, rings, and traditional forms to create a breathing, "borderless" clinical environment. Every UI decision is an act of calculated empathy for a patient in distress.

### 🎨 The "Cyber-Medical" Design System

* **Background:** Onyx (`#000000`). No gradients. Infinite depth.
* **Typography:** Pure White (`#FFFFFF`) for primary text. Sans-serif (Inter or SF Pro).
* **The Empathic Accent:** Neon Cyan (`#00F5FF`). Represents the balance of analytical logic and human vitality. Used strictly for the "Pulse" (Orb), critical status indicators, and active actions.
* **Emergency State:** Neon Red (`#FF3131`).
* **The Glassmorphism Engine:**
* **Containers:** `background: rgba(255, 255, 255, 0.03)` with `backdrop-filter: blur(25px)`.
* **Depth (No Borders):** Elements are separated exclusively by shadow and light. `box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8)`.
* **Active State:** No focus rings. Active elements increase their inner-glow and blur-radius, lifting physically toward the user.



---

## II. The UX Flow: Frictionless Progressive Disclosure

We reject the "Chat Interface" and the "Static Form." The UX is a **Generative UI**—a living document that morphs based on the clinical necessity of the current moment.

### The "Single-Pulse" Architecture

* **The Intake:** The screen displays a single, borderless "Consultant Orb" pulsing softly with a Neon Cyan outer glow (`box-shadow: 0 0 15px rgba(0, 245, 255, 0.6)`). The prompt simply reads: *"Tell me what's happening."*
* **The Shift:** Upon input (voice/text), the Orb moves to the top-center.
* **Progressive Disclosure:** The engine asks **exactly one** high-impact question at a time.
* **Touch Targets:** Answers appear as massive, floating frosted-glass panels (>60px tall). Tapping a panel deepens its shadow, confirms the input, dissolves the current question, and fades in the next. Transitions are strictly **dissolve/fade**, never slide.

---

## III. The Clinical Engine: "Under the Table" Logic

While the user experiences a frictionless visual flow, the engine executes a rigorous, multi-dimensional clinical proof using **Anthropic Claude 3.5 Sonnet**.

### 🧠 The 4-Step Algorithmic Loop

1. **Solve (Recursive SOAP):** The engine silently maps arbitrary user input to Subjective (SOCRATES/OPQRST) and Objective data points.
2. **Prove (Mathematical Induction):** Every new answer must statistically narrow the Differential Diagnosis (DDx). The loop runs until $P(Diagnosis) > 95\%$ or a red flag triggers.
3. **Analyze (Efficiency):** The algorithm heuristically prunes the "clerkship." (e.g., if "Melena" is confirmed, instantly prune all Upper-GI pathophysiology).
4. **Communicate (The 4 Pillars):** Output the final resolution via Evidence-Based Medicine (EBM), filtered by the patient's specific constraints (allergies, comorbidities).

---

## IV. Investigation & Vision System (The Lens)

When text is insufficient, the app expands into the physical world. The device becomes a clinical sensor array.

### 1. Visual Investigation (Optical Biomarkers)

* **The Viewfinder:** The Neon Cyan Orb expands into a frosted glass lens.
* **Dermatological Capture:** High-fidelity imaging of rashes, ulcers, or lesions. AI analyzes morphology, margins (demarcated vs. diffuse), and vascularity.
* **Ocular/Facies Scan:** Detection of Icterus (Jaundice), Pallor (Anemia), or Stroke/Neurological drooping.
* **Kinetic Analysis:** Video-based gait and hand tremor detection using the phone’s gyroscope and camera.

### 2. Diagnostic Ingestion (OCR Bridge)

* **Lab Report Parsing:** Photo-extraction of WBC, CRP, Electrolytes, and HbA1c from paper results.
* **Radiology Interpretation:** Parsing text conclusions from X-rays, CTs, and MRIs to provide structural proof.
* **Pharmacological Audit:** Scanning pill bottles to identify current meds and prevent prescription collision in the Management pillar.

---

## V. The Guardian Agent (Surgical Triage)

The first layer of code is a **Red-Flag Interceptor**.

* **Logic:** Continuous background scanning for "Must-Not-Miss" pathophysiology (Ischemia, Peritonism, Obstruction, Sepsis).
* **Action:** If triggered, the Orb turns **Neon Red (#FF3131)**, standard clerking aborts.
* **Geospatial Integration:** Triggers Browser Geolocation + Maps API to locate the nearest Emergency Department.
* **Handoff:** Generates an **SBAR (Situation, Background, Assessment, Recommendation)** report for the patient to show emergency staff.

---

## VI. Technical Architecture (Base44 / React)

The codebase must be zero-cog: feature-first, atomic, and strictly separated.

* **Stack:** React SPA, Tailwind CSS, Base44 Backend/Entities, Anthropic AI.
* **State Management:** React Context + `useReducer` (State Machine).

### 📂 Folder Structure

```text
/src
  /api
    /dr-dyrane.ts       <-- Base44 Backend Proxy for Claude AI
  /context
    /ClinicalContext.tsx <-- Heart: Recursive SOAP State Machine
  /features
    /consultant
      /Orb.tsx          <-- Pulse & State Visualizer
      /TheLens.tsx      <-- Viewfinder & Artifact Capture (OCR/Image)
      /StepRenderer.tsx <-- Progressive Disclosure Logic
    /output
      /PillarCard.tsx   <-- 4-Pillar Glass Cards
  /services
    /triage.ts          <-- Red-Flag & Geospatial Logic
  /theme
    /physics.css        <-- Glassmorphism & Shadow Tokens

```

### 🗄️ Base44 Entity Schema

* **`ConsultationSession`**: `{ session_id, soap_state (JSON), ddx_state (JSON), status, red_flag_triggered, pillar_output (JSON), user_id (optional) }`
* **`ClinicalArtifact`**: `{ artifact_type (IMAGE/OCR), raw_url, ai_interpretation, clinical_weight }`

---

## VII. The Prompt Engineering Bible

**System Prompt Instructions for Claude 3.5 Sonnet:**

* **Role:** Senior Clinical Registrar.
* **Tone:** Authoritative, professional, zero filler. No "I'm sorry" or "Based on your input."
* **Protocol:** Rule out Red Flags first. Ask **one** question. If a physical sign is needed, return `view: "LENS"`.
* **Output:** Strictly JSON.

```json
{
  "soap_state": { "S": {}, "O": {}, "A": {}, "P": {} },
  "confidence": 0.85,
  "red_flag": false,
  "ui_display": {
    "question": "Is the pain sharp or dull?",
    "options": ["Sharp", "Dull", "Cramping"],
    "lens_trigger": null
  }
}

```

---

## VIII. Identity & Authentication

* **Anonymous:** Full consultation functionality. Session data is ephemeral (Session Storage).
* **Auth (Optional):** After the 4-Pillar output, users can "Save to Vault."
* **History View:** Authenticated users see past frosted-glass cards of reports sorted by date and prognosis status.

---

## IX. The "Dr. Dyrane" Prohibitions (The Laws)

* ❌ **NO** Chat bubbles or "typing..." indicators.
* ❌ **NO** Borders, focus rings, or form outlines.
* ❌ **NO** Multiple questions per screen.
* ❌ **NO** Loading spinners (use Orb pulse modulation).
* ❌ **NO** Hardcoded diagnoses (all DDx is inductive).
* ❌ **NO** Forced sign-ups before clinical value is delivered.

---

## X. Final Output: The 4-Pillar Resolution

When induction terminates, the screen reveals four floating, frosted-glass cards.

| Pillar | Under-the-Hood Logic | User-Facing Display |
| --- | --- | --- |
| **Diagnosis** | Pathophysiology + ICD-10 Match | Condition name + physiological explanation. |
| **Management** | EBM Protocol - Patient Constraints | Step-by-step meds/dose/lifestyle plan. |
| **Prognosis** | Statistical Trajectory Model | Evidence-based recovery timeline. |
| **Prevention** | Root-Cause Mitigation | Advice to prevent recurrence. |

---