# Dr. Dyrane UI Modular Map

## Pages and Routing Context
- `consult`: `src/features/consultation/*` and `src/features/consultation/components/*`
- `history`: `src/features/history/HistoryView.tsx`
- `about`: `src/features/about/AboutView.tsx`

## Consultation Modules
- `StepRenderer.tsx`: orchestration layer (state + event wiring only)
- `components/ClinicalQuestionCard.tsx`: focal question stage
- `components/ResponseOptionsPanel.tsx`: adaptive answer UIs (`stack`, `grid`, `binary`, `scale`, `chips`)
- `TheLens.tsx`: visual intake mode and handoff
- `Orb.tsx`: ambient system state and loading pulse

## Core Clinical Engine Modules
- `core/api/agentCoordinator.ts`: turn orchestration, emergency pre-check, lens routing, and local bundled-question gating
- `core/api/conversationEngine.ts`: doctor question generation
- `core/api/optionsEngine.ts`: option generation + normalization + UI variant inference
- `core/services/feedback.ts`: haptics and audio cues
- `core/storage/promptCache.ts`: frontend prompt usage log + short TTL cache for options/conversation calls

## Persistence and Schema Hygiene
- `core/context/ClinicalContext.tsx`: app state reducer and hydration
- `core/storage/sessionStore.ts`: versioned storage envelope + legacy migration

## Visual System Modules
- `styles/physics.css`: semantic visual tokens and interaction classes
- `components/shared/GlassContainer.tsx`: generic glass panel wrapper
- `components/layout/*`: frame shell, depth layer, global navigation

## Current Design Rules
- Intake enforces SOAP-ready presenting-complaint capture:
  - Primary complaint duration first.
  - Then ask for additional complaints and capture duration for each before differential history.
- One-question clinical stage in consult mode.
- One primary action cluster per step (answer options + optional freeform clarifier).
- Internal reasoning not rendered on patient surface.
- Option UI adapts to question semantics for faster input and lower cognitive load.
- Large symptom-choice prompts can trigger a local stacked survey gate:
  - Step 1: pick the dominant symptom.
  - Step 2+: rapid binary clarifiers (timed yes/no with auto-continue fallback).
  - Engine handoff happens once with a consolidated context summary.
