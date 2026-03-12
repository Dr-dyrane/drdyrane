# All-Purpose Dr. Dyrane Roadmap

Date: 2026-03-12

## Product Direction
Build Dr. Dyrane as a full clinical assistant with four always-available pillars:
1. History-driven diagnosis support
2. Searchable treatment formulary and printable prescriptions
3. Lab result review and interpretation
4. Image-based review (radiology, ECG, bedside images) with safety-first escalation

## Current State
- Diagnosis engine: active with one-question flow, differential ranking, and must-not-miss safety checkpoint.
- Treatment layer: active via new `Drug` tab with searchable protocols and print flow.
- Local-first memory: profile, longitudinal encounters, and finding memory persisted in local storage.

## Next Planned Upgrades

### Phase A: Lab Review Module
- Upload or paste common lab panels.
- Parse values, flag out-of-range results, and summarize clinical significance.
- Link lab abnormalities back to current differential and urgency.
- Add print-ready lab interpretation summary.

### Phase B: Radiology and ECG Review Module
- Image/document upload entry point from consult flow and standalone tools tab.
- Multi-model image interpretation (OpenAI vision + secondary model fallback).
- Structured output: key findings, confidence, red flags, suggested next steps.
- Safety block to prevent definitive diagnosis from image-only evidence.

### Phase C: Encounter Unification
- Unified encounter workspace combining:
  - diagnosis timeline
  - treatment plan
  - labs
  - radiology/ECG impressions
- Single export packet for clinic and pharmacy continuity.

## Guardrails
- Keep one-question primary consult flow unchanged for patient UX clarity.
- Never bypass must-not-miss safety checks before final treatment confidence.
- Keep local-first privacy by default; export/share remains explicit user action.
- Show uncertainty bands when confidence is not high.

## Engineering Notes
- Continue using explicit schemas for each module output.
- Keep shared clinical memory typed and versioned.
- Add regression suites for lab and image safety pathways before enabling auto-escalation.
