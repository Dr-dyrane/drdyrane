# Clinical UX Moat Playbook

Date: 2026-03-12  
Owner: Product + Engineering

## Why this exists
Clinical algorithms are increasingly commoditized. The durable moat is the experience layer that captures high-quality clinical data quickly, with low cognitive load, and high user trust.

## Core Thesis
- The model is replaceable.
- The interaction contract is not.
- We win if users can complete intake and reach a reliable plan faster than chatbot-style competitors.

## The Interaction Contract (Non-Negotiable)
1. One clinical variable per step.
2. One response action per step.
3. Time-anchor every presenting complaint.
4. Ask for additional complaints and capture duration for each before differential deepening.
5. Progressive disclosure only; no full form dump.
6. Keep visual noise low and affordances high.

## Why chatbot UX failed in this domain
1. Multi-question prompts produce mixed, low-quality answers.
2. Freeform chat creates variable data shape and missed key fields.
3. Conversation walls increase fatigue and drop-off.
4. Patients cannot see structured progress.

## Why this pattern works
1. Structured steps create high-quality SOAP-ready subjective data.
2. Tight option UX reduces effort and completion time.
3. Stacked micro-surveys gather focused context before escalation.
4. Engine receives cleaner context, so diagnosis quality improves.

## Intake Standard (SOAP-aligned)
1. Presenting complaint.
2. Duration of presenting complaint.
3. "Any other complaint right now?"
4. If yes: complaint text.
5. Duration for that complaint.
6. Repeat up to configured cap, then move into focused history.

## Engine Contract (Decoupled)
Any model/provider can be used if it accepts:
- Input: structured state + latest patient answer.
- Output: one next question, optional options metadata, updated working differential, urgency, confidence, and pending actions.

This allows algorithm upgrades without rewriting the UX.

## Option UX Rules
1. Binary/confirm questions use segmented yes/no/not sure.
2. Count UIs trigger only for explicit quantity language.
3. Laterality UIs trigger only for side/location intent.
4. Severity UIs use numeric/ladder scale only when severity intent is explicit.
5. High-cardinality prompts can trigger short stacked survey gates.

## Premium UX Principles (Apple-aligned)
1. Clarity first: only what is needed now.
2. Consistency: stable interaction patterns across screens.
3. Deference: content and task lead, chrome stays quiet.
4. Feedback: immediate visual/haptic confirmation.
5. Motion: purposeful, short, informative transitions.
6. High polish: spacing, typography rhythm, and predictable hierarchy.

## Differentiator Stack
1. Structured clinical capture UX.
2. Fast, low-friction response surfaces.
3. Algorithm-agnostic orchestration layer.
4. Progressive confidence and checkpointing before final plan.
5. Native-feel visual system that signals quality and trust.

## KPI Scoreboard (Weekly)
1. Intake completion rate.
2. Median turns to usable differential.
3. Time to first actionable plan.
4. Correction rate at summary/checkpoint step.
5. Step-level drop-off rate.
6. Revisit rate and follow-through on management plan.

## Next UX Moat Milestones
1. Reason-for-question chip ("Needed to narrow fever causes").
2. Complaint timeline strip with editable durations.
3. Pre-diagnosis confirmation checkpoint.
4. Confidence phrasing states (early, narrowing, likely) in addition to raw percentage.
5. Fast yes/no timed pulses for high-yield branches.

## Release Gate
Do not ship if any of these fail:
1. One-question policy.
2. Complaint duration capture policy.
3. Option intent mapping correctness.
4. Mobile tap target and readability baseline.
5. Lint/build and clinical e2e smoke flows.
