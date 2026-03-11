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

## Remaining Gaps
- AI calls are still direct from client; server proxy required for key/privacy hardening.
- README references historical folder names and model strategy not fully matching runtime.
- Duplicate legacy files still exist (`src/api/dr-dyrane.ts`, `src/services/triage.ts`).

## Recommended Next Pass
1. Move all model calls behind `/api/consult` and `/api/options` server routes.
2. Remove direct browser model headers and client API key usage.
3. Deprecate/remove legacy duplicate modules.
4. Rewrite root README to match `src/core/*` architecture and current UX flow.
