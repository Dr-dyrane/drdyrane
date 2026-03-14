import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ChevronLeft, ImagePlus, Loader2, Timer, X } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { signalFeedback, playLoadingPhaseCue } from '../../core/services/feedback';
import { resolveProfileAvatarWithFallback } from '../../core/storage/avatarStore';
import { resolveTheme } from '../../core/theme/resolveTheme';
import { isProfileOnboardingComplete } from '../../core/profile/onboarding';
import { analyzeClinicalImage, VISION_UPLOAD_FILE_LIMIT_BYTES } from '../../core/api/visionEngine';
import { ResponseOptions } from '../../core/types/clinical';
import { buildLocalOptions } from '../../core/api/agent/localOptions';
import { normalizeSingleQuestionPrompt } from '../../core/api/agent/questionInvariant';
import { getInvariantAuditSnapshot, recordInvariantEvent } from '../../core/api/agent/invariantAudit';
import { buildUserFacingError, UserFacingError } from '../../core/errors/userMessage';
import {
  ONBOARDING_NOTIFICATION_BODY,
  ONBOARDING_NOTIFICATION_TITLE,
  isOnboardingNotification,
} from '../../core/notifications/onboardingNotification';
import { Orb } from './Orb';
import { ResponseOptionsPanel } from './components/ResponseOptionsPanel';
import { AiActivityTimeline } from '../../components/shared/AiActivityTimeline';
import { InlineErrorBlade } from '../../components/shared/InlineErrorBlade';
import { InvariantGuardBlade } from '../../components/shared/InvariantGuardBlade';

const LOADING_PHASES = [
  'Analyzing history',
  'Narrowing differential',
  'Selecting next question',
];
const INPUT_CHAR_LIMIT = 1200;
const ASSISTIVE_SUGGESTION_CAP = 4;
const DANGER_GATE_PATTERN =
  /danger signs?|breathlessness|confusion|persistent vomiting|bleeding|chest pain|fainting|breathing trouble/i;
const DIRECT_BINARY_QUESTION_PATTERN = /^(is|are|do|did|have|has|can|could|will|would|should|any)\b/i;
const TIMELINE_QUESTION_PATTERN = /\b(how long|since when|when did|when .* start|started|start)\b/i;
const SUMMARY_QUESTION_PATTERN = /\b(summary|working diagnosis|finalize|plan)\b/i;
const TIMELINE_OPTION_PATTERN = /\bstarted today\b|\b1-2 days\b|\b3-4 days\b|\b5-7 days\b|\bweek\b/i;
const SUMMARY_OPTION_PATTERN = /\bready for summary\b|\badd one detail\b|\bnot sure\b/i;
const DANGER_OPTION_PATTERN =
  /\bnone of these\b|\bbreathlessness\b|\bconfusion\b|\bchest pain\b|\bpersistent vomiting\b|\bbleeding\b/i;

const extractQuestionClause = (prompt: string): string => {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  const questionIndex = compact.lastIndexOf('?');
  if (questionIndex >= 0) {
    const uptoQuestion = compact.slice(0, questionIndex);
    const sentenceStart = Math.max(uptoQuestion.lastIndexOf('.'), uptoQuestion.lastIndexOf('!'));
    return uptoQuestion.slice(sentenceStart + 1).trim().toLowerCase();
  }

  const sentenceStart = Math.max(compact.lastIndexOf('.'), compact.lastIndexOf('!'));
  return compact.slice(sentenceStart + 1).trim().toLowerCase();
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });

const hasBinaryOptionShape = (options: ResponseOptions | null): boolean => {
  if (!options || !Array.isArray(options.options) || options.options.length === 0) return false;
  const texts = options.options.map((option) => option.text.toLowerCase());
  const hasYes = texts.some((text) => text === 'yes');
  const hasNoLike = texts.some((text) => text === 'no' || text === 'none of these');
  return hasYes && hasNoLike;
};

const buildTimedGateOptions = (prompt: string, contextHint: string): ResponseOptions => {
  const negativeLabel = DANGER_GATE_PATTERN.test(prompt) ? 'None of these' : 'No';
  return {
    mode: 'single',
    ui_variant: 'segmented',
    options: [
      { id: 'yes', text: 'Yes', category: 'confirmation', priority: 10 },
      { id: 'no', text: negativeLabel, category: 'confirmation', priority: 9 },
      { id: 'unsure', text: 'Not sure', category: 'confirmation', priority: 8 },
    ],
    allow_custom_input: true,
    context_hint: contextHint,
  };
};

