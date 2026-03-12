# README Reality Sync

## Purpose
Track where documented vision and implementation differ, and what has been aligned in recent passes.

## Aligned in this pass
- Consultation flow is now a single focal question stage with adaptive option UI.
- Multi-select options now have explicit selected-state visuals.
- Lens handoff is wired to return into active consultation flow.
- Clinical records drawer now shows live active-case snapshot and refresh context.
- Session persistence uses versioned storage key with legacy migration.
- Bundled model questions are now gated locally and asked one segment at a time before the next model call.
- Frontend prompt usage + short TTL caching are stored for prompt-cache control.
- Agent state now stores explicit positive and negative findings memory across encounters.
- A mandatory must-not-miss safety checkpoint now gates diagnosis finalization before `status=complete`.
- Prescription encounter now supports weight-aware dose recalculation before print/export.
- Added formal blueprint comparison in `docs/architecture/CHIEF_COMPLAINT_ENGINE_GAP_ANALYSIS.md`.
- Added a dedicated `Drug` tab with searchable diagnosis protocols and print-ready treatment sheets sourced from `public/data/drug-protocols.json`.
- Drug and consultation print sheets now use structured premium layout (patient context, generation timestamp, clean section cards).

## Remaining Gaps
- README references historical folder names and model strategy not fully matching runtime.
- Duplicate legacy files still exist (`src/api/dr-dyrane.ts`, `src/services/triage.ts`).
- Need wider automated regression scenarios for safety checkpoint outcomes (clear vs escalate vs uncertain loop).

## Recommended Next Pass
1. Add targeted e2e script coverage for must-not-miss checkpoint pathways.
2. Deprecate/remove legacy duplicate modules.
3. Rewrite root README to match `src/core/*` architecture and current UX flow.
4. Add architecture notes for longitudinal local-memory retention and pruning strategy.
