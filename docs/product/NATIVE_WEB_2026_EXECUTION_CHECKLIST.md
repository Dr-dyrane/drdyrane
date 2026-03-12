# Native-Quality Web App Checklist (2026)

Date: 2026-03-12  
Owner: Codex

Related strategy doc: `docs/product/CLINICAL_UX_MOAT_PLAYBOOK.md`

## 1) HIG-aligned UX
- `Done`: Single-question consult canvas and progressive disclosure.
- `Done`: Predictable controls (`button`, `toggle`, `segmented`, `slider`) in context.
- `Done`: 44px minimum interaction targets.
- `Done`: No sub-11px patient-facing labels.
- `Pending`: Screen-by-screen visual snapshot baseline for regression checks.

## 2) PWA baseline
- `Done`: Valid manifest + installability + standalone display.
- `Done`: Explicit manifest link in `index.html`.
- `Done`: Offline support via generated service worker.
- `Done`: Added manifest shortcuts (`consult`, `history`).
- `Pending`: Add richer install screenshots in manifest.

## 3) Responsive and native-feel layout
- `Done`: Mobile-first container and safe-area handling.
- `Done`: Stable app scroll container + isolated modal scroll regions.
- `Done`: Deterministic z-index layering for overlays/sheets.

## 4) Performance
- `Done`: Build-time bundling/minification.
- `Done`: Contrast audit integrated as repeatable script.
- `Pending`: Route-level bundle splitting and chunk budget gates in CI.
- `Pending`: Core Web Vitals budget + real-user monitoring.

## 5) Security
- `Done`: Added deployment security headers in `vercel.json` (`nosniff`, frame deny, referrer policy, permissions policy).
- `Done`: Added route-level rate limiting for dev/preview proxy on `/api/consult`, `/api/options`, `/api/vision`.
- `Pending`: Add production-grade shared rate limiting for Vercel serverless routes.
- `Pending`: Add strict CSP after verifying script/font requirements.

## 6) Accessibility
- `Done`: Focus-visible styling and keyboard-friendly controls.
- `Done`: Color contrast checks and semantic tokenized themes.
- `Done`: `prefers-reduced-motion` support.
- `Done`: `prefers-reduced-transparency` fallback for glass surfaces.
- `Pending`: Full keyboard-only flow QA for consult completion path.

## 7) Engineering quality
- `Done`: Lint/build gates passing.
- `Done`: Typed state model for core clinical flow.
- `Pending`: Split agent coordinator into smaller modules with explicit contracts.
- `Pending`: Add e2e consult smoke test (intake -> assessment -> diagnosis shown).

## 8) Behaviour and engagement
- `Done`: Immediate interaction feedback hooks (audio/haptics configurable).
- `Done`: Option variants with visual energy and clear selected states.
- `Pending`: Ethical gamification guardrails doc (frequency caps, opt-out defaults).
- `Pending`: Session-level personalization loop without repetitive questioning.

## 9) Clinical AI orchestration
- `Done`: Hybrid model router with OpenAI + Anthropic support.
- `Done`: Provider collaboration mode for consult/options responses.
- `Done`: Dynamic provider selection by urgency/question context.
- `Done`: Vision analysis endpoint (`/api/vision`) with OpenAI image understanding.
- `Pending`: Add provider telemetry dashboard (latency, failover, quality deltas).

## Next execution order
1. Consult flow completion reliability (avoid loops, reduce repeated questions).
2. Agent coordinator modularization pass.
3. Screen snapshot regression suite (light/dark/system).
4. Production API hardening (shared rate limits + graceful fallback messaging).