const isBinaryQuestionPrompt = (prompt: string): boolean => {
  const normalized = extractQuestionClause(prompt);
  if (!normalized) return false;
  if (normalized.includes(' how many ') || normalized.startsWith('how many')) return false;
  if (normalized.includes(' how long ') || normalized.startsWith('how long')) return false;
  if (normalized.startsWith('what ') || normalized.startsWith('which ')) return false;
  return DIRECT_BINARY_QUESTION_PATTERN.test(normalized) || DANGER_GATE_PATTERN.test(normalized);
};

const hasTimelineOptionShape = (options: ResponseOptions | null): boolean => {
  if (!options || !Array.isArray(options.options) || options.options.length === 0) return false;
  const textBlob = options.options.map((option) => option.text.toLowerCase()).join(' | ');
  return TIMELINE_OPTION_PATTERN.test(textBlob);
};

const hasSummaryOptionShape = (options: ResponseOptions | null): boolean => {
  if (!options || !Array.isArray(options.options) || options.options.length === 0) return false;
  const textBlob = options.options.map((option) => option.text.toLowerCase()).join(' | ');
  return SUMMARY_OPTION_PATTERN.test(textBlob);
};

const hasDangerOptionShape = (options: ResponseOptions | null): boolean => {
  if (!options || !Array.isArray(options.options) || options.options.length === 0) return false;
  const textBlob = options.options.map((option) => option.text.toLowerCase()).join(' | ');
  return DANGER_OPTION_PATTERN.test(textBlob);
};

