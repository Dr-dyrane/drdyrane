# Testing Stack: Consult State Machine

This app now uses a 3-layer test strategy for consult reliability.

## 1) Deterministic Engine Matrix (mock LLM)
- Runner: `scripts/e2e-matrix.mjs`
- Spec: `scripts/specs/encounter-matrix.json`
- Invariants (every turn): `scripts/lib/invariantValidator.mjs`

Run:
- `npm run e2e:deterministic`

Covers all 12 complaint engines across:
- positive path
- must-not-miss path
- ambiguous path
- contradiction path
- user-noise path

## 2) Integration Transcript Replay (real orchestrator)
- Runner: `scripts/e2e-transcript-replay.mjs`
- Spec: `scripts/specs/transcript-replay.json`
- Calls real `/api/consult` + `/api/options` with per-turn assertions.

Run:
- `npm run e2e:integration`
- `npm run e2e:integration:strict` (fails if LLM keys unavailable)

## 3) UI Smoke (Playwright)
- Config: `playwright.config.ts`
- Engine smoke: `tests/playwright/engine-smoke.spec.ts`
  - one smoke per engine (12 tests)
- Consult interaction smoke: `tests/playwright/consult-flow.spec.ts`
  - fast taps
  - reload mid-gate
  - offline reload cache

Run:
- `npm run test:ui:engines`
- `npm run test:ui:consult`

## CI Gates
Workflow: `.github/workflows/ci.yml`

Required gate job:
- build
- deterministic matrix + invariants
- UI smoke per engine
- consult interaction smoke

Conditional integration job:
- transcript replay (runs when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` secret is set)

## Local Quick Gate
Run the core required quality checks:
- `npm run test:quality`
