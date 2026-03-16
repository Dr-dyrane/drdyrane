import { LlmProvider, ConsultRequest, OptionsRequest, VisionRequest, ScanPlanRequest, PrescriptionRequest } from '../_lib/types';
import { normalizeEnvValue, normalizeProvider, sanitizeText } from '../_lib/utils';
import { normalizeVisionPayload } from '../_lib/parsers';

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export const FALLBACK_ANTHROPIC_MODELS = ['claude-3-5-haiku-20241022'];
export const FALLBACK_OPENAI_MODELS = ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'];
export const FALLBACK_OPENAI_VISION_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];

export const getApiKey = (provider: LlmProvider): string => {
  const candidates =
    provider === 'anthropic'
      ? [
          normalizeEnvValue(process.env.ANTHROPIC_API_KEY),
          normalizeEnvValue(process.env.CLAUDE_API_KEY),
        ]
      : [
          normalizeEnvValue(process.env.OPENAI_API_KEY),
        ];
  return candidates.find((value) => value.length > 0) || '';
};

export const getModelCandidates = (
  provider: LlmProvider,
  mode: 'chat' | 'vision' = 'chat'
): string[] => {
  if (provider === 'anthropic') {
    const candidates = [
      normalizeEnvValue(process.env.ANTHROPIC_MODEL),
      normalizeEnvValue(process.env.CLAUDE_MODEL),
      ...FALLBACK_ANTHROPIC_MODELS,
    ];
    return [...new Set(candidates.filter((value) => value.length > 0))];
  }

  const openAiFallback = mode === 'vision' ? FALLBACK_OPENAI_VISION_MODELS : FALLBACK_OPENAI_MODELS;
  const candidates = [
    normalizeEnvValue(mode === 'vision' ? process.env.OPENAI_VISION_MODEL : process.env.OPENAI_MODEL),
    normalizeEnvValue(process.env.OPENAI_MODEL),
    ...openAiFallback,
  ];
  return [...new Set(candidates.filter((value) => value.length > 0))];
};

export const hasProviderKey = (provider: LlmProvider): boolean => getApiKey(provider).length > 0;

export const shouldRetryWithNextModel = (
  provider: LlmProvider,
  status: number,
  body: string
): boolean => {
  if (status !== 400 && status !== 404) return false;

  if (provider === 'anthropic') {
    return /model|not[_\s-]?found|invalid_request_error/i.test(body);
  }

  return /model|does not exist|invalid[_\s-]?model|not[_\s-]?found/i.test(body);
};

export const extractOpenAiText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const node = item as Record<string, unknown>;
        return sanitizeText(node.text);
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

export const extractAnthropicText = (content: unknown): string => {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const node = item as Record<string, unknown>;
      if (sanitizeText(node.type).toLowerCase() !== 'text') return '';
      return sanitizeText(node.text);
    })
    .filter(Boolean)
    .join(' ');
};

export const parseImageDataUrl = (imageDataUrl: string): { mediaType: string; base64Data: string } => {
  const normalized = sanitizeText(imageDataUrl);
  const prefix = 'data:';
  const marker = ';base64,';
  if (!normalized.startsWith(prefix)) {
    throw new Error('Vision API expects a base64 data URL image payload.');
  }
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex <= prefix.length) {
    throw new Error('Invalid image data URL: missing media type or base64 marker.');
  }
  const mediaType = normalized.slice(prefix.length, markerIndex).toLowerCase();
  const base64Data = normalized.slice(markerIndex + marker.length).replace(/\s+/g, '');
  if (!mediaType.startsWith('image/')) {
    throw new Error('Invalid image data URL: media type must be image/*.');
  }
  if (!base64Data) {
    throw new Error('Invalid image data URL: base64 image payload is empty.');
  }
  return { mediaType, base64Data };
};

export const callAnthropic = async (input: {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  temperature?: number;
}): Promise<string> => {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'Missing Anthropic key on server. Configure ANTHROPIC_API_KEY.'
    );
  }

  const models = getModelCandidates('anthropic');
  if (models.length === 0) {
    throw new Error('No Anthropic model configured. Set ANTHROPIC_MODEL or CLAUDE_MODEL.');
  }

  let lastErrorMessage = 'Unknown Anthropic failure.';
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens,
          temperature: input.temperature ?? 0.2,
          system: [{ type: 'text', text: input.systemPrompt }],
          messages: input.messages,
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as { content?: Array<{ text?: string }> };
        return extractAnthropicText(data?.content);
      }

      const body = await response.text();
      lastErrorMessage = `Anthropic request failed (${response.status}) [model:${model}]: ${body}`;
      const hasAnotherCandidate = index < models.length - 1;
      if (hasAnotherCandidate && shouldRetryWithNextModel('anthropic', response.status, body)) {
        continue;
      }
      throw new Error(lastErrorMessage);
    } catch (error) {
      const hasAnotherCandidate = index < models.length - 1;
      lastErrorMessage = error instanceof Error ? error.message : lastErrorMessage;
      if (!hasAnotherCandidate) {
        throw new Error(lastErrorMessage);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastErrorMessage);
};

