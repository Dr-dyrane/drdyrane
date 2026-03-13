import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ChevronLeft, Timer, X } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { signalFeedback, playLoadingPhaseCue } from '../../core/services/feedback';
import { resolveProfileAvatarWithFallback } from '../../core/storage/avatarStore';
import { resolveTheme } from '../../core/theme/resolveTheme';
import { isProfileOnboardingComplete } from '../../core/profile/onboarding';
import {
  ONBOARDING_NOTIFICATION_BODY,
  ONBOARDING_NOTIFICATION_TITLE,
  isOnboardingNotification,
} from '../../core/notifications/onboardingNotification';
import { Orb } from './Orb';
import { ResponseOptionsPanel } from './components/ResponseOptionsPanel';

const LOADING_PHASES = [
  'Analyzing history',
  'Narrowing differential',
  'Selecting next question',
];
const INPUT_CHAR_LIMIT = 1200;

export const StepRenderer: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);
  const [gateCountdown, setGateCountdown] = useState<number | null>(null);
  const [inputHint, setInputHint] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{
    input: string | string[];
    isOptionSelection: boolean;
    lastInput?: string;
    preDelayMs?: number;
  } | null>(null);
  const lastDoctorMessageId = useRef<string | null>(null);
  const latestStateRef = useRef(state);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

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
    transcriptEndRef.current?.scrollIntoView({
      behavior: state.settings.reduced_motion ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [
    state.conversation.length,
    state.response_options?.options.length,
    loading,
    state.settings.reduced_motion,
  ]);

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
        dispatch({
          type: 'SET_AGENT_RESPONSE',
          payload: result,
          ...(lastInput ? { lastInput } : {}),
        });
        setInputHint(null);
        return true;
      } catch (error) {
        console.error('Interaction error:', error);
        const reason = error instanceof Error ? error.message : String(error);
        setInteractionError(
          reason && reason !== 'undefined'
            ? `Consultation interrupted: ${reason}`
            : 'Consultation interrupted. Please retry.'
        );
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

  const activeGateSegment = state.question_gate?.active
    ? state.question_gate.segments[state.question_gate.current_index]
    : null;
  const gateTimeoutSeconds = activeGateSegment?.timeout_seconds;
  const isTimedGateStep = typeof gateTimeoutSeconds === 'number' && gateTimeoutSeconds > 0;

  useEffect(() => {
    if (!isTimedGateStep || loading || !state.response_options) {
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
  }, [gateTimeoutSeconds, isTimedGateStep, loading, state.response_options]);

  const handleInitialInput = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isProfileOnboardingComplete(state.profile)) {
      promptOnboardingFromNotifications();
    }
    const prepared = prepareInput(val);
    const trimmed = prepared.value;
    if (!trimmed || loading) return;
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
    if (!state.response_options || loading) return;

    const { mode, ui_variant: variant } = state.response_options;
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
    if (selectedOptionIds.length === 0 || loading) return;
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
    if (selectedOptionIds.length === 0 || loading) return;
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    await runInteraction(selectedOptionIds, true);
    setSelectedOptionIds([]);
  };

  const showInput = !state.response_options || state.response_options.allow_custom_input;
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
  const resolvedQuestion = currentQuestion.trim() || 'What symptom is bothering you the most right now?';
  const gateProgress = state.question_gate?.active
    ? `${state.question_gate.current_index + 1} / ${state.question_gate.segments.length}`
    : null;
  const isClarifierMode = Boolean(state.question_gate?.active);
  const isIntakeView = state.status === 'idle' || state.status === 'intake';
  const gateTimerExpired = isTimedGateStep && gateCountdown === 0;

  if (state.status === 'complete') return null;

  return (
    <div className="flex-1 flex flex-col justify-start min-h-0 px-2 consult-room-shell">
      <div className="flex items-center justify-between px-1 z-20 pt-1 consult-room-actions">
        <div className="w-10">
          {canGoBack && (
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
          {state.status !== 'idle' && (
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

      {isIntakeView && (
        <div className="consult-room-stage">
          <div className="consult-room-presence">
            <Orb loading={loading} prominence="hero" />
          </div>
          <AnimatePresence mode="wait">
            {loading && (
              <motion.span
                key={LOADING_PHASES[loadingPhaseIndex]}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="energy-chip px-3 h-7 rounded-full text-[11px] tracking-wide text-content-primary font-semibold inline-flex items-center mt-1"
              >
                {LOADING_PHASES[loadingPhaseIndex]}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence mode="wait">
        {isIntakeView ? (
          <motion.div
            key="intake"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-start pt-4 px-2"
          >
            <div className="max-w-2xl w-full flex flex-col items-center">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full surface-raised rounded-[24px] px-4 py-4 shadow-glass mb-3"
              >
                <p className="text-[0.98rem] text-content-primary leading-relaxed">
                  {state.conversation.length > 0
                    ? 'Anything else you noticed before this started?'
                    : 'Welcome to the consulting room. Tell me in your own words what is bothering you.'}
                </p>
              </motion.div>

              <form onSubmit={handleInitialInput} className="space-y-4 w-full">
                <div className="relative surface-raised rounded-[24px] p-3 shadow-glass">
                  <textarea
                    autoFocus
                    rows={2}
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    maxLength={INPUT_CHAR_LIMIT}
                    placeholder="Describe your main concern..."
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleInitialInput();
                      }
                    }}
                    className="w-full surface-strong p-3 rounded-2xl text-[15px] text-left text-content-primary placeholder-content-dim transition-all resize-none focus-glow"
                  />
                  <p className="mt-2 px-1 text-[11px] text-content-dim text-right">
                    {val.length}/{INPUT_CHAR_LIMIT}
                  </p>

                  <AnimatePresence>
                    {val.trim() && !loading && (
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
                </div>
                {inputHint && (
                  <p className="px-2 text-[12px] text-content-dim text-center">{inputHint}</p>
                )}
                {interactionError && !loading && (
                  <div className="surface-raised rounded-2xl px-4 py-3 shadow-glass">
                    <p className="text-[12px] leading-relaxed text-content-secondary">{interactionError}</p>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setInteractionError(null)}
                        className="h-9 px-3 rounded-xl surface-strong text-content-secondary text-xs font-semibold interactive-tap"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRetryLastAttempt()}
                        className="h-9 px-3 rounded-xl cta-live text-xs font-semibold interactive-tap"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
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
            className="flex flex-col h-full relative px-2 pb-24"
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

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start items-end gap-2 pt-1"
                >
                  <img
                    src={doctorAvatarSrc}
                    alt="Doctor avatar"
                    className="h-8 w-8 rounded-full object-cover shrink-0 surface-chip"
                    loading="lazy"
                  />
                  <div className="consult-chat-bubble consult-chat-bubble-doctor">
                    <p className="text-[11px] text-content-dim">{LOADING_PHASES[loadingPhaseIndex]}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-content-dim animate-pulse" />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-content-dim animate-pulse"
                        style={{ animationDelay: '120ms' }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-content-dim animate-pulse"
                        style={{ animationDelay: '240ms' }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {!loading && (gateProgress || (isTimedGateStep && gateCountdown !== null)) && (
                <div className="pt-1">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {gateProgress && (
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

              {interactionError && !loading && (
                <div className="surface-raised rounded-2xl px-4 py-3 shadow-glass">
                  <p className="text-[12px] leading-relaxed text-content-secondary">{interactionError}</p>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setInteractionError(null)}
                      className="h-9 px-3 rounded-xl surface-strong text-content-secondary text-xs font-semibold interactive-tap"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRetryLastAttempt()}
                      className="h-9 px-3 rounded-xl cta-live text-xs font-semibold interactive-tap"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3 consult-answer-zone">
                <ResponseOptionsPanel
                  responseOptions={state.response_options}
                  selectedOptionIds={selectedOptionIds}
                  onSelect={(optionId, event) => void handleOptionSelect(optionId, event)}
                  onSubmitSingle={() => void handleSingleSubmit()}
                  onSubmitMultiple={() => void handleMultipleSubmit()}
                  loading={loading}
                  compact={isClarifierMode}
                  questionText={resolvedQuestion}
                />

                {showInput && (
                  <div className="pt-1 flex items-center gap-3 rounded-[24px] surface-raised p-3 shadow-glass consult-free-input">
                    <textarea
                      rows={1}
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      maxLength={INPUT_CHAR_LIMIT}
                      placeholder="Type your response..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleInitialInput();
                        }
                      }}
                      className="flex-1 surface-strong p-3 rounded-xl text-sm text-content-primary placeholder-content-dim transition-all resize-none no-scrollbar text-left focus-glow"
                    />
                    {val.trim() && !loading && (
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
                {showInput && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] text-content-dim">
                      {inputHint || 'Press Enter to send. Shift+Enter for new line.'}
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

