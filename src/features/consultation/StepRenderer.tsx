import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownToLine, ArrowUp, ChevronLeft, SkipForward, X } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { signalFeedback, playLoadingPhaseCue } from '../../core/services/feedback';
import { Orb } from './Orb';
import { ClinicalQuestionCard } from './components/ClinicalQuestionCard';
import { ResponseOptionsPanel } from './components/ResponseOptionsPanel';

const LOADING_PHASES = [
  'Analyzing history',
  'Narrowing differential',
  'Selecting next question',
];

export const StepRenderer: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [biodataDismissed, setBiodataDismissed] = useState(false);
  const [biodataValue, setBiodataValue] = useState('');
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);
  const lastDoctorMessageId = useRef<string | null>(null);

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

  const runInteraction = async (
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
      const result = await processAgentInteraction(input, state, isOptionSelection);
      dispatch({
        type: 'SET_AGENT_RESPONSE',
        payload: result,
        ...(lastInput ? { lastInput } : {}),
      });
    } catch (error) {
      console.error('Interaction error:', error);
      signalFeedback('error', {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInitialInput = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = val.trim();
    if (!trimmed || loading) return;

    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    await runInteraction(trimmed, false, trimmed);
    setVal('');
  };

  const handleOptionSelect = async (optionId: string) => {
    if (!state.response_options || loading) return;

    const { mode, ui_variant: variant } = state.response_options;
    signalFeedback('select', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
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
    if (selectedOptionIds.length === 0 || loading) return;
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    await runInteraction([selectedOptionIds[0]], true);
    setSelectedOptionIds([]);
  };

  const handleMultipleSubmit = async () => {
    if (selectedOptionIds.length === 0 || loading) return;
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    await runInteraction(selectedOptionIds, true);
    setSelectedOptionIds([]);
  };

  if (state.status === 'complete') return null;

  const showInput = !state.response_options || state.response_options.allow_custom_input;
  const canGoBack =
    state.history.length > 0 || state.status !== 'idle' || state.conversation.length > 0;
  const currentMessage =
    state.conversation.length > 0 ? state.conversation[state.conversation.length - 1] : null;
  const currentQuestion = currentMessage?.metadata?.question ?? currentMessage?.content ?? '';
  const resolvedQuestion = currentQuestion.trim() || 'What symptom is bothering you the most right now?';
  const statement = currentMessage?.metadata?.statement;
  const gateProgress = state.question_gate?.active
    ? `${state.question_gate.current_index + 1} / ${state.question_gate.segments.length}`
    : null;
  const profileNeedsBiodata =
    !state.profile.age ||
    !state.profile.sex ||
    !state.profile.display_name ||
    state.profile.display_name.trim().toLowerCase() === 'patient';
  const biodataStep: 'name' | 'age' | 'sex' | null = (() => {
    if (
      !state.profile.display_name ||
      state.profile.display_name.trim().toLowerCase() === 'patient'
    ) {
      return 'name';
    }
    if (!state.profile.age) return 'age';
    if (!state.profile.sex) return 'sex';
    return null;
  })();
  const showBiodataCard =
    !biodataDismissed &&
    profileNeedsBiodata &&
    !!biodataStep &&
    state.conversation.length === 0 &&
    (state.status === 'idle' || state.status === 'intake');

  useEffect(() => {
    if (!showBiodataCard || !biodataStep) return;
    if (biodataStep === 'name') {
      setBiodataValue(
        state.profile.display_name && state.profile.display_name.toLowerCase() !== 'patient'
          ? state.profile.display_name
          : ''
      );
      return;
    }
    if (biodataStep === 'age') {
      setBiodataValue(state.profile.age ? String(state.profile.age) : '');
      return;
    }
    setBiodataValue('');
  }, [biodataStep, showBiodataCard, state.profile.age, state.profile.display_name]);

  const submitBiodataStep = () => {
    if (!biodataStep) return;
    if (biodataStep === 'name') {
      const name = biodataValue.trim();
      if (!name) return;
      dispatch({ type: 'UPDATE_PROFILE', payload: { display_name: name } });
      signalFeedback('submit', {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      });
      return;
    }
    if (biodataStep === 'age') {
      const age = Number(biodataValue);
      if (Number.isNaN(age) || age < 0 || age > 125) return;
      dispatch({ type: 'UPDATE_PROFILE', payload: { age } });
      signalFeedback('submit', {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      });
    }
  };

  const selectSex = (sex: NonNullable<typeof state.profile.sex>) => {
    dispatch({ type: 'UPDATE_PROFILE', payload: { sex } });
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
  };

  const canSubmitBiodataStep = (() => {
    if (!biodataStep) return false;
    if (biodataStep === 'name') return biodataValue.trim().length > 0;
    if (biodataStep === 'age') {
      const age = Number(biodataValue);
      return !Number.isNaN(age) && age >= 0 && age <= 125;
    }
    return false;
  })();

  return (
    <div className="flex-1 flex flex-col justify-start min-h-0 px-2">
      <div className="flex items-center justify-between px-2 z-20">
        <div className="w-10">
          {canGoBack && (
            <button
              onClick={() => dispatch({ type: 'GO_BACK' })}
              className="p-2 text-content-dim hover:text-neon-cyan transition-all active:scale-90 rounded-full focus-glow"
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
              className="p-2 text-content-dim hover:text-neon-red transition-all active:scale-90 rounded-full focus-glow"
              aria-label="Reset consultation"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center">
        <Orb loading={loading} />
        <AnimatePresence mode="wait">
          {loading && (
            <motion.span
              key={LOADING_PHASES[loadingPhaseIndex]}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-[10px] uppercase tracking-[0.35em] text-neon-cyan/70 font-semibold"
            >
              {LOADING_PHASES[loadingPhaseIndex]}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {(state.status === 'idle' || state.status === 'intake') ? (
          <motion.div
            key="intake"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-start pt-8 px-2"
          >
            <div className="max-w-2xl w-full flex flex-col items-center">
              <motion.h1
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="display-type text-4xl font-medium tracking-tight text-content-primary/90 leading-tight text-center pb-3"
              >
                {state.conversation.length > 0
                  ? 'Anything else?'
                  : "Hi, I'm Dr Dyrane. Tell me what's happening."}
              </motion.h1>

              <AnimatePresence>
                {showBiodataCard && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="w-full surface-raised rounded-[26px] p-4 mb-4 space-y-3 shadow-glass"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-content-dim font-semibold">
                        Optional Biodata
                      </p>
                      <button
                        onClick={() => setBiodataDismissed(true)}
                        className="h-8 w-8 rounded-full surface-strong flex items-center justify-center"
                        aria-label="Skip biodata"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-content-secondary">
                      {biodataStep === 'name' && 'What should I call you in this consultation?'}
                      {biodataStep === 'age' && 'How old are you?'}
                      {biodataStep === 'sex' && 'Select your sex to improve diagnostic relevance.'}
                    </p>
                    {biodataStep === 'name' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={biodataValue}
                            onChange={(e) => setBiodataValue(e.target.value)}
                            className="flex-1 h-11 px-3 rounded-xl surface-strong text-sm"
                            placeholder="Your name"
                          />
                          <button
                            onClick={() => setBiodataDismissed(true)}
                            className="h-11 w-11 rounded-xl surface-strong flex items-center justify-center text-content-dim"
                            aria-label="Skip biodata for now"
                          >
                            <SkipForward size={14} />
                          </button>
                          <button
                            onClick={submitBiodataStep}
                            disabled={!canSubmitBiodataStep}
                            className="h-11 w-11 rounded-xl bg-surface-active text-content-active flex items-center justify-center disabled:opacity-45"
                            aria-label="Save name"
                          >
                            <ArrowDownToLine size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    {biodataStep === 'age' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={biodataValue}
                            onChange={(e) => setBiodataValue(e.target.value)}
                            type="number"
                            min={0}
                            max={125}
                            className="flex-1 h-11 px-3 rounded-xl surface-strong text-sm"
                            placeholder="Age"
                          />
                          <button
                            onClick={() => setBiodataDismissed(true)}
                            className="h-11 w-11 rounded-xl surface-strong flex items-center justify-center text-content-dim"
                            aria-label="Skip biodata for now"
                          >
                            <SkipForward size={14} />
                          </button>
                          <button
                            onClick={submitBiodataStep}
                            disabled={!canSubmitBiodataStep}
                            className="h-11 w-11 rounded-xl bg-surface-active text-content-active flex items-center justify-center disabled:opacity-45"
                            aria-label="Save age"
                          >
                            <ArrowDownToLine size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    {biodataStep === 'sex' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'female', label: 'Female' },
                            { id: 'male', label: 'Male' },
                            { id: 'intersex', label: 'Intersex' },
                            { id: 'prefer_not_to_say', label: 'Prefer Not' },
                          ].map((option) => {
                            const isSelected = state.profile.sex === option.id;
                            return (
                              <button
                                key={option.id}
                                onClick={() =>
                                  selectSex(option.id as NonNullable<typeof state.profile.sex>)
                                }
                                className={`h-10 rounded-xl text-[10px] uppercase tracking-[0.2em] transition-all ${
                                  isSelected
                                    ? 'bg-surface-active text-content-active shadow-glass'
                                    : 'surface-strong text-content-primary'
                                }`}
                                aria-pressed={isSelected}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => setBiodataDismissed(true)}
                            className="h-10 w-10 rounded-xl surface-strong flex items-center justify-center text-content-dim"
                            aria-label="Skip biodata for now"
                          >
                            <SkipForward size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleInitialInput} className="space-y-4 w-full">
                <div className="relative">
                  <textarea
                    autoFocus
                    rows={2}
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="Sharp chest pain, high fever, sudden weakness..."
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleInitialInput();
                      }
                    }}
                    className="w-full surface-raised p-5 rounded-3xl text-lg text-center text-content-primary placeholder-content-dim transition-all resize-none shadow-glass focus-glow"
                  />

                  <AnimatePresence>
                    {val.trim() && !loading && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        className="w-full mt-4 py-5 bg-surface-active text-content-active font-bold text-[10px] uppercase tracking-[0.4em] transition-all shadow-glass rounded-2xl focus-glow"
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <ArrowUp size={14} />
                          Start
                        </span>
                      </motion.button>
                    )}
                  </AnimatePresence>
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
            <div className="max-w-2xl mx-auto w-full space-y-6">
              {(currentMessage || state.status === 'active' || loading) && (
                <div className="pt-6">
                  {gateProgress && (
                    <p className="text-[10px] uppercase tracking-[0.22em] text-content-dim text-center mb-2">
                      Clarifier {gateProgress}
                    </p>
                  )}
                  <ClinicalQuestionCard
                    statement={statement}
                    question={resolvedQuestion}
                    reducedMotion={state.settings.reduced_motion}
                  />
                </div>
              )}

              <div className="space-y-4">
                <ResponseOptionsPanel
                  responseOptions={state.response_options}
                  selectedOptionIds={selectedOptionIds}
                  onSelect={(optionId) => void handleOptionSelect(optionId)}
                  onSubmitSingle={() => void handleSingleSubmit()}
                  onSubmitMultiple={() => void handleMultipleSubmit()}
                  loading={loading}
                />

                {showInput && (
                  <div className="pt-1 flex items-center gap-3 rounded-[28px] surface-raised p-3 shadow-glass">
                    <textarea
                      rows={1}
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder="Add details..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleInitialInput();
                        }
                      }}
                      className="flex-1 surface-raised p-4 rounded-2xl text-sm text-content-primary placeholder-content-dim transition-all resize-none no-scrollbar text-left focus-glow"
                    />
                    {val.trim() && !loading && (
                      <button
                        onClick={() => void handleInitialInput()}
                        className="h-12 w-12 flex items-center justify-center bg-surface-active text-content-active rounded-2xl shadow-glass focus-glow hover:scale-[1.02] active:scale-95"
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
