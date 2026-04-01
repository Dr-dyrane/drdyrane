import {
  ConsultRequest,
  OptionsRequest,
  VisionRequest,
  ScanPlanRequest,
  PrescriptionRequest,
  ConsultPayload,
  OptionsPayload,
  VisionPayload,
  LlmProvider,
  PrescriptionResponse,
  CycleRequest,
  CyclePayload,
} from './_lib/types.js';
import {
  normalizeBooleanEnv,
  sanitizeText,
} from './_lib/utils.js';
import {
  parseFirstJsonObject,
  normalizeConsultPayload,
  normalizeOptionsPayload,
  normalizeVisionPayload,
  ensureVisionBasePayload,
  mergeVisionPayload,
  applyVisionMinimumEnrichment,
  finalizeVisionContract,
  mergeConsultPayloads,
  mergeOptionsPayloads,
} from './_lib/parsers.js';
import {
  hasProviderKey,
  resolveProviderOrder,
  runWithProviderFailover,
  runCollaborative,
  selectPrimaryProviderForConsult,
  selectPrimaryProviderForOptions,
  selectPrimaryProviderForVision,
  selectPrimaryProviderForScanPlan,
  selectPrimaryProviderForPrescription,
  shouldForceCollaborativeConsult,
  callAnthropic,
  callAnthropicVision,
  callOpenAI,
} from './_providers/llm.js';
import {
  CONVERSATION_SYSTEM_PROMPT,
  OPTIONS_SYSTEM_PROMPT,
  VISION_SYSTEM_PROMPT,
  VISION_ENRICHMENT_PROMPT,
  SCAN_PLAN_SYSTEM_PROMPT,
  PRESCRIPTION_GENERATION_SYSTEM_PROMPT,
  CYCLE_SYSTEM_PROMPT,
} from './_prompts/index.js';
import { applyClinicalHeuristics } from './_lib/clinical_heuristics.js';

/**
 * Build LLM prompt with complete question history to prevent repetition
 */
const buildConversationPrompt = (body: ConsultRequest): string => {
  const allDoctorQuestions = (body.state?.conversation || [])
    .filter((entry) => entry.role === 'doctor')
    .map((entry) => entry.content);

  return `CONTEXT:
Current SOAP: ${JSON.stringify(body.state?.soap || {})}
Agent State: ${JSON.stringify(body.state?.agent_state || {})}
Differential (DDX): ${(body.state?.ddx || []).join(', ')}
Urgency: ${body.state?.urgency || 'low'}
Confidence: ${body.state?.probability || 0}%
Positive Findings Memory: ${JSON.stringify((body.state?.agent_state as Record<string, unknown>)?.positive_findings || [])}
Negative Findings Memory: ${JSON.stringify((body.state?.agent_state as Record<string, unknown>)?.negative_findings || [])}
Safety Checkpoint Memory: ${JSON.stringify((body.state?.agent_state as Record<string, unknown>)?.must_not_miss_checkpoint || {})}
Clinical Memory Dossier: ${body.state?.memory_dossier || 'No structured dossier yet.'}
Deployment Region: Nigeria (default context)
Interview Mode: Conversational telemedicine history-taking (free chat with optional guided suggestions)

QUESTIONS YOU HAVE ALREADY ASKED:
${allDoctorQuestions.length > 0 ? allDoctorQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'None yet (this is the first question).'}

CRITICAL ANTI-REPETITION RULE:
- DO NOT ask any question from the list above
- If you need clarification on something already asked, rephrase significantly or ask about a different aspect
- If patient has already answered a question, use that information - don't ask again
- Remember: Sometimes it's a SPOT DIAGNOSIS - if the diagnosis is obvious and no differentials need ruling out, offer the diagnosis immediately
- If you're asking questions to rule out differentials, make sure each question targets a DIFFERENT differential or aspect

Patient Input: "${body.patientInput || ''}"

Patient Profile Memory: ${JSON.stringify(body.state?.profile || {})}

Advance clinical assessment and ask one question.`;
};

