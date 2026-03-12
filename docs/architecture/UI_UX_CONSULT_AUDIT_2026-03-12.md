# Consultation UI/UX Audit (Task-Based)

Date: 2026-03-12  
Owner: Product Engineering  
Scope: `consult` experience (room feel, interaction quality, option ergonomics, repetition control)

## Goal
Shift from survey-feel to registrar-like consultation flow:
- doctor-presence first
- one focused question at a time
- reduced cognitive load
- no repetitive loop prompts
- space-efficient option interaction on mobile

## Gap Board

| Gap ID | Problem | Impact | Task | Status |
| --- | --- | --- | --- | --- |
| U1 | Generic repeated prompts (e.g. “Which associated symptom stands out…”) | Feels robotic, users abandon | Add anti-loop guard and context fallback questions in coordinator | Completed |
| U2 | Fallback question selection repeats due parity | Same phrasing across turns | Rotate fallback by doctor-turn count and skip recent repeats | Completed |
| U3 | Associated-symptom options too broad | Irrelevant choices + fatigue | Add context-aware sets (respiratory/fever/pain/general) with trimmed lists | Completed |
| U4 | Clarifier option list feels like long survey | Excess scrolling, weak focus | Force compact options to paginated 2x2 grid (4 per page) | Completed |
| U5 | Chat transcript lacks guided doctor presence | Less “in room with doctor” feeling | Add doctor/patient avatar chips and conversational bubble rhythm | Completed |
| U6 | Missing explicit next polish sprint list | Fragmented improvements | Publish next-pass tasks for motion, pacing, microcopy, and handoff logic | Completed |
| U7 | Biodata fields in consult surface increase visual load | Intake clutter in same viewport as chat | Move biodata to dedicated onboarding modal and gate consult until required profile complete | Completed |

## Implemented Changes

1. Repetition + loop control
- Added `isLoopingGenericPrompt` for associated-symptom loop detection.
- Upgraded phase fallback pool with less-generic diagnostic prompts.
- Fallback selection now avoids recent duplicates.
- Files:
  - `src/core/api/agent/repetitionGuard.ts`
  - `src/core/api/agentCoordinator.ts`

2. Contextual recovery questions
- If user says “none stand out”, coordinator now pivots to context-specific discriminator:
  - cough + chest pain -> trigger/pleuritic discriminator
  - cough -> sputum/wheeze/breathlessness discriminator
  - fever -> cyclical vs constant fever pattern discriminator
- File:
  - `src/core/api/agentCoordinator.ts`

3. Option UX simplification
- Added context-aware associated-symptom option sets.
- Reduced generic overload by routing options to complaint context.
- File:
  - `src/core/api/agent/localOptions.ts`

4. Mobile option layout
- Compact mode now uses 2x2 option grids with 4-option paging.
- Reduces vertical scrolling and improves one-glance selection.
- File:
  - `src/features/consultation/components/ResponseOptionsPanel.tsx`

5. Conversational visual polish
- Transcript bubbles now include lightweight doctor/patient avatar chips.
- Strengthens room-chat identity over form UX.
- File:
  - `src/features/consultation/StepRenderer.tsx`

6. Onboarding-first profile capture
- Added a dedicated intake onboarding modal with required steps: name, age, sex.
- Added progress monitoring (`completed/total`) and profile-ready notification.
- Consultation input now gates until required intake profile is complete.
- Onboarding entrypoint is now Notifications-first on app reload and from notification tap.
- Persisted onboarding prompt/completion state in local storage.
- Files:
  - `src/features/onboarding/ConsultOnboardingModal.tsx`
  - `src/core/profile/onboarding.ts`
  - `src/core/storage/onboardingStore.ts`
  - `src/core/notifications/onboardingNotification.ts`
  - `src/features/consultation/StepRenderer.tsx`

## Quality Gates

- `npm run lint` must pass.
- `npm run build` must pass.
- `npm run e2e:malaria` must pass after conversation-flow changes.

## Next Pass (High Priority)

1. Doctor persona cadence
- Add short “thinking pauses” and conversational transitions without verbosity.
- Ensure each doctor turn includes one clinical intent label internally (not shown to user).

2. Bubble intelligence
- Transform repeated patient responses into clarification alternatives before LLM call.
- Add soft “already captured” suppression for repeated symptom slots.

3. Room depth/motion polish
- Add subtle parallax depth layers to consult stage.
- Add non-distracting registrar-presence idle motion (reduced-motion safe).

4. Option-to-chat blending
- Convert option tap into inline sentence chips in composer (“You selected: …”).
- Keep user sense of free conversation, not wizard mode.

5. Clinical confidence communication
- Show concise progress chip: “History -> Differential -> Safety Check” during flow.
- Never surface internal jargon or engine terms to patient.
