# Chief-Complaint + Dataset Gap Analysis

Date: 2026-03-12

## Scope
Compared current implementation against:
- 12 chief complaint engine architecture
- Core disease dataset blueprint (150 to 250 first, then expansion)
- Hybrid reasoning target (pattern + weighted scoring + safety checks)

## Current Coverage (What Already Exists)

### 1. Intake and symptom parsing
- Presenting complaint gate captures complaint plus duration before broad differential.
- Additional complaints are collected with duration in the same intake flow.
- One-question-per-turn behavior is enforced across conversation turns.

Files:
- `src/core/api/agentCoordinator.ts`
- `src/core/api/agent/localOptions.ts`

### 2. Differential orchestration and ranking
- Evidence-weighted orchestration exists in `api/_aiOrchestrator.ts`.
- Fever-first profile set includes WHO/Medscape style disease profiles.
- Diagnoses are normalized to ICD-10 labels.
- Negative cues apply penalties in ranking.

Files:
- `api/_aiOrchestrator.ts`

### 3. Safety layer
- Emergency input rules run early.
- Must-not-miss checkpoint is mandatory before final completion.
- Positive/negative findings memory is persisted and reused.

Files:
- `src/core/api/agent/emergencyRules.ts`
- `src/core/api/agentCoordinator.ts`
- `src/core/api/agent/encounterMemory.ts`

### 4. Dynamic questioning
- Top candidate can override generic follow-up with discriminating question.
- Option generation is intent-aware and local fallback is robust.

Files:
- `api/_aiOrchestrator.ts`
- `src/core/api/optionsEngine.ts`
- `src/core/api/agent/localOptions.ts`

### 5. Management output
- Structured encounter output includes investigations, prescriptions, counseling, and follow-up.
- This pass adds weight-aware prescription recalculation and print/export alignment.

Files:
- `src/core/api/agent/clinicalPlan.ts`
- `src/features/resolution/PillarCard.tsx`

## Gaps Against Target Architecture

### Gap A: 12-engine coverage is incomplete
Current state is fever-centric with partial cross-symptom cues. Dedicated engines are not yet implemented for all 12 chief complaints.

Impact:
- Routing is less explicit for chest pain, dyspnea, headache, abdominal pain, bleeding, AMS, and others.

### Gap B: No formal chief complaint classifier module
Classification currently emerges from prompts and heuristics, not an explicit classifier contract.

Impact:
- Harder to audit routing quality and fallback behavior by complaint class.

### Gap C: Dataset schema is not yet first-class
There is no normalized disease registry with mandatory global fields (`danger_level`, `must_not_miss`, `time_course`, `risk_factors`, etc.) persisted as a versioned dataset.

Impact:
- Expansion from dozens to 250+ diseases is harder to scale safely.

### Gap D: Supporting entity tables are missing
Symptoms, signs, risk factors, tests, and engine tables are not stored as linked entities.

Impact:
- Limits graph traversal and explainability.

### Gap E: Scoring model is mixed but not standardized
Weighted scoring exists but is embedded in heuristics. A single transparent formula with consistent penalties/bonuses is not yet centralized.

Impact:
- Calibration and comparative testing across engines are difficult.

### Gap F: Universal triage gate is partial
Emergency handling exists but not yet as one canonical red-flag engine applied uniformly before each complaint engine branch.

Impact:
- Inconsistent triage guarantees across non-fever pathways.

### Gap G: Probability bands are not user-facing
Internal probability exists, but explicit High/Medium/Low likelihood bands are not consistently rendered in clinical output.

Impact:
- Users see less transparent uncertainty framing.

## Priority Build Plan

### P0 (Immediate)
1. Create `ChiefComplaintClassifier` contract with fixed output: `{ complaint_engine, confidence, reason }`.
2. Create `EngineRegistry` for all 12 complaints with minimum viable safety rules and first discriminating question.
3. Add universal red-flag pre-check middleware before engine execution.

### P1 (Core Dataset)
1. Add disease JSON schema with required global fields.
2. Seed first 100 to 150 diseases across emergency + common buckets.
3. Add linked tables for symptoms/signs/risk factors/tests and map to engines.

### P2 (Reasoning Standardization)
1. Centralize weighted scoring function (symptoms + risk + negatives + timeline + epidemiology).
2. Add probability-band mapper and expose in output.
3. Add engine-level regression suites per chief complaint.

### P3 (Graph and Expansion)
1. Add lightweight symptom knowledge graph traversal for differential enrichment.
2. Expand dataset toward 250 then 500 plus with versioned releases.
3. Add calibration dashboard for false-positive and must-not-miss misses.

## Acceptance Criteria for Blueprint Alignment
- All 12 complaint engines have explicit routing contracts.
- Every final diagnosis pass includes must-not-miss exclusion record.
- Dataset schema validation blocks incomplete disease entries.
- Red-flag gate runs before diagnosis ranking.
- Output shows ranked diagnoses with explicit likelihood bands.
- Engine tests cover at least one positive and one exclusion pathway per engine.

## This Pass Deliverables
- Added explicit patient `weight_kg` profile field and persistence path.
- Added weight-aware prescription metadata in clinical plan output.
- Added live dose recalculation in prescription panel before print export.
- Updated print export to use recalculated doses and removed border-style table rules.
