# Apple HIG Compliance Matrix (Dr Dyrane)

Date: 2026-03-12  
Owner: Codex  
Scope: Patient-facing mobile web experience (consult, history, sheets, overlays)

## Source set (Apple)
- https://developer.apple.com/design/human-interface-guidelines/
- https://developer.apple.com/design/human-interface-guidelines/designing-for-adoption/
- https://developer.apple.com/design/tips/
- https://developer.apple.com/design/human-interface-guidelines/accessibility#Interactivity
- https://developer.apple.com/design/human-interface-guidelines/menus
- https://developer.apple.com/design/human-interface-guidelines/scroll-views
- https://developer.apple.com/design/human-interface-guidelines/typography
- https://developer.apple.com/design/human-interface-guidelines/color-and-effects

## Interpretation policy
- "Word for word" is applied as strict implementation for **all HIG sections that are relevant to this product surface**.
- Native-only APIs/components that have no web equivalent are mapped to nearest browser/PWA pattern.
- Any gap is marked `Pending` and stays in this matrix until implemented.

## Matrix

| HIG area | Rule | Implementation | File targets | Status |
|---|---|---|---|---|
| Color and effects | Use depth/material over ornamental separators | Borderless layered surfaces and shadow/material separation only (no decorative borders/rings) | `src/styles/physics.css`, `src/features/**` | Implemented |
| Design for adoption | Preserve familiar behavior and reduce relearning cost | Single-canvas consult flow, stable top header and bottom action model across views | `src/App.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/BottomNav.tsx` | Implemented |
| Design tips | Keep focused user task, avoid visual overload | One-question-at-a-time render and progressive option/input disclosure | `src/features/consultation/StepRenderer.tsx`, `src/features/consultation/components/ClinicalQuestionCard.tsx` | Implemented |
| Design tips | Consider reduced motion preferences | Global reduced-motion override disables nonessential animation | `src/styles/physics.css` | Implemented |
| Accessibility (Interactivity) | Minimum 44x44 tap target | Global 44px target enforcement for all interactive controls | `src/styles/physics.css` | Implemented |
| Typography | Avoid text smaller than 11pt equivalent for UI labels | Removed `text-[9px]` and `text-[10px]` usages from patient-facing UI | `src/**` | Implemented |
| Color and effects | Contrast must preserve legibility in all themes | Semantic token-only theme surfaces with contrast audit gate | `src/styles/physics.css`, `docs/accessibility/contrast-audit.md` | Implemented |
| Menus | Commands should be grouped and consistently placed | FAB action menu grouped by clinical tasks (record, process, print, revisit, reset) | `src/components/layout/BottomNav.tsx` | Implemented |
| Scroll views | Keep scroll behavior predictable and contained | Main app has stable scroll container; modal sheets own internal scroll | `src/App.tsx`, `src/components/shared/SideSheet.tsx`, `src/features/**/Modal*.tsx` | Implemented |
| Modality | Modal content should retain context and dismiss clearly | All sheets/modals include backdrop, deterministic z-index, explicit close action | `src/components/shared/SideSheet.tsx`, `src/features/history/VisitRecordModal.tsx`, `src/features/consultation/ClinicalProcessModal.tsx` | Implemented |
| Presentation patterns | Sheet behavior should feel native and context-preserving | Replaced side-drawer style with iOS-like bottom sheet presentation and detent behavior | `src/components/shared/SideSheet.tsx`, `src/features/profile/ProfileSheet.tsx`, `src/features/notifications/NotificationsSheet.tsx` | Implemented |
| Input | Immediate feedback on interaction | Unified haptic/audio event hooks on select/submit/error states | `src/core/services/feedback.ts`, `src/components/layout/BottomNav.tsx`, `src/features/consultation/StepRenderer.tsx` | Implemented |
| Writing | Clear, concise task-first labels | Replaced decorative micro-copy with concise labels and icon-led controls | `src/features/profile/ProfileSheet.tsx`, `src/features/notifications/NotificationsSheet.tsx`, `src/features/history/VisitRecordModal.tsx` | Implemented |
| Icons | Meaningful iconography must reinforce action | Icon-first buttons for nav, profile controls, history actions, biodata controls | `src/components/layout/BottomNav.tsx`, `src/features/profile/ProfileSheet.tsx`, `src/features/consultation/components/BiodataCard.tsx` | Implemented |
| PWA shell consistency | App metadata should be valid and discoverable | Explicit web manifest link added in document head | `index.html`, `public/manifest.webmanifest` | Implemented |

## Non-applicable native sections (mapped)
- Apple platform-specific controls or APIs without web parity are mapped to tokenized web controls and progressive sheets.
- Native haptics APIs are mapped to browser vibration/audio cues where available.

## Remaining hard checks
- Run visual snapshot pass for each screen in light/dark/system themes after every major UI merge.
- Keep this matrix updated before release tags.