export const callAnthropicVision = async (input: {
  systemPrompt: string;
  userText: string;
  imageDataUrl: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> => {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'Missing Anthropic key on server. Configure ANTHROPIC_API_KEY.'
    );
  }

  const models = getModelCandidates('anthropic', 'vision');
  if (models.length === 0) {
    throw new Error('No Anthropic model configured. Set ANTHROPIC_MODEL or CLAUDE_MODEL.');
  }

  const { mediaType, base64Data } = parseImageDataUrl(input.imageDataUrl);
  let lastErrorMessage = 'Unknown Anthropic vision failure.';

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens,
          temperature: input.temperature ?? 0.2,
          system: [{ type: 'text', text: input.systemPrompt }],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: input.userText },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as { content?: Array<Record<string, unknown>> };
        return extractAnthropicText(data?.content);
      }

      const body = await response.text();
      lastErrorMessage = `Anthropic vision request failed (${response.status}) [model:${model}]: ${body}`;
      const hasAnotherCandidate = index < models.length - 1;
      if (hasAnotherCandidate && shouldRetryWithNextModel('anthropic', response.status, body)) {
        continue;
      }
      throw new Error(lastErrorMessage);
    } catch (error) {
      const hasAnotherCandidate = index < models.length - 1;
      lastErrorMessage = error instanceof Error ? error.message : lastErrorMessage;
      if (!hasAnotherCandidate) {
        throw new Error(lastErrorMessage);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastErrorMessage);
};

export const callOpenAI = async (input: {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }>;
  }>;
  maxTokens: number;
  mode?: 'chat' | 'vision';
  forceJson?: boolean;
  temperature?: number;
}): Promise<string> => {
  const apiKey = getApiKey('openai');
  if (!apiKey) {
    throw new Error('Missing OpenAI key on server. Configure OPENAI_API_KEY.');
  }

  const mode = input.mode || 'chat';
  const models = getModelCandidates('openai', mode);
  if (models.length === 0) {
    throw new Error('No OpenAI model configured. Set OPENAI_MODEL.');
  }

  let lastErrorMessage = 'Unknown OpenAI failure.';
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(OPENAI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          max_tokens: input.maxTokens,
          temperature: input.temperature ?? 0.2,
          ...(input.forceJson ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
        };
        const content = data?.choices?.[0]?.message?.content;
        return extractOpenAiText(content);
      }

      const body = await response.text();
      lastErrorMessage = `OpenAI request failed (${response.status}) [model:${model}]: ${body}`;
      const hasAnotherCandidate = index < models.length - 1;
      if (hasAnotherCandidate && shouldRetryWithNextModel('openai', response.status, body)) {
        continue;
      }
      throw new Error(lastErrorMessage);
    } catch (error) {
      const hasAnotherCandidate = index < models.length - 1;
      lastErrorMessage = error instanceof Error ? error.message : lastErrorMessage;
      if (!hasAnotherCandidate) {
        throw new Error(lastErrorMessage);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastErrorMessage);
};

export const resolveProviderOrder = (primary: LlmProvider): LlmProvider[] =>
  primary === 'anthropic' ? ['anthropic', 'openai'] : ['openai', 'anthropic'];

export const getProviderFailureMessage = (provider: LlmProvider, reason: unknown): string => {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'Unknown provider failure.';
  return `[${provider}] ${message}`;
};

export const runWithProviderFailover = async <T>(
  providers: LlmProvider[],
  invoke: (provider: LlmProvider) => Promise<T>
): Promise<T> => {
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      return await invoke(provider);
    } catch (error) {
      failures.push(getProviderFailureMessage(provider, error));
    }
  }

  throw new Error(failures.join(' | '));
};

