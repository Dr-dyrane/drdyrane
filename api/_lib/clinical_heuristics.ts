import {
  ConsultRequest,
  ConsultPayload,
} from './types.js';
import {
  URGENCY_RANK,
  classifyChiefComplaint,
  detectEmergencyInDifferential,
} from './clinical.js';
import {
  sanitizeText,
  clampPercent,
} from './utils.js';
import {
  sanitizeList,
  sanitizeCheckpointStatus,
  finalizeConsultContract,
  ensureEmpathicStatement,
  buildConsultTextCorpus,
  dedupeDxList,
  applyIcd10Label,
  atLeastDifferential,
  mergeUnique,
  mergeCheckpointState,
  enforceQuestionProgression,
  getNextProgressiveIntentQuestion,
  FINAL_SUMMARY_QUESTION,
} from './parsers.js';

/**
 * LLM-FIRST ARCHITECTURE: Trust the LLM's clinical reasoning
 *
 * PHILOSOPHY: The LLM has comprehensive medical knowledge from training.
 * It doesn't need hardcoded disease patterns for 70,000+ ICD-10 codes.
 *
 * This simplified approach:
 * 1. Trusts LLM's differential diagnosis (pathophysiology-based reasoning)
 * 2. Applies ICD-10 coding (universal mapping)
 * 3. Classifies chief complaint for routing (universal symptom categories)
 * 4. Enforces clinical quality (universal standards)
 *
 * Works for ANY presenting complaint - from common colds to rare diseases.
 */
export const applyClinicalHeuristics = (body: ConsultRequest, payload: ConsultPayload): ConsultPayload => {
  // 1. Apply ICD-10 codes to LLM's differential diagnosis
  const withCodedDdx = dedupeDxList((payload.ddx || []).map((entry) => applyIcd10Label(entry)));

  // 2. Classify chief complaint for routing (universal symptom categories)
  const corpus = buildConsultTextCorpus(body, payload);
  const complaintRoute = classifyChiefComplaint(corpus);

  if (withCodedDdx.length === 0) {
    return finalizeConsultContract(
      {
        ...payload,
        ddx: withCodedDdx,
      },
      complaintRoute
    );
  }

  // 3. Use LLM's differential as-is (trust the clinical reasoning)
  const mergedDdx = withCodedDdx.slice(0, 8);

  // 4. Detect emergency patterns (universal safety check)
  const hasEmergencyPattern = detectEmergencyInDifferential(mergedDdx, corpus);
  const probabilityFloor = hasEmergencyPattern ? 78 : 65;

  // 5. Build next actions (universal clinical workflow)
  const safetyAction = `Must-not-miss checks for ${complaintRoute.label}: ${complaintRoute.mustNotMiss.join(', ')}`;
  const routeAction = `Chief complaint route: ${complaintRoute.label} (${complaintRoute.reason})`;
  const nextActions = dedupeDxList([
    ...(payload.agent_state?.pending_actions || []),
    routeAction,
    safetyAction,
    'Continue systematic history taking and differential narrowing',
  ]);

  // 6. Determine phase and urgency (based on LLM's assessment)
  const patientTurns =
    (body.state?.conversation || []).filter((entry) => entry.role === 'patient').length +
    (sanitizeText(body.patientInput) ? 1 : 0);
  const nextPhase = hasEmergencyPattern
    ? payload.agent_state?.phase || 'assessment'
    : atLeastDifferential(payload.agent_state?.phase);
  let nextUrgency = payload.urgency || 'low';
  if (hasEmergencyPattern) {
    nextUrgency = 'critical';
  } else if (URGENCY_RANK[nextUrgency] < URGENCY_RANK.medium) {
    nextUrgency = 'medium';
  }
  const requestAgentState =
    body.state?.agent_state && typeof body.state.agent_state === 'object'
      ? (body.state.agent_state as Record<string, unknown>)
      : {};
  const mergedPositiveFindings = mergeUnique(
    payload.agent_state?.positive_findings || [],
    sanitizeList(requestAgentState.positive_findings, 24),
    24
  );
  const mergedNegativeFindings = mergeUnique(
    payload.agent_state?.negative_findings || [],
    sanitizeList(requestAgentState.negative_findings, 24),
    24
  );
  const checkpointFromRequest =
    requestAgentState.must_not_miss_checkpoint &&
    typeof requestAgentState.must_not_miss_checkpoint === 'object'
      ? (requestAgentState.must_not_miss_checkpoint as Record<string, unknown>)
      : {};
  const mergedCheckpoint = mergeCheckpointState(
    payload.agent_state?.must_not_miss_checkpoint,
    {
      required: Boolean(checkpointFromRequest.required),
      status: sanitizeCheckpointStatus(checkpointFromRequest.status),
      last_question: sanitizeText(checkpointFromRequest.last_question) || undefined,
      last_response: sanitizeText(checkpointFromRequest.last_response) || undefined,
      updated_at:
        typeof checkpointFromRequest.updated_at === 'number'
          ? checkpointFromRequest.updated_at
          : Number(checkpointFromRequest.updated_at) || undefined,
    }
  );

  // 7. Question resolution (trust LLM's question, with fallback)
  const genericQuestionPattern =
    /(what symptom is bothering you the most right now|tell me the one symptom troubling you most right now|what changed most since symptoms began|what one detail should i clarify before i summarize your working diagnosis)/i;
  const progressionFallbackQuestion =
    getNextProgressiveIntentQuestion(body.state?.conversation || [], null) ||
    FINAL_SUMMARY_QUESTION;
  const conversationalFallbackQuestion =
    patientTurns <= 1
      ? complaintRoute.starterQuestion
      : progressionFallbackQuestion;
  const resolvedQuestion =
    payload.question && !genericQuestionPattern.test(payload.question)
      ? payload.question
      : conversationalFallbackQuestion;
  const safeguardedQuestion = enforceQuestionProgression(
    resolvedQuestion || 'Tell me the one symptom troubling you most right now.',
    body.state?.conversation || [],
    body.patientInput || ''
  );

  return finalizeConsultContract({
    ...payload,
    statement: ensureEmpathicStatement(payload.statement, body),
    ddx: mergedDdx,
    probability: Math.max(clampPercent(payload.probability), probabilityFloor),
    urgency: nextUrgency,
    agent_state: {
      phase: nextPhase,
      confidence: Math.max(clampPercent(payload.agent_state?.confidence), probabilityFloor),
      focus_area:
        payload.agent_state?.focus_area ||
        `${complaintRoute.label}: LLM-driven differential narrowing`,
      pending_actions: nextActions.slice(0, 8),
      last_decision:
        payload.agent_state?.last_decision ||
        `LLM clinical reasoning with ${complaintRoute.label} routing`,
      positive_findings: mergedPositiveFindings,
      negative_findings: mergedNegativeFindings,
      must_not_miss_checkpoint: mergedCheckpoint,
    },
    question:
      safeguardedQuestion ||
      'Tell me the one symptom troubling you most right now.',
  }, complaintRoute);
};
