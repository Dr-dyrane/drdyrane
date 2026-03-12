# UI Polish Snapshots

## 1. Intake Screen
- Keep one emotional line and one action: no competing controls.
- Optional biodata remains progressive and dismissible.
- Primary textarea + single clear CTA.

## 2. Active Consult Screen
- Visual hierarchy locked to: `Question -> Options -> Optional free text`.
- Clarifier progress stays above the question only.
- Added explicit section labels (`Question`, `Choose Response`) for scanning.

## 3. Option Interaction Surface
- Motion behavior normalized (same hover/tap spring rhythm across variants).
- Context hint moved into a dedicated interactive chip with stronger contrast.
- Segment/grid/chips shells use consistent depth and focus treatment.
- For high-cardinality symptom prompts, flow now supports multiphase stacking:
  - dominant symptom selection first
  - quick timed yes/no clarifiers next
  - one consolidated submission to the clinical engine

## 4. Lens Screen
- Keep dominant camera action + secondary skip/cancel only.
- Preserve vignette focus while ensuring controls remain readable.
- Theme now resolves from system for logo/video contrast consistency.

## 5. History and Record Views
- Keep list cards summary-first; reveal details progressively in modal/sheet.
- Reduce persistent CTA noise; promote one primary revisit action.

## 6. Profile and Settings Sheet
- Theme switched to explicit 3-state selection (`system`, `dark`, `light`).
- Text scale remains default `md` and directly adjustable.
- Keep helper pages grouped but lightweight.

## 7. Navigation + FAB
- Nav remains for page switching only.
- FAB remains context-action trigger only.
- Menu cards keep icon-first compact affordance.

## Apple x Duolingo Design Direction
- Apple: restraint, spacing discipline, smooth motion.
- Duolingo: clear progression cues, high affordance, playful reward energy.
- Combined rule: one primary action per step, but delightful interaction feedback.