export const runCollaborative = async <T>(
  providers: LlmProvider[],
  collaborationEnabled: boolean,
  invoke: (provider: LlmProvider) => Promise<T>,
  merge: (primary: T, secondary: T) => T
): Promise<T> => {
  const available = providers.filter((provider) => hasProviderKey(provider));
  if (available.length === 0) {
    throw new Error('No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  if (!collaborationEnabled || available.length < 2) {
    return runWithProviderFailover(available, invoke);
  }

  const [primaryProvider, secondaryProvider] = available;
  const [primaryResult, secondaryResult] = await Promise.allSettled([
    invoke(primaryProvider),
    invoke(secondaryProvider),
  ]);

  if (primaryResult.status === 'fulfilled' && secondaryResult.status === 'fulfilled') {
    return merge(primaryResult.value, secondaryResult.value);
  }

  if (primaryResult.status === 'fulfilled') {
    return primaryResult.value;
  }

  if (secondaryResult.status === 'fulfilled') {
    return secondaryResult.value;
  }

  const primaryReason =
    primaryResult.status === 'rejected'
      ? getProviderFailureMessage(primaryProvider, primaryResult.reason)
      : `[${primaryProvider}] Primary provider failed.`;
  const secondaryReason =
    secondaryResult.status === 'rejected'
      ? getProviderFailureMessage(secondaryProvider, secondaryResult.reason)
      : `[${secondaryProvider}] Secondary provider failed.`;
  throw new Error(`${primaryReason} | ${secondaryReason}`);
};

export const selectPrimaryProviderForConsult = (body: ConsultRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_CONSULT_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const urgency = sanitizeText(body.state?.urgency).toLowerCase();
  const phase = sanitizeText(body.state?.agent_state?.phase as string).toLowerCase();
  const textCorpus = `${body.patientInput || ''} ${body.state?.memory_dossier || ''}`.toLowerCase();

  if (urgency === 'high' || urgency === 'critical') return 'anthropic';
  if (phase === 'differential' || phase === 'resolution') return 'anthropic';
  if (/(chest pain|shortness of breath|stroke|seizure|faint|collapse|confusion)/i.test(textCorpus)) {
    return 'anthropic';
  }
  if (/(rash|lesion|ulcer|swelling|bruise|skin|eye|vision|photo|image)/i.test(textCorpus)) {
    return 'openai';
  }
  return 'openai';
};

export const selectPrimaryProviderForOptions = (body: OptionsRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_OPTIONS_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const question = sanitizeText(body.lastQuestion).toLowerCase();
  const phase = sanitizeText(body.agentState?.phase as string).toLowerCase();

  if (phase === 'differential' || phase === 'resolution') return 'anthropic';
  if (/(yes or no|\\?|scale|rate|1-10|one to ten|severity)/i.test(question)) return 'openai';
  return 'openai';
};

export const selectPrimaryProviderForVision = (body: VisionRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_VISION_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const corpus = `${sanitizeText(body.clinicalContext)} ${sanitizeText(body.lensPrompt)}`.toLowerCase();
  if (/(differential|icd-?10|must-not-miss|critical|triage)/i.test(corpus)) return 'anthropic';
  return 'openai';
};

export const selectPrimaryProviderForScanPlan = (body: ScanPlanRequest): LlmProvider => {
  const forced = normalizeProvider(process.env.LLM_SCAN_PROVIDER || process.env.LLM_PROVIDER);
  if (forced) return forced;

  const analysis = normalizeVisionPayload(body.analysis || {});
  const corpus = [
    sanitizeText(body.clinicalContext),
    sanitizeText(analysis.summary),
    ...(analysis.findings || []),
    ...(analysis.red_flags || []),
    sanitizeText(analysis.recommendation),
    sanitizeText(analysis.spot_diagnosis?.label),
    ...(analysis.differentials || []).map((entry) => sanitizeText(entry.label)),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(critical|unstable|must-not-miss|shock|stroke|sepsis|respiratory distress)/i.test(corpus)) {
    return 'anthropic';
  }
  return 'openai';
};

export const selectPrimaryProviderForPrescription = (request: PrescriptionRequest): LlmProvider => {
  const forced = normalizeProvider(
    process.env.LLM_PRESCRIPTION_PROVIDER || process.env.LLM_PROVIDER
  );
  if (forced) return forced;

  const diagnosisLower = request.diagnosis.toLowerCase();
  if (
    /(rare|complex|syndrome|disorder|chronic|autoimmune)/i.test(diagnosisLower) ||
    request.urgency === 'critical'
  ) {
    return 'anthropic';
  }
  return 'openai';
};

export const shouldForceCollaborativeConsult = (body: ConsultRequest): boolean => {
  const urgency = sanitizeText(body.state?.urgency).toLowerCase();
  if (urgency === 'critical' || urgency === 'high') return true;

  const checkpoint = body.state?.agent_state?.must_not_miss_checkpoint as
    | { required?: unknown; status?: unknown }
    | undefined;
  if (checkpoint?.required === true || sanitizeText(checkpoint?.status as string) === 'pending') {
    return true;
  }

  const textCorpus = `${body.patientInput || ''} ${body.state?.memory_dossier || ''}`.toLowerCase();
  return /(stroke|seizure|collapse|cannot breathe|chest pain|uncontrolled bleeding)/i.test(textCorpus);
};
