import { ClinicalState, ConversationMessage, AgentState } from '../types/clinical';
import { getPromptCache, recordPromptUsage, setPromptCache } from '../storage/promptCache';
import { normalizePercentage } from './agent/clinicalMath';
import { buildEncounterDossier } from './agent/encounterMemory';

const CONVERSATION_CACHE_TTL_MS = 1000 * 12;

const getConversationFingerprint = (state: ClinicalState): string =>
  state.conversation
    .slice(-6)
    .map((message) => `${message.role}:${(message.metadata?.question || message.content || '').slice(0, 80)}`)
    .join('|');

export const callConversationEngine = async (
  patientInput: string,
  state: ClinicalState
): Promise<{
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
}> => {
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

  const cached = getPromptCache<{
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
  }>(conversationCacheKey);

  if (cached) {
    return {
      ...cached,
      message: { ...cached.message, id: crypto.randomUUID(), timestamp: Date.now() },
    };
  }

  recordPromptUsage('conversation', conversationCacheKey);

  try {
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
          conversation: state.conversation.slice(-24).map((msg) => ({
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
      throw new Error(`Conversation API Error: ${parsedError || response.status}`);
    }

    const aiResponse = await response.json();
    const checkpointRaw =
      aiResponse?.agent_state?.must_not_miss_checkpoint &&
      typeof aiResponse.agent_state.must_not_miss_checkpoint === 'object'
        ? aiResponse.agent_state.must_not_miss_checkpoint
        : null;
    const normalizedAgentState: AgentState = {
      phase: aiResponse?.agent_state?.phase || state.agent_state.phase,
      confidence: normalizePercentage(aiResponse?.agent_state?.confidence, state.agent_state.confidence),
      focus_area: aiResponse?.agent_state?.focus_area || state.agent_state.focus_area,
      pending_actions: Array.isArray(aiResponse?.agent_state?.pending_actions)
        ? aiResponse.agent_state.pending_actions.slice(0, 8)
        : state.agent_state.pending_actions,
      last_decision: aiResponse?.agent_state?.last_decision || state.agent_state.last_decision,
      positive_findings: Array.isArray(aiResponse?.agent_state?.positive_findings)
        ? aiResponse.agent_state.positive_findings.slice(0, 24)
        : state.agent_state.positive_findings || [],
      negative_findings: Array.isArray(aiResponse?.agent_state?.negative_findings)
        ? aiResponse.agent_state.negative_findings.slice(0, 24)
        : state.agent_state.negative_findings || [],
      must_not_miss_checkpoint: {
        required: Boolean(checkpointRaw?.required ?? state.agent_state.must_not_miss_checkpoint?.required),
        status:
          checkpointRaw?.status ||
          state.agent_state.must_not_miss_checkpoint?.status ||
          'idle',
        last_question:
          checkpointRaw?.last_question || state.agent_state.must_not_miss_checkpoint?.last_question,
        last_response:
          checkpointRaw?.last_response || state.agent_state.must_not_miss_checkpoint?.last_response,
        updated_at:
          Number(checkpointRaw?.updated_at) ||
          state.agent_state.must_not_miss_checkpoint?.updated_at,
      },
    };
    const normalizedProbability = normalizePercentage(aiResponse?.probability, state.probability);

    // Create conversation message
    const fullContent = [aiResponse.statement, aiResponse.question].filter(Boolean).join(' ');
    
    const doctorMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'doctor',
      content: fullContent || aiResponse.message || "",
      timestamp: Date.now(),
      metadata: {
        soap_updates: aiResponse.soap_updates,
        urgency: aiResponse.urgency,
        probability: normalizedProbability,
        thinking: aiResponse.thinking,
        statement: aiResponse.statement,
        question: aiResponse.question,
        lens_trigger: aiResponse.lens_trigger ?? null
      }
    };

    const normalizedResult = {
      message: doctorMessage,
      soap_updates: aiResponse.soap_updates || {},
      agent_state: normalizedAgentState,
      ddx: aiResponse.ddx || state.ddx,
      urgency: aiResponse.urgency,
      probability: normalizedProbability,
      thinking: aiResponse.thinking,
      needs_options: aiResponse.needs_options,
      lens_trigger: aiResponse.lens_trigger ?? null,
      status: aiResponse.status
    };
    setPromptCache(conversationCacheKey, normalizedResult, CONVERSATION_CACHE_TTL_MS);
    return normalizedResult;

  } catch (error) {
    console.error("Conversation Engine Error:", error);
    throw error;
  }
};
