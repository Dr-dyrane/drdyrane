# UI Render Audit Execution Plan (Big Delta)

Date: 2026-03-12  
Owner: Codex

## Goal
Drive a high-contrast UX improvement pass across every rendered surface before returning to engine functionality work.

## Success Criteria
- No horizontal overflow on any primary or sheet surface.
- First viewport on each page shows one clear primary task.
- No decorative duplication of controls (every control has one job).
- 44x44 minimum tap target preserved.
- Reduced-motion mode keeps all flows usable without animation dependency.

## Full Surface Inventory
- App shell: header, depth layer, main container, bottom navigation + FAB.
- Consult: `StepRenderer`, `ClinicalQuestionCard`, `ResponseOptionsPanel`, `BiodataCard`.
- Records: `HistoryView`, `VisitRecordModal`, `TheHx`.
- Pharmacy: `DrugProtocolsView`, protocol detail sheet, volume calculator sheet.
- Investigation: `DiagnosticReviewView` (scan/upload/review/handoff + scanner sheet).
- System: `AboutView`, `PillarCard`.
- Global overlays: `EmergencyOverlay`, `NotificationsSheet`, `ProfileSheet`, `AvatarCropModal`, `ClinicalProcessModal`.

## Execution Sequence
1. Foundation consistency pass
- Normalize top spacing, section spacing rhythm, and safe-area behavior.
- Normalize header + page title hierarchy pattern.
- Keep orb as consult hero only; non-consult surfaces use support presence.

2. Cognitive-load pass
- Trim first-screen information to one intent per page.
- Reduce chip/button clusters that force horizontal scanning.
- Move secondary context into sheets or progressive disclosure.

3. Controls and feedback pass
- Standardize CTA hierarchy: one primary action, secondary contextual actions.
- Normalize submit/select/error feedback timings.
- Ensure option panels keep one-question-at-a-time flow without visual noise.

4. Sheet and modal pass
- Standardize sheet header, close affordance, and bottom action spacing.
- Remove fixed controls that obscure scroll content.
- Ensure deterministic z-index and clean modal handoff transitions.

5. Typography and copy pass
- Remove non-essential explanatory prose from production screens.
- Keep labels short and action-first.
- Ensure text wrapping/truncation rules prevent chip/card breakage.

6. Quality gate pass
- Manual viewport checks: 320px, 375px, 390px, 430px widths.
- Run `lint` + `build`.
- Regression checks on consult flow, record reopen, pharmacy search/filter, scan handoff.

## Commit Strategy
- Ship in small deploy-safe commits per pass.
- Each commit includes: affected surfaces, UX intent, and regression checks run.

## Immediate Next Batch
- Pass 1 complete start: orb prominence and visual density normalization.
- Next target: bottom navigation/FAB declutter and sheet header unification.
