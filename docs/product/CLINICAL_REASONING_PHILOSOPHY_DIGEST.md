# Clinical Reasoning Philosophy Digest

Date: 2026-03-12  
Sources:
- `docs/product/Comprehensive Clinical Diagnostic Algorithm.md`
- `docs/product/Master Craft of Clinicak History Taking.md`
- `docs/product/The Master Craft of Clinical History Taking.md`

## Objective
Convert expert diagnostic philosophy into reusable agent rules that improve consistency, safety, and speed without increasing patient cognitive load.

## High-Value Principles
1. History-first diagnosis: most diagnostic signal comes from history before tests.
2. Timeline is non-optional: complaint + duration is foundational.
3. Pattern recognition + analytical verification: use fast script matching, then deliberate checks.
4. Safety-first triage: always keep must-not-miss diagnoses in view.
5. Bayesian updating: each new clue adjusts probabilities up or down.
6. Negative evidence matters: absent key findings should actively lower likelihood.
7. Focused differentials: maintain top likely diagnoses, plus dangerous alternatives.
8. Tests confirm hypotheses: avoid broad, unfocused test fishing.
9. Bias control: force one plausible alternative to reduce anchoring.

## Practical Agent Translation
1. Intake contract:
   - Capture chief complaint duration.
   - Ask for additional complaints and duration for each.
2. Differential contract:
   - Keep a ranked top set.
   - Keep one explicit must-not-miss diagnosis.
3. Question contract:
   - Ask one highest-yield discriminating question per turn.
   - Prefer questions that split top competing diagnoses.
4. Option contract:
   - Duration intent -> timeline buckets.
   - "Any other complaint?" -> yes/no/not sure.
   - Count ranges only for explicit quantity questions.

## Implementation Surfaces
1. Prompt policy:
   - `api/_aiOrchestrator.ts` (`CONVERSATION_SYSTEM_PROMPT`, `OPTIONS_SYSTEM_PROMPT`)
2. Intake orchestration:
   - `src/core/api/agentCoordinator.ts` (presenting complaint duration gate)
3. Option intent safety:
   - `src/core/api/agent/localOptions.ts`
   - `src/core/api/optionsEngine.ts`
   - `src/core/api/agent/optionQuality.ts`
4. Diagnostic guardrails:
   - `api/_aiOrchestrator.ts` (bias/emergency scoring guardrails)

## Release Checks
1. One-question policy remains intact.
2. Complaint-duration capture runs before differential expansion.
3. Option intent mapping is clinically coherent.
4. Fever-only bias and malaria-pathway regression tests remain green.