const executeConsultWithProvider = async (
  provider: LlmProvider,
  body: ConsultRequest
): Promise<ConsultPayload> => {
  const conversationContext = (body.state?.conversation || []).slice(-80).map((entry) => ({
    role: entry.role === 'doctor' ? 'assistant' : 'user',
    content: entry.content,
  })) as Array<{ role: 'assistant' | 'user'; content: string }>;

  const prompt = buildConversationPrompt(body);

  const raw =
    provider === 'anthropic'
      ? await callAnthropic({
          maxTokens: 680,
          systemPrompt: CONVERSATION_SYSTEM_PROMPT,
          messages: [...conversationContext, { role: 'user', content: prompt }],
        })
      : await callOpenAI({
          maxTokens: 680,
          forceJson: true,
          messages: [
            { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
            ...conversationContext,
            { role: 'user', content: prompt },
          ],
        });

  return normalizeConsultPayload(parseFirstJsonObject(raw));
};

const executeOptionsWithProvider = async (
  provider: LlmProvider,
  body: OptionsRequest
): Promise<OptionsPayload> => {
  const conversationContext = (body.recentConversation || [])
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n');

  const userPrompt = `LAST DOCTOR QUESTION: "${body.lastQuestion || ''}"
AGENT STATE: ${JSON.stringify(body.agentState || {})}
CURRENT SOAP: ${JSON.stringify(body.currentSOAP || {})}

RECENT CONVERSATION:
${conversationContext || 'No conversation history available.'}

CRITICAL: Use the conversation history above to:
- Avoid suggesting responses that contradict what the patient has already said
- Match the patient's tone and language style from previous answers
- Provide options that make sense in the context of the ongoing conversation

Return only valid JSON.`;

  const raw =
    provider === 'anthropic'
      ? await callAnthropic({
          maxTokens: 460,
          systemPrompt: OPTIONS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        })
      : await callOpenAI({
          maxTokens: 460,
          forceJson: true,
          messages: [
            { role: 'system', content: OPTIONS_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });

  return normalizeOptionsPayload(parseFirstJsonObject(raw));
};

const executeVisionBaseWithProvider = async (
  provider: LlmProvider,
  imageDataUrl: string,
  contextPrompt: string,
  lensPrompt: string
): Promise<VisionPayload> => {
  const raw =
    provider === 'anthropic'
      ? await callAnthropicVision({
          maxTokens: 420,
          systemPrompt: VISION_SYSTEM_PROMPT,
          userText: `Clinical context: ${contextPrompt}\nTask: ${lensPrompt}\nReturn strict JSON.`,
          imageDataUrl,
        })
      : await callOpenAI({
          mode: 'vision',
          maxTokens: 420,
          forceJson: false,
          messages: [
            { role: 'system', content: VISION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Clinical context: ${contextPrompt}\nTask: ${lensPrompt}\nReturn strict JSON.`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
        });

  return ensureVisionBasePayload(normalizeVisionPayload(parseFirstJsonObject(raw)));
};

const executeVisionEnrichmentWithProvider = async (
  provider: LlmProvider,
  imageDataUrl: string,
  contextPrompt: string,
  lensPrompt: string,
  basePayload: VisionPayload
): Promise<VisionPayload> => {
  const baseSummary = sanitizeText(basePayload.summary) || 'none';
  const baseFindings = (basePayload.findings || []).join('; ') || 'none';
  const baseRedFlags = (basePayload.red_flags || []).join('; ') || 'none';
  const userText = `Clinical context: ${contextPrompt}
Task: ${lensPrompt}
Base summary: ${baseSummary}
Base findings: ${baseFindings}
Base red flags: ${baseRedFlags}
Return only strict JSON for enrichment fields.`;

  const raw =
    provider === 'anthropic'
      ? await callAnthropicVision({
          maxTokens: 420,
          systemPrompt: VISION_ENRICHMENT_PROMPT,
          userText,
          imageDataUrl,
        })
      : await callOpenAI({
          mode: 'vision',
          maxTokens: 420,
          forceJson: true,
          messages: [
            { role: 'system', content: VISION_ENRICHMENT_PROMPT },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: userText,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
        });

  return normalizeVisionPayload(parseFirstJsonObject(raw));
};

const executeScanPlanWithProvider = async (
  provider: LlmProvider,
  body: ScanPlanRequest
): Promise<VisionPayload> => {
  const normalizedAnalysis = normalizeVisionPayload(body.analysis || {});
  const contextPrompt = sanitizeText(body.clinicalContext) || 'No extra clinical context provided.';
  const lens = sanitizeText(body.lens) || 'general';
  const userPrompt = `Lens: ${lens}
Clinical context: ${contextPrompt}
Base analysis: ${JSON.stringify({
  summary: normalizedAnalysis.summary,
  findings: normalizedAnalysis.findings || [],
  red_flags: normalizedAnalysis.red_flags || [],
  recommendation: normalizedAnalysis.recommendation,
  spot_diagnosis: normalizedAnalysis.spot_diagnosis,
  differentials: normalizedAnalysis.differentials || [],
  treatment_summary: normalizedAnalysis.treatment_summary,
  treatment_lines: normalizedAnalysis.treatment_lines || [],
  investigations: normalizedAnalysis.investigations || [],
  counseling: normalizedAnalysis.counseling || [],
})}

Generate a stronger treatment-focused plan as Dr. Dyrane.
Return strict JSON only.`;

  const raw =
    provider === 'anthropic'
      ? await callAnthropic({
          maxTokens: 640,
          systemPrompt: SCAN_PLAN_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.15,
        })
      : await callOpenAI({
          maxTokens: 640,
          forceJson: true,
          temperature: 0.15,
          messages: [
            { role: 'system', content: SCAN_PLAN_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });

  return normalizeVisionPayload(parseFirstJsonObject(raw));
};

export const runConsult = async (body: ConsultRequest): Promise<unknown> => {
  const primaryProvider = selectPrimaryProviderForConsult(body);
  const providerOrder = resolveProviderOrder(primaryProvider);
  const collaborationEnabled =
    shouldForceCollaborativeConsult(body) ||
    normalizeBooleanEnv(process.env.LLM_COLLABORATION, false);
  const response = await runCollaborative(
    providerOrder,
    collaborationEnabled,
    (provider) => executeConsultWithProvider(provider, body),
    mergeConsultPayloads
  );
  return applyClinicalHeuristics(body, response);
};

export const runOptions = async (body: OptionsRequest): Promise<unknown> => {
  const primaryProvider = selectPrimaryProviderForOptions(body);
  const providerOrder = resolveProviderOrder(primaryProvider);
  const collaborationEnabled = normalizeBooleanEnv(process.env.LLM_OPTIONS_COLLABORATION, false);

  return runCollaborative(
    providerOrder,
    collaborationEnabled,
    (provider) => executeOptionsWithProvider(provider, body),
    mergeOptionsPayloads
  );
};

export const runScanPlan = async (body: ScanPlanRequest): Promise<unknown> => {
  const normalizedAnalysis = normalizeVisionPayload(body.analysis || {});
  const hasBaseEvidence =
    sanitizeText(normalizedAnalysis.summary).length > 0 ||
    (normalizedAnalysis.findings || []).length > 0 ||
    (normalizedAnalysis.spot_diagnosis?.label || '').trim().length > 0;
  if (!hasBaseEvidence) {
    throw new Error('Scan plan requires a prior analysis summary, findings, or spot diagnosis.');
  }

  const providerOrder = resolveProviderOrder(selectPrimaryProviderForScanPlan(body));
  const availableProviders = providerOrder.filter((provider) => hasProviderKey(provider));
  if (availableProviders.length === 0) {
    throw new Error('No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  const payload = await runWithProviderFailover(availableProviders, (provider) =>
    executeScanPlanWithProvider(provider, {
      ...body,
      analysis: normalizedAnalysis,
    })
  );

  return finalizeVisionContract(applyVisionMinimumEnrichment(normalizeVisionPayload(payload)));
};

export const runVision = async (body: VisionRequest): Promise<unknown> => {
  const imageDataUrl = sanitizeText(body.imageDataUrl);
  // parseImageDataUrl(imageDataUrl); // Moved to provider call internally or can be called here if exporting

  const contextPrompt = sanitizeText(body.clinicalContext) || 'No extra clinical context provided.';
  const lensPrompt = sanitizeText(body.lensPrompt) || 'Analyze clinically relevant visual cues.';
  const providerOrder = resolveProviderOrder(selectPrimaryProviderForVision(body));
  const availableProviders = providerOrder.filter((provider) => hasProviderKey(provider));
  if (availableProviders.length === 0) {
    throw new Error('No vision provider API key configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }
  const basePayload = await runWithProviderFailover(availableProviders, (provider) =>
    executeVisionBaseWithProvider(provider, imageDataUrl, contextPrompt, lensPrompt)
  );

  if (!normalizeBooleanEnv(process.env.VISION_ENRICHMENT, true)) {
    return finalizeVisionContract(applyVisionMinimumEnrichment(basePayload));
  }

  try {
    const enrichmentPayload = await runWithProviderFailover(availableProviders, (provider) =>
      executeVisionEnrichmentWithProvider(
        provider,
        imageDataUrl,
        contextPrompt,
        lensPrompt,
        basePayload
      )
    );
    return finalizeVisionContract(
      applyVisionMinimumEnrichment(mergeVisionPayload(basePayload, enrichmentPayload))
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('[runVision] enrichment skipped, returning base payload', { reason });
    return finalizeVisionContract(applyVisionMinimumEnrichment(basePayload));
  }
};

const buildPrescriptionPrompt = (request: PrescriptionRequest): string => {
  const soapSummary =
    request.soap && typeof request.soap === 'object'
      ? JSON.stringify(request.soap)
      : 'No clinical features documented';
  const patientContext = [
    request.age ? `${request.age}y` : '',
    request.weight_kg ? `${request.weight_kg}kg` : '',
    request.sex || '',
    request.pregnancy ? 'pregnant' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return `DIAGNOSIS: ${request.diagnosis}${request.icd10 ? ` (ICD-10: ${request.icd10})` : ''}
PATIENT: ${patientContext || 'No patient context provided'}
URGENCY: ${request.urgency}
CLINICAL FEATURES: ${soapSummary}

Generate evidence-based prescriptions now. Return ONLY valid JSON.`;
};

const executePrescriptionGenerationWithProvider = async (
  provider: LlmProvider,
  request: PrescriptionRequest
): Promise<PrescriptionResponse> => {
  const userPrompt = buildPrescriptionPrompt(request);

  const raw =
    provider === 'anthropic'
      ? await callAnthropic({
          maxTokens: 800,
          systemPrompt: PRESCRIPTION_GENERATION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.2,
        })
      : await callOpenAI({
          maxTokens: 800,
          forceJson: true,
          temperature: 0.2,
          messages: [
            { role: 'system', content: PRESCRIPTION_GENERATION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });

  const parsed = parseFirstJsonObject(raw) as Record<string, unknown>;
  const prescriptionsRaw = Array.isArray(parsed.prescriptions) ? parsed.prescriptions : [];
  const prescriptions = prescriptionsRaw
    .map((rx: unknown) => {
      if (!rx || typeof rx !== 'object') return null;
      const obj = rx as Record<string, unknown>;
      const medication = typeof obj.medication === 'string' ? obj.medication.trim() : '';
      const form = typeof obj.form === 'string' ? obj.form.trim() : '';
      const unit = typeof obj.unit === 'string' ? obj.unit.trim() : '';
      const frequency = typeof obj.frequency === 'string' ? obj.frequency.trim() : '';
      const duration = typeof obj.duration === 'string' ? obj.duration.trim() : '';

      if (!medication || !form || !unit || !frequency || !duration) return null;

      return {
        medication,
        form,
        dose_per_kg:
          typeof obj.dose_per_kg === 'number' && Number.isFinite(obj.dose_per_kg)
            ? obj.dose_per_kg
            : null,
        max_dose:
          typeof obj.max_dose === 'number' && Number.isFinite(obj.max_dose) ? obj.max_dose : null,
        unit,
        frequency,
        duration,
        note: typeof obj.note === 'string' ? obj.note.trim() : undefined,
      };
    })
    .filter((rx): rx is NonNullable<typeof rx> => rx !== null)
    .slice(0, 8);

  return {
    prescriptions,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : 'Prescription generated',
  };
};

export const runPrescriptionGeneration = async (
  request: PrescriptionRequest
): Promise<PrescriptionResponse> => {
  const primary = selectPrimaryProviderForPrescription(request);
  const providers = resolveProviderOrder(primary);

  try {
    return await runWithProviderFailover(providers, (provider) =>
      executePrescriptionGenerationWithProvider(provider, request)
    );
  } catch (error) {
    console.error('[runPrescriptionGeneration] All providers failed:', error);
    return {
      prescriptions: [],
      rationale: error instanceof Error ? error.message : 'Unable to generate prescriptions',
    };
  }
};

export const runCycle = async (body: CycleRequest): Promise<CyclePayload> => {
  const providers = resolveProviderOrder('anthropic'); // Default to anthropic for scientist role
  
  const userPrompt = `
    CYCLE DATA: ${JSON.stringify(body.cycle)}
    PATIENT PROFILE: ${JSON.stringify(body.profile)}
    QUERY: ${body.query || 'Provide a general health and cycle scan based on recent logs.'}
  `;

  const raw = await runWithProviderFailover(providers, (provider) => 
    provider === 'anthropic' 
    ? callAnthropic({
        maxTokens: 1000,
        systemPrompt: CYCLE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    : callOpenAI({
        maxTokens: 1000,
        forceJson: true,
        messages: [
          { role: 'system', content: CYCLE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
  );

  return parseFirstJsonObject(raw) as CyclePayload;
};


// Re-export types for server modules
export type {
  ConsultRequest,
  OptionsRequest,
  VisionRequest,
  ScanPlanRequest,
  PrescriptionRequest,
  CycleRequest,
};
