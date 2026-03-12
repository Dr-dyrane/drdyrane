# Audit Remediation Tasks (Execution Log)

Date: 2026-03-12  
Owner: Engineering  
Mode: Chat-first hybrid clinical engine (structured reasoning under the hood)

## Objective
Close all audit gaps while implementing the product recommendation:
- chat-first consultation flow
- optional assistive options (never hard lock)
- explicit chief-complaint routing
- stronger safety and memory behavior
- premium in-app UX (no browser-native dialogs)

## Task Board

| Gap ID | Task | Status | Delivery |
| --- | --- | --- | --- |
| G1 | Fix coordinator state drift between singleton and reducer state | Completed | `processAgentInteraction` now syncs coordinator with latest React state before processing |
| G2 | Reduce fever-only architecture bias and add explicit routing scaffold | Completed | Added 12-engine chief complaint router and route-aware follow-up/pending actions in orchestrator |
| G3 | Remove auto-submitted timeout answers | Completed | Timed gates no longer auto-answer; user must select or type |
| G4 | Expand emergency trigger detection | Completed | Added broader red-flag emergency patterns (neuro, bleeding, shock, breathing, GI critical) |
| G5 | Remove blocking browser dialogs (`alert/confirm/prompt`) | Completed | Replaced with in-app notifications and inline confirm-delete UX |
| G6 | Make E2E scripts self-bootstrapping | Completed | Added preview auto-start helper for e2e scripts |
| G7 | Improve local-storage resilience | Completed | Hardened prompt cache/log reads/writes and added compact fallback persistence path |
| G8 | Lower default cost/latency for dual-model collaboration | Completed | Collaboration defaults to off; forced on only for high-risk consult contexts |
| G9 | Remove client-prefixed key fallback from server key resolution | Completed | Removed `VITE_*` fallback for server API key lookup and Vite key hydration |
| G10 | Remove architecture duplication | Completed | Deleted duplicate wrappers (`src/api/dr-dyrane.ts`, `src/services/triage.ts`) |
| G11 | Reduce initial bundle pressure | Completed | Added lazy loading/code-splitting for major views/sheets/modals |
| G12 | Fix stale system metadata | Completed | Updated About page processor/scope/logic/version messaging |
| G13 | Remove legacy client-key references from runtime/server messaging | Completed | Updated server error messaging to require only server env keys (`ANTHROPIC_API_KEY`) |

## Hybrid Model Contract (Implemented)
1. Chat-first always available.
2. Option surfaces are assistive only.
3. Chief complaint engine is classified each turn and injected into reasoning actions.
4. Must-not-miss safety context remains mandatory before finalization.
5. Probability is exposed with patient-facing likelihood bands at conclusion.

## Files Updated (Primary)
- `src/core/api/agentCoordinator.ts`
- `src/features/consultation/StepRenderer.tsx`
- `src/core/api/agent/emergencyRules.ts`
- `api/_aiOrchestrator.ts`
- `src/core/services/clipboard.ts`
- `src/features/resolution/PillarCard.tsx`
- `src/features/drug/DrugProtocolsView.tsx`
- `src/components/layout/BottomNav.tsx`
- `src/features/profile/ProfileSheet.tsx`
- `src/features/emergency/EmergencyOverlay.tsx`
- `src/features/history/VisitRecordModal.tsx`
- `scripts/e2eServer.mjs`
- `scripts/e2e-malaria.mjs`
- `scripts/e2e-fever-bias.mjs`
- `src/core/storage/promptCache.ts`
- `src/core/context/ClinicalContext.tsx`
- `vite.config.ts`
- `.env.example`
- `src/App.tsx`
- `src/features/about/AboutView.tsx`

## Validation Checklist
- `npm run lint`
- `npm run build`
- `npm run e2e:malaria`
- `npm run e2e:fever-bias`

## Validation Results (2026-03-12)
- `npm run lint` ✅ pass
- `npm run build` ✅ pass
- `npm run e2e:malaria` ✅ pass (Top diagnosis: `Malaria (ICD-10: B54)`)
- `npm run e2e:fever-bias` ✅ pass (Top diagnosis: `Undifferentiated febrile illness (ICD-10: R50.9)`)
