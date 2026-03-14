import {
  ClinicalState,
  ConversationMessage,
  AgentState,
  ClinicalOutputContract,
} from '../types/clinical';
import { getPromptCache, recordPromptUsage, setPromptCache } from '../storage/promptCache';
import { normalizePercentage } from './agent/clinicalMath';
import { buildEncounterDossier } from './agent/encounterMemory';
import { beginAiTask } from '../services/aiActivity';

const CONVERSATION_CACHE_TTL_MS = 1000 * 12;

type ConversationEngineResult = {
  message: ConversationMessage;
  soap_updates: Partial<ClinicalState['soap']>;
  ddx: string[];
  agent_state: AgentState;
  urgency: ClinicalState['urgency'];
  probability: number;
  thinking: string;
  needs_options: boolean;
  lens_trigger: string | null;
  status: ClinicalState['status'];
  clinical_contract: ClinicalOutputContract;
};

const ICD10_PATTERN = /\(ICD-10:\s*([A-Z0-9.-]+)\)/i;

const sanitizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeIcd10 = (value: unknown): string =>
  sanitizeText(value).toUpperCase().replace(/[^A-Z0-9.-]/g, '');

const sanitizeList = (value: unknown, maxItems = 10): string[] =>
  Array.isArray(value)
    ? value.map((item) => sanitizeText(item)).filter(Boolean).slice(0, maxItems)
    : [];

const toClinicalStatus = (value: unknown, fallback: ClinicalState['status']): ClinicalState['status'] => {
  const normalized = sanitizeText(value);
  return normalized === 'idle' ||
    normalized === 'intake' ||
    normalized === 'active' ||
    normalized === 'lens' ||
    normalized === 'emergency' ||
    normalized === 'complete'
    ? normalized
    : fallback;
};

const toClinicalUrgency = (
  value: unknown,
  fallback: ClinicalState['urgency']
): ClinicalState['urgency'] => {
  const normalized = sanitizeText(value).toLowerCase();
  return normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'critical'
    ? normalized
    : fallback;
};

const toLikelihood = (value: unknown): 'high' | 'medium' | 'low' => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
};

const toCheckpointStatus = (
  value: unknown,
  fallback: AgentState['must_not_miss_checkpoint']['status']
): AgentState['must_not_miss_checkpoint']['status'] => {
  const normalized = sanitizeText(value).toLowerCase();
  return normalized === 'idle' ||
    normalized === 'pending' ||
    normalized === 'cleared' ||
    normalized === 'escalate'
    ? normalized
    : fallback;
};

const toAgentPhase = (
  value: unknown,
  fallback: AgentState['phase']
): AgentState['phase'] => {
  const normalized = sanitizeText(value).toLowerCase();
  return normalized === 'intake' ||
    normalized === 'assessment' ||
    normalized === 'differential' ||
    normalized === 'resolution' ||
    normalized === 'followup'
    ? normalized
    : fallback;
};

const parseDiagnosisSeed = (
  value: unknown,
  fallbackCode: string
): { label: string; icd10: string } | null => {
  const text = sanitizeText(value);
  if (!text) return null;
  const extractedCode = sanitizeIcd10(text.match(ICD10_PATTERN)?.[1] || '');
  const label = text.replace(ICD10_PATTERN, '').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  return {
    label,
    icd10: extractedCode || fallbackCode,
  };
};

