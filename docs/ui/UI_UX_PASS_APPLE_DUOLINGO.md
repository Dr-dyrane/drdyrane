# Dr Dyrane UI/UX Engineering Pass

Date: 2026-03-12  
Owner: Codex  
Reference Direction: Apple Health information hierarchy + Duolingo color energy and motion rhythm

## Goal
- Remove UI leaks and inconsistent behaviors.
- Enforce semantic token usage across light/dark themes.
- Improve native feel with clearer affordances and lower text noise.
- Keep patient flow focused: one question, one response zone, one clear primary action.
- Integrate hybrid model orchestration to improve clinical response quality by context.

## Non-Negotiables
- No border-based separation.
- No hardcoded neon classes in feature components.
- Controls must look interactive (especially toggles and segmented options).
- Modal/sheet layering must be deterministic.
- App must keep full-height layout on mobile (`100dvh`).

## Audit Checklist

### App Shell
- [x] `App.tsx` layout reviewed for safe-area, scroll strategy, and fixed-layer consistency.
- [x] Main content uses stable scroll container.
- [x] Header and bottom nav remain visible without overlap glitches.

### Global Tokens and Utilities
- [x] Semantic color classes available for accent and danger states.
- [x] Selection, CTA, chip, and option surfaces use tokenized gradients.
- [x] Toggle visual language upgraded for clarity.

### Header + Navigation
- [x] Header icon buttons use consistent touch target and feedback.
- [x] Bottom nav spacing/safe-area tightened.
- [x] FAB and action tray remain legible in light and dark themes.

### Patient Consultation Surface
- [x] Prompt/response labels simplified.
- [x] Option selection indicators are consistent and interactive.
- [x] Long question overflow behavior stabilized.

### Sheets and Modals
- [x] Profile sheet controls reduced in text heaviness and increased icon clarity.
- [x] Notifications sheet uses semantic colors and clear state cues.
- [x] Clinical process and history overlays maintain proper hierarchy and readability.

### Feature Screens
- [x] About, History, Resolution screens migrated to semantic accents.
- [x] Lens and Emergency surfaces moved off hardcoded neon classes.

## Follow-up Targets
- Add visual regression snapshots for light/dark states of: consult, profile, history, emergency.
- Add a tiny interaction QA checklist (tap feedback, disabled state, focus-visible) to CI docs.
- Keep `docs/ui/APPLE_HIG_COMPLIANCE_MATRIX.md` updated for each UI release pass.
- Add provider-level quality telemetry (OpenAI vs Anthropic vs collaborative merge).

## Apple HIG Baseline (This Pass)
- [x] Added explicit HIG compliance matrix with section-to-file mapping.
- [x] Enforced minimum tap target baseline (`44px`) through global interaction utilities.
- [x] Removed all `text-[9px]` / `text-[10px]` usage from patient-facing components.
- [x] Linked web manifest explicitly in `index.html` for stable PWA metadata loading.
- [x] Switched dynamic browser theme color resolution to semantic theme token reads.

## File-Level Actions
- `src/App.tsx`: switched to stable internal scroll container; safe-area top/bottom padding for mobile.
- `src/components/layout/Header.tsx`: safe-area top offset + consistent icon button interaction styles.
- `src/components/layout/BottomNav.tsx`: safe-area bottom padding, reduced text clutter, tighter action tray width.
- `src/components/shared/SideSheet.tsx`: full `100dvh` sheet body with safe-area bottom and overflow containment.
- `src/components/shared/ToggleSwitch.tsx`: redesigned toggle with explicit ON/OFF affordance icons and improved thumb contrast.
- `src/features/profile/ProfileSheet.tsx`: icon-forward controls, explicit setting states (`On/Off`), reduced wording noise.
- `src/features/notifications/NotificationsSheet.tsx`: semantic accent usage for unread state, cleaner heading hierarchy.
- `src/features/history/HistoryView.tsx`: semantic severity accents for normal vs emergency records.
- `src/features/about/AboutView.tsx`: semantic accent tokens replacing hardcoded neon classes.
- `src/features/resolution/PillarCard.tsx`: semantic accent chips for icon blocks.
- `src/features/consultation/TheLens.tsx`: semantic accent classes for camera and analyzing pulse states.
- `src/features/emergency/EmergencyOverlay.tsx`: semantic danger classes replacing hardcoded red surfaces.
- `api/_anthropic.ts`: hybrid routing + collaboration merge between OpenAI and Anthropic.
- `api/vision.ts`: server route for image-assisted clinical interpretation.
- `src/core/api/visionEngine.ts`: frontend vision client for Lens capture handoff.