export const StepRenderer: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);
  const [gateCountdown, setGateCountdown] = useState<number | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [inputHint, setInputHint] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<UserFacingError | null>(null);
  const [guardNotice, setGuardNotice] = useState<{
    id: string;
    status: 'enforced' | 'failed';
    detail?: string;
  } | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{
    input: string | string[];
    isOptionSelection: boolean;
    lastInput?: string;
    preDelayMs?: number;
  } | null>(null);
  const lastDoctorMessageId = useRef<string | null>(null);
  const lastRenderQuestionAuditRef = useRef<string>('');
  const dismissedGuardEventIdsRef = useRef<Set<string>>(new Set());
  const latestStateRef = useRef(state);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsQuestionKeyRef = useRef('');
  const busy = loading || analyzingImage;

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!loading) {
      setLoadingPhaseIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingPhaseIndex((prev) => (prev + 1) % LOADING_PHASES.length);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [loading]);

  useEffect(() => {
    if (loading) {
      playLoadingPhaseCue(loadingPhaseIndex, {
        audioEnabled: state.settings.audio_enabled,
      });
    }
  }, [loading, loadingPhaseIndex, state.settings.audio_enabled]);

  useEffect(() => {
    const latest = state.conversation[state.conversation.length - 1];
    if (!latest || latest.role !== 'doctor') return;
    if (latest.id === lastDoctorMessageId.current) return;
    lastDoctorMessageId.current = latest.id;
    signalFeedback('question', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
  }, [state.conversation, state.settings.haptics_enabled, state.settings.audio_enabled]);

  useEffect(() => {
    setSelectedOptionIds([]);
  }, [state.response_options, state.status]);

  useEffect(() => {
    const latest = state.conversation[state.conversation.length - 1];
    if (!latest || latest.role !== 'doctor') return;
    const rawQuestion = (latest.metadata?.question || latest.content || '').trim();
    if (!rawQuestion) return;
    const normalized = normalizeSingleQuestionPrompt(rawQuestion);
    if (!normalized || normalized === rawQuestion) return;
    const auditKey = `${rawQuestion.slice(0, 80)}=>${normalized.slice(0, 80)}`;
    if (lastRenderQuestionAuditRef.current === auditKey) return;
    lastRenderQuestionAuditRef.current = auditKey;
    recordInvariantEvent('single_question_enforced', `render:${normalized.slice(0, 120)}`);
  }, [state.conversation]);

  useEffect(() => {
    const audit = getInvariantAuditSnapshot();
    const latestContractEvent = audit.events.find(
      (event) =>
        event.type === 'option_contract_failed' || event.type === 'option_contract_enforced'
    );

    if (!latestContractEvent) return;
    if (dismissedGuardEventIdsRef.current.has(latestContractEvent.id)) return;

    setGuardNotice((prev) =>
      prev?.id === latestContractEvent.id
        ? prev
        : {
            id: latestContractEvent.id,
            status:
              latestContractEvent.type === 'option_contract_failed'
                ? 'failed'
                : 'enforced',
            detail: latestContractEvent.detail,
          }
    );
  }, [
    state.conversation.length,
    state.response_options?.options.length,
    state.status,
    loading,
  ]);

  useEffect(() => {
    if (!stickToBottom) return;
    transcriptEndRef.current?.scrollIntoView({
      behavior: state.settings.reduced_motion ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [
    state.conversation.length,
    state.response_options?.options.length,
    loading,
    stickToBottom,
    state.settings.reduced_motion,
  ]);

  useEffect(() => {
    const anchor = transcriptEndRef.current;
    if (!anchor) return;

    const host = (anchor.closest('main') || anchor.parentElement) as HTMLElement | null;
    if (!host) return;
    scrollHostRef.current = host;

    const onScroll = () => {
      const distanceFromBottom = host.scrollHeight - host.scrollTop - host.clientHeight;
      setStickToBottom(distanceFromBottom < 120);
    };

    onScroll();
    host.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      host.removeEventListener('scroll', onScroll);
    };
  }, [state.status]);

  const promptOnboardingFromNotifications = useCallback(() => {
    const hasOnboardingNotification = state.notifications.some((notification) =>
      isOnboardingNotification(notification)
    );
    if (!hasOnboardingNotification) {
      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          title: ONBOARDING_NOTIFICATION_TITLE,
          body: ONBOARDING_NOTIFICATION_BODY,
        },
      });
    }
    dispatch({ type: 'TOGGLE_SHEET', payload: 'notifications' });
  }, [dispatch, state.notifications]);

  const runInteraction = useCallback(
    async (
      input: string | string[],
      isOptionSelection: boolean,
      lastInput?: string,
      preDelayMs: number = 0
    ): Promise<boolean> => {
      const sessionAtStart = latestStateRef.current.sessionId;
      setLoading(true);
      setInteractionError(null);
      setLastAttempt({ input, isOptionSelection, lastInput, preDelayMs });
      try {
        if (preDelayMs > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, preDelayMs));
        }
        const result = await processAgentInteraction(
          input,
          latestStateRef.current,
          isOptionSelection
        );
        if (latestStateRef.current.sessionId !== sessionAtStart) {
          return false;
        }
        dispatch({
          type: 'SET_AGENT_RESPONSE',
          payload: result,
          ...(lastInput ? { lastInput } : {}),
        });
        setInputHint(null);
        return true;
      } catch (error) {
        if (latestStateRef.current.sessionId !== sessionAtStart) {
          return false;
        }
        console.error('Interaction error:', error);
        setInteractionError(buildUserFacingError(error, 'consult'));
        signalFeedback('error', {
          hapticsEnabled: latestStateRef.current.settings.haptics_enabled,
          audioEnabled: latestStateRef.current.settings.audio_enabled,
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [dispatch]
  );

  const buildVisualConsultInput = useCallback(
    (analysis: Awaited<ReturnType<typeof analyzeClinicalImage>>): string => {
      const chunks: string[] = [];
      chunks.push(`Visual analysis summary: ${analysis.summary}.`);
      if (analysis.findings.length > 0) {
        chunks.push(`Findings: ${analysis.findings.join('; ')}.`);
      }
      if (analysis.spot_diagnosis?.label) {
        chunks.push(
          `Most likely diagnosis: ${analysis.spot_diagnosis.label}${
            analysis.spot_diagnosis.icd10 ? ` (ICD-10: ${analysis.spot_diagnosis.icd10})` : ''
          }.`
        );
      }
      if (analysis.differentials && analysis.differentials.length > 0) {
        chunks.push(
          `Differentials: ${analysis.differentials
            .slice(0, 3)
            .map((entry) =>
              entry.icd10 ? `${entry.label} (ICD-10: ${entry.icd10})` : entry.label
            )
            .join('; ')}.`
        );
      }
      if (analysis.red_flags.length > 0) {
        chunks.push(`Red flags: ${analysis.red_flags.join('; ')}.`);
      } else {
        chunks.push('No immediate visual red flags identified.');
      }
      chunks.push(`Recommendation: ${analysis.recommendation}.`);
      chunks.push(`Confidence: ${analysis.confidence}%.`);
      return chunks.join(' ');
    },
    []
  );

  const openImagePicker = useCallback(() => {
    if (busy) return;
    setInteractionError(null);
    imageInputRef.current?.click();
  }, [busy]);

  const handleImageSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || busy) return;

      if (!file.type.startsWith('image/')) {
        setInteractionError({ message: 'Image files only for consult visual intake.' });
        return;
      }
      if (file.size > VISION_UPLOAD_FILE_LIMIT_BYTES) {
        setInteractionError({ message: 'Image too large. Please use an image smaller than 8 MB.' });
        return;
      }

      setAnalyzingImage(true);
      setInteractionError(null);
      setInputHint(null);

      try {
        const imageDataUrl = await readFileAsDataUrl(file);
        const latestDoctorQuestion = [...latestStateRef.current.conversation]
          .reverse()
          .find((entry) => entry.role === 'doctor')?.content;
        const analysis = await analyzeClinicalImage({
          imageDataUrl,
          clinicalContext:
            latestStateRef.current.thinking || latestStateRef.current.agent_state.focus_area,
          lensPrompt:
            latestDoctorQuestion ||
            'Review this image for clinically relevant morphology and urgent cues.',
          activityScope: 'consult',
          activityTitle: 'Consult image review',
        });

        const now = Date.now();
        dispatch({
          type: 'UPSERT_DIAGNOSTIC_REVIEW',
          payload: {
            id: `consult-vision-${now}-${Math.random().toString(36).slice(2, 8)}`,
            kind: 'scan',
            lens: 'general',
            image_data_url: imageDataUrl,
            image_name: file.name,
            context_note: 'Captured from consult room media intake.',
            analysis,
            created_at: now,
            updated_at: now,
          },
        });
        if (latestStateRef.current.settings.notifications_enabled) {
          dispatch({
            type: 'ADD_NOTIFICATION',
            payload: {
              title: 'Consult image reviewed',
              body: 'Visual findings were added to your scan records and consult context.',
            },
          });
        }

        signalFeedback('submit', {
          hapticsEnabled: latestStateRef.current.settings.haptics_enabled,
          audioEnabled: latestStateRef.current.settings.audio_enabled,
        });
        const visualInput = buildVisualConsultInput(analysis);
        const ok = await runInteraction(visualInput, false, 'Image review submitted');
        if (ok) {
          setInputHint('Image reviewed and added to consult context.');
          signalFeedback('question', {
            hapticsEnabled: latestStateRef.current.settings.haptics_enabled,
            audioEnabled: latestStateRef.current.settings.audio_enabled,
          });
        }
      } catch (error) {
        setInteractionError(buildUserFacingError(error, 'scan'));
        signalFeedback('error', {
          hapticsEnabled: latestStateRef.current.settings.haptics_enabled,
          audioEnabled: latestStateRef.current.settings.audio_enabled,
        });
      } finally {
        setAnalyzingImage(false);
      }
    },
    [buildVisualConsultInput, busy, dispatch, runInteraction]
  );

  const prepareInput = useCallback((raw: string): { value: string; wasTrimmed: boolean } => {
    const trimmed = raw.trim();
    if (!trimmed) return { value: '', wasTrimmed: false };
    if (trimmed.length <= INPUT_CHAR_LIMIT) return { value: trimmed, wasTrimmed: false };
    return {
      value: trimmed.slice(0, INPUT_CHAR_LIMIT).trim(),
      wasTrimmed: true,
    };
  }, []);

  const handleRetryLastAttempt = useCallback(async () => {
    if (!lastAttempt || loading) return;
    await runInteraction(
      lastAttempt.input,
      lastAttempt.isOptionSelection,
      lastAttempt.lastInput,
      lastAttempt.preDelayMs || 0
    );
  }, [lastAttempt, loading, runInteraction]);

  const handleDismissGuardNotice = useCallback(() => {
    if (guardNotice) {
      dismissedGuardEventIdsRef.current.add(guardNotice.id);
    }
    setGuardNotice(null);
  }, [guardNotice]);

  const activeGateSegment = state.question_gate?.active
    ? state.question_gate.segments[state.question_gate.current_index]
    : null;
  const isSafetyCheckpoint = state.question_gate?.kind === 'safety_checkpoint';
  const gateTimeoutSeconds = activeGateSegment?.timeout_seconds;
  const isTimedGateStep = typeof gateTimeoutSeconds === 'number' && gateTimeoutSeconds > 0;

  useEffect(() => {
    if (!isTimedGateStep || busy || !state.response_options) {
      setGateCountdown(null);
      return;
    }
    setGateCountdown(gateTimeoutSeconds);
    const intervalId = window.setInterval(() => {
      setGateCountdown((prev) => {
        if (prev === null) return null;
        return Math.max(0, prev - 1);
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [busy, gateTimeoutSeconds, isTimedGateStep, state.response_options]);

  const handleInitialInput = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isProfileOnboardingComplete(state.profile)) {
      promptOnboardingFromNotifications();
    }
    const prepared = prepareInput(val);
    const trimmed = prepared.value;
    if (!trimmed || busy) return;
    if (prepared.wasTrimmed) {
      setInputHint(`Long input trimmed to ${INPUT_CHAR_LIMIT} characters for stable response.`);
    }

    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    const ok = await runInteraction(trimmed, false, trimmed);
    if (ok) {
      setVal('');
    }
  };

  const handleOptionSelect = async (
    optionId: string,
    event?: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (!isProfileOnboardingComplete(state.profile)) {
      promptOnboardingFromNotifications();
      return;
    }
    if (!assistiveResponseOptions || busy) return;

    const { mode, ui_variant: variant } = assistiveResponseOptions;
    const rect = event?.currentTarget?.getBoundingClientRect();
    signalFeedback('select', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
      celebrationX: rect ? rect.left + rect.width / 2 : undefined,
      celebrationY: rect ? rect.top + rect.height / 2 : undefined,
    });

    if (mode === 'multiple') {
      setSelectedOptionIds((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId]
      );
      return;
    }

    if (mode === 'single' || mode === 'confirm') {
      if (variant === 'scale' || variant === 'ladder') {
        setSelectedOptionIds([optionId]);
        return;
      }
      setSelectedOptionIds([optionId]);
      await runInteraction(
        [optionId],
        true,
        undefined,
        state.settings.reduced_motion ? 0 : 120
      );
      return;
    }

    await runInteraction(optionId, true);
  };

  const handleSingleSubmit = async () => {
    if (!isProfileOnboardingComplete(state.profile)) {
      promptOnboardingFromNotifications();
      return;
    }
    if (selectedOptionIds.length === 0 || busy) return;
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    await runInteraction([selectedOptionIds[0]], true);
    setSelectedOptionIds([]);
  };

  const handleMultipleSubmit = async () => {
    if (!isProfileOnboardingComplete(state.profile)) {
      promptOnboardingFromNotifications();
      return;
    }
    if (selectedOptionIds.length === 0 || busy) return;
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    await runInteraction(selectedOptionIds, true);
    setSelectedOptionIds([]);
  };

  const canGoBack =
    state.history.length > 0 || state.status !== 'idle' || state.conversation.length > 0;
  const currentMessage =
    state.conversation.length > 0 ? state.conversation[state.conversation.length - 1] : null;
  const conversationTimeline = state.conversation.filter((entry) => entry.role !== 'system');
  const transcriptMessages = conversationTimeline;
  const resolvedTheme = resolveTheme(state.theme);
  const doctorAvatarSrc = resolvedTheme === 'dark' ? '/logo.png' : '/logo_light.png';
  const patientAvatarSrc = resolveProfileAvatarWithFallback(
    state.profile.avatar_url,
    state.profile.display_name || 'Patient'
  );
  const currentQuestion = currentMessage?.metadata?.question ?? currentMessage?.content ?? '';
  const normalizedCurrentQuestion = normalizeSingleQuestionPrompt(currentQuestion);
  const resolvedQuestion =
    normalizedCurrentQuestion || 'What symptom is bothering you the most right now?';
  const gateProgress = state.question_gate?.active
    ? `${state.question_gate.current_index + 1} / ${state.question_gate.segments.length}`
    : null;
  const isIntakeView = state.status === 'idle' || state.status === 'intake';
  const showBackControl = canGoBack && !isIntakeView && state.conversation.length > 2;
  const showResetControl = state.status !== 'idle' && !isIntakeView && state.conversation.length > 3;
  const showActionRow = showBackControl || showResetControl;
  const gateTimerExpired = isTimedGateStep && gateCountdown === 0;
  const activeResponseOptions = React.useMemo(() => {
    const sourceOptions = state.response_options;
    const rawGatePrompt = activeGateSegment?.prompt || resolvedQuestion;
    const gatePrompt = normalizeSingleQuestionPrompt(rawGatePrompt) || rawGatePrompt;
    const normalizedPrompt = extractQuestionClause(gatePrompt);

    let alignedOptions = sourceOptions;
    if (sourceOptions) {
      const requiresBinary = isBinaryQuestionPrompt(gatePrompt);
      const expectsDuration = TIMELINE_QUESTION_PATTERN.test(normalizedPrompt);
      const expectsSummary = SUMMARY_QUESTION_PATTERN.test(normalizedPrompt);
      const expectsDanger = DANGER_GATE_PATTERN.test(normalizedPrompt);

      const optionMismatch =
        (requiresBinary && !hasBinaryOptionShape(sourceOptions)) ||
        (expectsDuration && !hasTimelineOptionShape(sourceOptions)) ||
        (expectsSummary && !hasSummaryOptionShape(sourceOptions)) ||
        (expectsDanger && !hasDangerOptionShape(sourceOptions) && !hasBinaryOptionShape(sourceOptions));

      if (optionMismatch) {
        alignedOptions = buildLocalOptions(gatePrompt, state.profile);
      }
    }

    const shouldForceBinary = isTimedGateStep || isBinaryQuestionPrompt(gatePrompt);
    if (!shouldForceBinary) return alignedOptions;

    const timedHint = gateProgress ? `Step ${gateProgress}: Quick yes/no.` : 'Quick yes/no.';

    if (!alignedOptions) {
      return buildTimedGateOptions(gatePrompt, timedHint);
    }
    if (hasBinaryOptionShape(alignedOptions)) {
      return alignedOptions;
    }
    return buildTimedGateOptions(gatePrompt, timedHint);
  }, [
    activeGateSegment?.prompt,
    gateProgress,
    isTimedGateStep,
    resolvedQuestion,
    state.profile,
    state.response_options,
  ]);
  const isAutomationSession =
    typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
  const assistiveResponseOptions = React.useMemo(() => {
    if (!activeResponseOptions) return null;
    if (isSafetyCheckpoint) return activeResponseOptions;
    return {
      ...activeResponseOptions,
      mode: 'single' as const,
      ui_variant: 'chips' as const,
      allow_custom_input: true,
      options: activeResponseOptions.options.slice(0, ASSISTIVE_SUGGESTION_CAP),
      context_hint: 'Suggested quick replies. You can ignore and type freely.',
    };
  }, [activeResponseOptions, isSafetyCheckpoint]);
  const showInput = true;
  const showGateStatusChips = isSafetyCheckpoint || isTimedGateStep;

  useEffect(() => {
    const nextKey = `${resolvedQuestion}:${assistiveResponseOptions?.options.length || 0}:${
      isSafetyCheckpoint ? 'safety' : 'assist'
    }`;
    if (suggestionsQuestionKeyRef.current === nextKey) return;
    suggestionsQuestionKeyRef.current = nextKey;
    setSuggestionsOpen(isSafetyCheckpoint || isAutomationSession);
  }, [
    assistiveResponseOptions?.options.length,
    isAutomationSession,
    isSafetyCheckpoint,
    resolvedQuestion,
  ]);

  if (state.status === 'complete') return null;

  return (
    <div className="flex-1 flex flex-col justify-start min-h-0 consult-room-shell">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="consult-image-input"
        onChange={(event) => void handleImageSelected(event)}
      />
      {showActionRow && (
        <div className="flex items-center justify-between px-1 z-20 pt-1 consult-room-actions">
          <div className="w-10">
            {showBackControl && (
              <button
                onClick={() => dispatch({ type: 'GO_BACK' })}
                className="h-10 w-10 surface-raised text-content-dim hover:text-accent-primary transition-all active:scale-95 rounded-full focus-glow inline-flex items-center justify-center"
                aria-label="Go back"
              >
                <ChevronLeft size={20} />
              </button>
            )}
          </div>
          <div className="w-10">
            {showResetControl && (
              <button
                onClick={() => dispatch({ type: 'RESET' })}
                className="h-10 w-10 surface-raised text-content-dim hover:text-danger-primary transition-all active:scale-95 rounded-full focus-glow inline-flex items-center justify-center"
                aria-label="Reset consultation"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {isIntakeView && (
        <div className="consult-room-stage">
          <div className="consult-room-presence">
              <Orb loading={loading} prominence="hero" />
            </div>
          {busy && (
            <AiActivityTimeline
              scope="consult"
              maxTasks={2}
              className="w-full max-w-2xl mt-2"
              showCompletedWithinMs={1200}
            />
          )}
          </div>
        )}

      <AnimatePresence mode="wait">
        {isIntakeView ? (
          <motion.div
            key="intake"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-start pt-4"
          >
            <div className="max-w-2xl w-full flex flex-col items-center">
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full px-3 pb-2 text-sm text-content-secondary text-center leading-relaxed"
              >
                {state.conversation.length > 0
                  ? 'Anything else you noticed before this started?'
                  : 'Describe your concern in your own words.'}
              </motion.p>

              <form onSubmit={handleInitialInput} className="space-y-3 w-full">
                <div className="relative surface-raised rounded-[24px] p-3 shadow-glass">
                  <textarea
                    autoFocus
                    rows={2}
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    maxLength={INPUT_CHAR_LIMIT}
                    placeholder="Describe your main concern..."
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleInitialInput();
                      }
                    }}
                    className="w-full surface-strong p-3 pl-14 pr-14 rounded-2xl text-[15px] text-left text-content-primary placeholder-content-dim transition-all resize-none focus-glow"
                  />
                  <p className="mt-2 px-1 text-[11px] text-content-dim text-right">
                    {val.length}/{INPUT_CHAR_LIMIT}
                  </p>

                  <AnimatePresence>
                    {val.trim() && !busy && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        aria-label="Send first message"
                        className="absolute right-3 bottom-3 h-11 w-11 flex items-center justify-center cta-live-icon rounded-2xl focus-glow"
                      >
                        <ArrowUp size={16} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <button
                    type="button"
                    aria-label="Attach image"
                    onClick={openImagePicker}
                    disabled={busy}
                    className="absolute left-3 bottom-3 h-11 w-11 flex items-center justify-center surface-strong rounded-2xl text-content-secondary focus-glow interactive-tap disabled:opacity-50"
                  >
                    {analyzingImage ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  </button>
                </div>
                {inputHint && (
                  <p className="px-2 text-[12px] text-content-dim text-center">{inputHint}</p>
                )}
                {interactionError && !busy && (
                  <InlineErrorBlade
                    message={interactionError.message}
                    details={interactionError.details}
                    onDismiss={() => setInteractionError(null)}
                    onRetry={() => void handleRetryLastAttempt()}
                  />
                )}
              </form>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="conversation"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full relative pb-24"
          >
            <div className="max-w-2xl mx-auto w-full space-y-4 consult-flow-shell">
              {transcriptMessages.length > 0 && (
                <div className="consult-chat-log space-y-2">
                  {transcriptMessages.map((entry, index) => {
                    const isDoctor = entry.role === 'doctor';
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02, duration: 0.2 }}
                        className={`flex ${isDoctor ? 'justify-start' : 'justify-end'} items-end gap-2`}
                      >
                        {isDoctor && (
                          <img
                            src={doctorAvatarSrc}
                            alt="Doctor avatar"
                            className="h-8 w-8 rounded-full object-cover shrink-0 surface-chip"
                            loading="lazy"
                          />
                        )}
                        <div
                          className={`consult-chat-bubble ${
                            isDoctor ? 'consult-chat-bubble-doctor' : 'consult-chat-bubble-patient'
                          }`}
                        >
                          <p className="text-sm text-content-primary leading-relaxed">{entry.content}</p>
                        </div>
                        {!isDoctor && (
                          <img
                            src={patientAvatarSrc}
                            alt="Patient avatar"
                            className="h-8 w-8 rounded-full object-cover shrink-0 surface-chip"
                            loading="lazy"
                          />
                        )}
                      </motion.div>
                    );
                  })}
                  <div ref={transcriptEndRef} />
                </div>
              )}

              {busy && (
                <AiActivityTimeline scope="consult" maxTasks={2} showCompletedWithinMs={1200} />
              )}

              {!busy && showGateStatusChips && (gateProgress || (isTimedGateStep && gateCountdown !== null)) && (
                <div className="pt-1">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {gateProgress && isSafetyCheckpoint && (
                      <span className="h-7 px-3 rounded-full surface-chip text-[11px] text-content-secondary inline-flex items-center">
                        Step {gateProgress}
                      </span>
                    )}
                    {isTimedGateStep && gateCountdown !== null && (
                      <span className="h-7 px-3 rounded-full surface-chip text-[11px] text-content-secondary inline-flex items-center gap-1">
                        <Timer size={11} />
                        {gateCountdown}s
                      </span>
                    )}
                    {gateTimerExpired && (
                      <span className="h-7 px-3 rounded-full surface-chip text-[11px] text-content-secondary inline-flex items-center">
                        Select or type to continue
                      </span>
                    )}
                  </div>
                </div>
              )}

              {interactionError && !busy && (
                <InlineErrorBlade
                  message={interactionError.message}
                  details={interactionError.details}
                  onDismiss={() => setInteractionError(null)}
                  onRetry={() => void handleRetryLastAttempt()}
                />
              )}

              {!busy && guardNotice && (
                <InvariantGuardBlade
                  status={guardNotice.status}
                  summary={
                    guardNotice.status === 'failed'
                      ? 'Dr guard adjusted this step after an option contract failure.'
                      : 'Dr guard aligned response options for this question.'
                  }
                  details={guardNotice.detail}
                  onDismiss={handleDismissGuardNotice}
                />
              )}

              <div className="space-y-3 consult-answer-zone">
                {assistiveResponseOptions && !isSafetyCheckpoint && !suggestionsOpen && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSuggestionsOpen(true)}
                      className="h-8 px-3 rounded-full surface-chip text-[11px] text-content-secondary inline-flex items-center justify-center interactive-tap"
                    >
                      Suggestions ({assistiveResponseOptions.options.length})
                    </button>
                  </div>
                )}

                {assistiveResponseOptions && (isSafetyCheckpoint || suggestionsOpen) && (
                  <div className="space-y-2">
                    {!isSafetyCheckpoint && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSuggestionsOpen(false)}
                          className="h-7 px-3 rounded-full surface-chip text-[11px] text-content-dim inline-flex items-center interactive-tap"
                        >
                          Hide suggestions
                        </button>
                      </div>
                    )}
                    <ResponseOptionsPanel
                      responseOptions={assistiveResponseOptions}
                      selectedOptionIds={selectedOptionIds}
                      onSelect={(optionId, event) => void handleOptionSelect(optionId, event)}
                      onSubmitSingle={() => void handleSingleSubmit()}
                      onSubmitMultiple={() => void handleMultipleSubmit()}
                      loading={loading}
                      compact
                      questionText={resolvedQuestion}
                    />
                  </div>
                )}

                {showInput && (
                  <div className="pt-1 flex items-center gap-3 rounded-[24px] surface-raised p-3 shadow-glass consult-free-input">
                    <textarea
                      rows={1}
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      maxLength={INPUT_CHAR_LIMIT}
                      placeholder="Type your response..."
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleInitialInput();
                        }
                      }}
                      className="flex-1 surface-strong p-3 rounded-xl text-sm text-content-primary placeholder-content-dim transition-all resize-none no-scrollbar text-left focus-glow"
                    />
                    <button
                      type="button"
                      onClick={openImagePicker}
                      disabled={busy}
                      className="h-11 w-11 flex items-center justify-center surface-strong rounded-xl text-content-secondary focus-glow interactive-tap disabled:opacity-50"
                      aria-label="Attach image"
                    >
                      {analyzingImage ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <ImagePlus size={16} />
                      )}
                    </button>
                    {val.trim() && !busy && (
                      <button
                        onClick={() => void handleInitialInput()}
                        className="h-11 w-11 flex items-center justify-center cta-live-icon rounded-xl shadow-glass focus-glow hover:scale-[1.02] active:scale-95"
                        aria-label="Send response"
                      >
                        <ArrowUp size={16} />
                      </button>
                    )}
                  </div>
                )}
                {showInput && (inputHint || val.length > 0) && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] text-content-dim">
                      {inputHint || 'Press Enter to send'}
                    </p>
                    <p className="text-[11px] text-content-dim">
                      {val.length}/{INPUT_CHAR_LIMIT}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