const buildClinicalOutputContract = (
  rawPayload: Record<string, unknown>,
  fallbackDdx: string[],
  fallbackProbability: number
): ClinicalOutputContract => {
  const diagnosisRaw =
    rawPayload.diagnosis && typeof rawPayload.diagnosis === 'object'
      ? (rawPayload.diagnosis as Record<string, unknown>)
      : {};
  const differentialsRaw = Array.isArray(rawPayload.differentials)
    ? (rawPayload.differentials as Array<Record<string, unknown>>)
    : [];
  const ddxFallback = sanitizeList(rawPayload.ddx, 8);
  const fallbackList = ddxFallback.length > 0 ? ddxFallback : fallbackDdx;

  const leadFromDiagnosis = parseDiagnosisSeed(
    sanitizeText(diagnosisRaw.label),
    sanitizeIcd10(diagnosisRaw.icd10) || 'R69'
  );
  const leadFromDdx = parseDiagnosisSeed(fallbackList[0], 'R69');
  const lead = leadFromDiagnosis || leadFromDdx || { label: 'Undifferentiated clinical syndrome', icd10: 'R69' };

  const differentialSource = [
    ...differentialsRaw
      .map((entry) => {
        const seed = parseDiagnosisSeed(
          sanitizeText(entry.label),
          sanitizeIcd10(entry.icd10) || lead.icd10
        );
        if (!seed) return null;
        return {
          label: seed.label,
          icd10: seed.icd10,
          likelihood: toLikelihood(entry.likelihood),
          rationale: sanitizeText(entry.rationale) || undefined,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    ...fallbackList.map((entry, index) => {
      const seed = parseDiagnosisSeed(entry, lead.icd10);
      if (!seed) return null;
      return {
        label: seed.label,
        icd10: seed.icd10,
        likelihood: (index === 0 ? 'high' : index <= 2 ? 'medium' : 'low') as
          | 'high'
          | 'medium'
          | 'low',
        rationale: undefined,
      };
    }),
  ]
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);

  const seen = new Set<string>();
  const differentials = differentialSource.filter((entry) => {
    const key = `${entry.label.toLowerCase()}::${entry.icd10}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const management = sanitizeList(rawPayload.management, 10);
  const investigations = sanitizeList(rawPayload.investigations, 10);
  const counseling = sanitizeList(rawPayload.counseling, 10);
  const redFlags = sanitizeList(rawPayload.red_flags, 10);
  const diagnosisConfidence = normalizePercentage(diagnosisRaw.confidence, fallbackProbability);

  return {
    diagnosis: {
      label: lead.label,
      icd10: lead.icd10 || 'R69',
      confidence: diagnosisConfidence,
      rationale:
        sanitizeText(diagnosisRaw.rationale) ||
        'Diagnosis selected from accumulated history and differential weighting.',
    },
    differentials:
      differentials.length > 0
        ? differentials
        : [
            { label: lead.label, icd10: lead.icd10 || 'R69', likelihood: 'high' },
            { label: 'Alternative inflammatory syndrome', icd10: 'R50.9', likelihood: 'medium' },
            { label: 'Alternative infectious syndrome', icd10: 'A49.9', likelihood: 'medium' },
          ],
    management:
      management.length > 0
        ? management
        : [
            'Initiate diagnosis-directed management protocol now.',
            'Monitor symptom trajectory and vitals over the next 24-48 hours.',
            'Escalate immediately if any listed red flag appears.',
          ],
    investigations:
      investigations.length > 0
        ? investigations
        : [
            'Order targeted confirmatory tests for the lead diagnosis.',
            'Run baseline safety labs and reassessment markers.',
          ],
    counseling:
      counseling.length > 0
        ? counseling
        : [
            'Adhere to the management plan exactly as prescribed.',
            'Return urgently if symptoms worsen or new danger signs appear.',
          ],
    red_flags:
      redFlags.length > 0
        ? redFlags
        : [
            'Breathing difficulty',
            'Confusion or altered mental status',
            'Persistent vomiting',
            'Bleeding',
            'Rapid clinical deterioration',
          ],
  };
};

const getConversationFingerprint = (state: ClinicalState): string =>
  state.conversation
    .slice(-6)
    .map((message) => `${message.role}:${(message.metadata?.question || message.content || '').slice(0, 80)}`)
    .join('|');

export const callConversationEngine = async (
  patientInput: string,
  state: ClinicalState
): Promise<ConversationEngineResult> => {
  const activity = beginAiTask({
    scope: 'consult',
    title: 'Clinical reasoning',
    nodes: [
      { id: 'prepare', label: 'Preparing encounter context' },
      { id: 'consult_call', label: 'Calling consult model' },
      { id: 'structure', label: 'Structuring response' },
    ],
  });
  activity.start('prepare', 'Collecting memory and SOAP');

  const memoryDossier = buildEncounterDossier(state);
  const turnThreadMarker = `${state.sessionId}:${state.conversation.length}`;
  const conversationCacheKey = [
    'conversation',
    turnThreadMarker,
    patientInput.trim().toLowerCase(),
    state.urgency,
    state.agent_state.phase,
    getConversationFingerprint(state),
    memoryDossier.slice(0, 420),
    JSON.stringify(state.soap),
  ].join('::');

  const cached = getPromptCache<ConversationEngineResult>(conversationCacheKey);

  if (cached) {
    activity.succeed('prepare', 'Context ready');
    activity.skip('consult_call', 'Cached response');
    activity.succeed('structure', 'Loaded from cache');
    activity.finishSuccess('Clinical response ready');
    const cachedContract = cached.clinical_contract
      ? cached.clinical_contract
      : buildClinicalOutputContract(
          cached as unknown as Record<string, unknown>,
          cached.ddx || state.ddx,
          normalizePercentage(cached.probability, state.probability)
        );
    return {
      ...cached,
      message: { ...cached.message, id: crypto.randomUUID(), timestamp: Date.now() },
      clinical_contract: cachedContract,
    };
  }

  recordPromptUsage('conversation', conversationCacheKey);

  try {
    activity.succeed('prepare', 'Context ready');
    activity.start('consult_call', 'Waiting for model');
    const response = await fetch('/api/consult', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patientInput,
        state: {
          session_id: state.sessionId,
          turn_index: state.conversation.length,
          soap: state.soap,
          agent_state: state.agent_state,
          ddx: state.ddx,
          urgency: state.urgency,
          probability: state.probability,
          profile: {
            display_name: state.profile.display_name,
            age: state.profile.age ?? null,
            weight_kg: state.profile.weight_kg ?? null,
            sex: state.profile.sex ?? null,
            pronouns: state.profile.pronouns ?? null,
            allergies: state.profile.allergies ?? null,
            chronic_conditions: state.profile.chronic_conditions ?? null,
            medications: state.profile.medications ?? null,
          },
          memory_dossier: memoryDossier,
          conversation: state.conversation.slice(-80).map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        },
      })
    });

    if (!response.ok) {
      const rawError = await response.text().catch(() => '');
      let parsedError = '';
      if (rawError) {
        try {
          const json = JSON.parse(rawError) as { error?: string };
          parsedError = json.error || '';
        } catch {
          parsedError = rawError.trim();
        }
      }
      activity.fail('consult_call', 'Consult API failed');
      activity.finishError(parsedError || `HTTP ${response.status}`);
      throw new Error(`Conversation API Error: ${parsedError || response.status}`);
    }
    activity.succeed('consult_call', 'Model response received');
    activity.start('structure', 'Normalizing output');

    const aiResponse = (await response.json()) as Record<string, unknown>;
    const agentStateRaw =
      aiResponse.agent_state && typeof aiResponse.agent_state === 'object'
        ? (aiResponse.agent_state as Record<string, unknown>)
        : {};
    const checkpointRaw =
      agentStateRaw.must_not_miss_checkpoint &&
      typeof agentStateRaw.must_not_miss_checkpoint === 'object'
        ? (agentStateRaw.must_not_miss_checkpoint as Record<string, unknown>)
        : null;
    const normalizedAgentState: AgentState = {
      phase: toAgentPhase(agentStateRaw.phase, state.agent_state.phase),
      confidence: normalizePercentage(agentStateRaw.confidence, state.agent_state.confidence),
      focus_area: sanitizeText(agentStateRaw.focus_area) || state.agent_state.focus_area,
      pending_actions: Array.isArray(agentStateRaw.pending_actions)
        ? (agentStateRaw.pending_actions as string[]).slice(0, 8)
        : state.agent_state.pending_actions,
      last_decision: sanitizeText(agentStateRaw.last_decision) || state.agent_state.last_decision,
      positive_findings: Array.isArray(agentStateRaw.positive_findings)
        ? (agentStateRaw.positive_findings as string[]).slice(0, 24)
        : state.agent_state.positive_findings || [],
      negative_findings: Array.isArray(agentStateRaw.negative_findings)
        ? (agentStateRaw.negative_findings as string[]).slice(0, 24)
        : state.agent_state.negative_findings || [],
      must_not_miss_checkpoint: {
        required: Boolean(checkpointRaw?.required ?? state.agent_state.must_not_miss_checkpoint?.required),
        status: toCheckpointStatus(
          checkpointRaw?.status,
          state.agent_state.must_not_miss_checkpoint?.status || 'idle'
        ),
        last_question:
          sanitizeText(checkpointRaw?.last_question) ||
          state.agent_state.must_not_miss_checkpoint?.last_question,
        last_response:
          sanitizeText(checkpointRaw?.last_response) ||
          state.agent_state.must_not_miss_checkpoint?.last_response,
        updated_at:
          Number(checkpointRaw?.updated_at) ||
          state.agent_state.must_not_miss_checkpoint?.updated_at,
      },
    };
    const normalizedProbability = normalizePercentage(aiResponse?.probability, state.probability);
    const normalizedDdx = sanitizeList(aiResponse.ddx, 8);
    const resolvedDdx = normalizedDdx.length > 0 ? normalizedDdx : state.ddx;
    const clinicalContract = buildClinicalOutputContract(
      aiResponse,
      resolvedDdx,
      normalizedProbability
    );
    const normalizedSoapUpdates =
      aiResponse.soap_updates && typeof aiResponse.soap_updates === 'object'
        ? (aiResponse.soap_updates as Partial<ClinicalState['soap']>)
        : {};

    // Create conversation message
    const fullContent = [sanitizeText(aiResponse.statement), sanitizeText(aiResponse.question)]
      .filter(Boolean)
      .join(' ');
    
    const doctorMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'doctor',
      content: fullContent || sanitizeText(aiResponse.message),
      timestamp: Date.now(),
      metadata: {
        soap_updates: normalizedSoapUpdates,
        urgency: toClinicalUrgency(aiResponse.urgency, state.urgency),
        probability: normalizedProbability,
        thinking: sanitizeText(aiResponse.thinking),
        statement: sanitizeText(aiResponse.statement),
        question: sanitizeText(aiResponse.question),
        lens_trigger: sanitizeText(aiResponse.lens_trigger) || null
      }
    };

    const normalizedResult: ConversationEngineResult = {
      message: doctorMessage,
      soap_updates: normalizedSoapUpdates,
      agent_state: normalizedAgentState,
      ddx: resolvedDdx,
      urgency: toClinicalUrgency(aiResponse.urgency, state.urgency),
      probability: normalizedProbability,
      thinking: sanitizeText(aiResponse.thinking) || state.thinking || 'Continuing clinical assessment',
      needs_options: Boolean(aiResponse.needs_options),
      lens_trigger: sanitizeText(aiResponse.lens_trigger) || null,
      status: toClinicalStatus(aiResponse.status, state.status),
      clinical_contract: clinicalContract,
    };
    setPromptCache(conversationCacheKey, normalizedResult, CONVERSATION_CACHE_TTL_MS);
    activity.succeed('structure', 'Response ready');
    activity.finishSuccess('Clinical response ready');
    return normalizedResult;

  } catch (error) {
    console.error("Conversation Engine Error:", error);
    activity.finishError(error instanceof Error ? error.message : 'Conversation error');
    throw error;
  }
};
