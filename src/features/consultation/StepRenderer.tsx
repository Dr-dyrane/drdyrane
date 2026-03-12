import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ChevronLeft, ImagePlus, Timer, X } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { signalFeedback, playLoadingPhaseCue } from '../../core/services/feedback';
import { resolveProfileAvatarWithFallback } from '../../core/storage/avatarStore';
import { resolveTheme } from '../../core/theme/resolveTheme';
import { isProfileOnboardingComplete } from '../../core/profile/onboarding';
import { analyzeClinicalImage } from '../../core/api/visionEngine';
import {
  ONBOARDING_NOTIFICATION_BODY,
  ONBOARDING_NOTIFICATION_TITLE,
  isOnboardingNotification,
} from '../../core/notifications/onboardingNotification';
import { Orb } from './Orb';
import { ResponseOptionsPanel } from './components/ResponseOptionsPanel';
import { DiagnosticReviewRecord } from '../../core/types/clinical';

const LOADING_PHASES = [
  'Analyzing history',
  'Narrowing differential',
  'Selecting next question',
];

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });

export const StepRenderer: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaProcessing, setMediaProcessing] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);
  const [gateCountdown, setGateCountdown] = useState<number | null>(null);
  const lastDoctorMessageId = useRef<string | null>(null);
  const latestStateRef = useRef(state);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

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
    ) => {
      setLoading(true);
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
      } catch (error) {
        console.error('Interaction error:', error);
        signalFeedback('error', {
          hapticsEnabled: latestStateRef.current.settings.haptics_enabled,
          audioEnabled: latestStateRef.current.settings.audio_enabled,
        });
      } finally {
        setLoading(false);
      }
    },
    [dispatch]
  );

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
      return;
    }
    const trimmed = val.trim();
    if (!trimmed || loading || mediaProcessing) return;

    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    await runInteraction(trimmed, false, trimmed);
    setVal('');
  };

  const buildMediaHandoff = useCallback((fileName: string, analysis: Awaited<ReturnType<typeof analyzeClinicalImage>>) => {
    const spotDiagnosis = analysis.spot_diagnosis?.label
      ? `Spot diagnosis: ${analysis.spot_diagnosis.label}${
          analysis.spot_diagnosis.icd10 ? ` (ICD-10: ${analysis.spot_diagnosis.icd10})` : ''
        }.`
      : 'Spot diagnosis not established from image alone.';
    const differentialText =
      analysis.differentials.length > 0
        ? `Differentials: ${analysis.differentials
            .map(
              (entry) =>
                `${entry.label}${entry.icd10 ? ` (${entry.icd10})` : ''} [${entry.likelihood}]`
            )
            .join('; ')}.`
        : 'No ranked differentials available.';
    const treatmentText =
      analysis.treatment_summary ||
      (analysis.treatment_lines.length > 0
        ? `Treatment lines: ${analysis.treatment_lines.join('; ')}.`
        : 'Treatment pathway pending.');
    const investigationText =
      analysis.investigations.length > 0
        ? `Investigations: ${analysis.investigations.join('; ')}.`
        : '';
    const counselingText =
      analysis.counseling.length > 0
        ? `Counseling: ${analysis.counseling.join('; ')}.`
        : '';

    return `Consult media intake (${fileName}): ${analysis.summary}. Findings: ${
      analysis.findings.length > 0 ? analysis.findings.join('; ') : 'No dominant visual findings.'
    }. ${
      analysis.red_flags.length > 0
        ? `Red flags: ${analysis.red_flags.join('; ')}.`
        : 'No immediate visual red flags.'
    } ${spotDiagnosis} ${differentialText} ${treatmentText} ${investigationText} ${counselingText} Recommendation: ${
      analysis.recommendation
    }. Confidence: ${analysis.confidence}%.`;
  }, []);

  const handleMediaSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!isProfileOnboardingComplete(state.profile)) {
        promptOnboardingFromNotifications();
        return;
      }
      if (!file.type.startsWith('image/')) {
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            title: 'Unsupported Media',
            body: 'Consult intake media currently supports image upload only.',
          },
        });
        signalFeedback('error', {
          hapticsEnabled: state.settings.haptics_enabled,
          audioEnabled: state.settings.audio_enabled,
        });
        return;
      }
      if (loading || mediaProcessing) return;

      setMediaProcessing(true);
      try {
        const imageDataUrl = await readFileAsDataUrl(file);
        const analysis = await analyzeClinicalImage({
          imageDataUrl,
          clinicalContext:
            state.thinking ||
            state.agent_state.focus_area ||
            'Consult room intake media review',
          lensPrompt:
            'Review this intake image for key findings, spot diagnosis, ranked differentials, treatment suggestions, and urgency signals.',
        });

        const now = Date.now();
        const reviewRecord: DiagnosticReviewRecord = {
          id: `scan-${now}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'scan',
          lens: 'general',
          image_data_url: imageDataUrl,
          image_name: file.name,
          context_note: 'Captured from consultation media intake.',
          analysis,
          created_at: now,
          updated_at: now,
        };
        dispatch({ type: 'UPSERT_DIAGNOSTIC_REVIEW', payload: reviewRecord });

        const handoff = buildMediaHandoff(file.name, analysis);
        await runInteraction(handoff, false, handoff);
        signalFeedback('submit', {
          hapticsEnabled: state.settings.haptics_enabled,
          audioEnabled: state.settings.audio_enabled,
        });
      } catch (error) {
        console.error('Consult media intake failed:', error);
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            title: 'Media Intake Failed',
            body:
              error instanceof Error
                ? error.message
                : 'Unable to process media intake right now.',
          },
        });
        signalFeedback('error', {
          hapticsEnabled: state.settings.haptics_enabled,
          audioEnabled: state.settings.audio_enabled,
        });
      } finally {
        setMediaProcessing(false);
      }
    },
    [
      buildMediaHandoff,
      dispatch,
      loading,
      mediaProcessing,
      promptOnboardingFromNotifications,
      runInteraction,
      state.agent_state.focus_area,
      state.profile,
      state.settings.audio_enabled,
      state.settings.haptics_enabled,
      state.thinking,
    ]
  );

  const openMediaPicker = useCallback(() => {
    if (!isProfileOnboardingComplete(state.profile)) {
      promptOnboardingFromNotifications();
      return;
    }
    if (loading || mediaProcessing) return;
    mediaInputRef.current?.click();
  }, [loading, mediaProcessing, promptOnboardingFromNotifications, state.profile]);

  const handleOptionSelect = async (
    optionId: string,
    event?: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (!isProfileOnboardingComplete(state.profile)) {
      promptOnboardingFromNotifications();
      return;
    }
    if (!state.response_options || loading || mediaProcessing) return;

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
    if (selectedOptionIds.length === 0 || loading || mediaProcessing) return;
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
    if (selectedOptionIds.length === 0 || loading || mediaProcessing) return;
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
  const onboardingComplete = isProfileOnboardingComplete(state.profile);
  const gateTimerExpired = isTimedGateStep && gateCountdown === 0;
  const isBusy = loading || mediaProcessing;

  if (state.status === 'complete') return null;

  return (
    <div className="flex-1 flex flex-col justify-start min-h-0 px-2 consult-room-shell">
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleMediaSelected(event)}
      />

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
            <Orb loading={isBusy} prominence="hero" />
          </div>
          <AnimatePresence mode="wait">
            {isBusy && (
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
                    placeholder="Describe your main concern..."
                    disabled={isBusy || !onboardingComplete}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleInitialInput();
                      }
                    }}
                    className="w-full surface-strong p-3 rounded-2xl text-[15px] text-left text-content-primary placeholder-content-dim transition-all resize-none focus-glow"
                  />

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={openMediaPicker}
                      disabled={isBusy || !onboardingComplete}
                      className="h-10 px-3 rounded-xl surface-strong text-xs font-semibold inline-flex items-center gap-1.5 interactive-tap disabled:opacity-55"
                    >
                      <ImagePlus size={14} />
                      Media
                    </button>
                    <AnimatePresence>
                      {val.trim() && !isBusy && onboardingComplete && (
                        <motion.button
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          whileHover={{ scale: 1.01, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          type="submit"
                          aria-label="Send first message"
                          className="h-10 w-10 flex items-center justify-center cta-live-icon rounded-xl focus-glow"
                        >
                          <ArrowUp size={16} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
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
                    <button
                      onClick={() => openMediaPicker()}
                      disabled={isBusy}
                      className="h-11 px-3 rounded-xl surface-strong text-xs font-semibold inline-flex items-center gap-1.5 interactive-tap disabled:opacity-55"
                      aria-label="Attach media"
                    >
                      <ImagePlus size={14} />
                      Media
                    </button>
                    <textarea
                      rows={1}
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder="Type your response..."
                      disabled={isBusy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleInitialInput();
                        }
                      }}
                      className="flex-1 surface-strong p-3 rounded-xl text-sm text-content-primary placeholder-content-dim transition-all resize-none no-scrollbar text-left focus-glow"
                    />
                    {val.trim() && !isBusy && (
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

