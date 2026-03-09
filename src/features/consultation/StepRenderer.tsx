import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { Orb } from './Orb';
import { ChevronLeft, X } from 'lucide-react';

export const StepRenderer: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [showTrace, setShowTrace] = useState(false);

  const handleInitialInput = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!val.trim()) return;

    setLoading(true);
    const result = await processAgentInteraction(val, state);
    dispatch({ type: 'SET_AGENT_RESPONSE', payload: result, lastInput: val });
    setVal('');
    setLoading(false);
  };

  const handleOptionSelect = async (optionId: string) => {
    if (!state.response_options) return;

    const { mode } = state.response_options;

    if (mode === 'multiple') {
      const newSelection = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter(id => id !== optionId)
        : [...selectedOptionIds, optionId];
      setSelectedOptionIds(newSelection);
    } else if (mode === 'single') {
      setLoading(true);
      const result = await processAgentInteraction([optionId], state, true);
      dispatch({ type: 'SET_AGENT_RESPONSE', payload: result });
      setLoading(false);
    }
  };

  const handleMultipleSubmit = async () => {
    if (selectedOptionIds.length === 0) return;

    setLoading(true);
    const result = await processAgentInteraction(selectedOptionIds, state, true);
    dispatch({ type: 'SET_AGENT_RESPONSE', payload: result });
    setSelectedOptionIds([]);
    setLoading(false);
  };

  const handleReset = () => {
    dispatch({ type: 'RESET' });
  };

  const handleGoBack = () => {
    dispatch({ type: 'GO_BACK' });
  };

  if (state.status === 'complete') return null;

  const showInput = !state.response_options || state.response_options.allow_custom_input;

  const canGoBack = state.history.length > 0 || state.status !== 'idle' || state.conversation.length > 0;

  return (
    <div className="flex-1 flex flex-col justify-start min-h-0 px-2">
      {/* Universal Breadcrumb Utilities */}
      <div className="flex items-center justify-between px-2 z-20">
        <div className="w-10">
          {canGoBack && (
            <button
              onClick={handleGoBack}
              className="p-2 text-[var(--text-dim)] hover:text-neon-cyan transition-all active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
          )}
        </div>
        <div className="w-10">
          {state.status !== 'idle' && (
            <button
              onClick={handleReset}
              className="p-2 text-[var(--text-dim)] hover:text-neon-red transition-all active:scale-90"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <Orb loading={loading} />
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

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center pb-2"
              >
                <h1 className="text-3xl font-light tracking-tight text-content-primary/90 leading-tight">
                  {state.conversation.length > 0 ? "Anything else?" : "What's happening?"}
                </h1>
              </motion.div>

              <form onSubmit={handleInitialInput} className="space-y-4">
                <div className="relative group">
                  <textarea
                    autoFocus
                    rows={2}
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="e.g. Sharp chest pain, high fever..."
                    disabled={loading}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleInitialInput(e as any)}
                    className="w-full bg-surface-muted hover:bg-surface-muted/80 p-2 rounded-2xl outline-none text-xl text-center text-content-primary placeholder-content-dim transition-all resize-none border-none backdrop-blur-md shadow-glass"
                  />

                  <AnimatePresence>
                    {val.trim() && !loading && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        whileHover={{ scale: 1.01, translateY: -2 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        className="w-full mt-4 py-5 bg-surface-active text-content-active font-bold text-[10px] uppercase tracking-[0.4em] transition-all shadow-glass hover:shadow-2xl rounded-2xl cursor-pointer"
                      >
                        Analyze Findings
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full relative"
          >
            {/* The Receding History (Rule 18/24) */}
            <div className="flex-1 overflow-y-auto px-2 no-scrollbar max-h-[15vh]">
              <div className="space-y-6 pt-4">
                {state.conversation.slice(0, -1).map((message: any, idx: number) => {
                  if (message.role === 'patient') return null;
                  const isOld = idx < state.conversation.length - 3;
                  if (isOld) return null; // Hide older history to reduce stress
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: 0.03, // Ultra-ghostly
                        filter: 'blur(8px)',
                        scale: 0.95
                      }}
                      className="text-center"
                    >
                      <p className="text-sm font-light leading-relaxed text-[var(--text-primary)]">
                        {message.content}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* The Focal Command Panel (Rule 4/29) */}
            <div className="relative p-2 pb-24 border-none">
              <div className="max-w-2xl mx-auto space-y-6">

                {/* The Current Question (Rule 30: Type is Interface) */}
                {state.conversation.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="text-center px-2"
                  >
                    <p className="text-xl font-light leading-snug tracking-tight text-content-primary mb-2 selection:bg-neon-cyan/30">
                      {state.conversation[state.conversation.length - 1].content}
                    </p>
                    <div className="flex justify-center gap-6 mt-4 items-center">
                      <div className="relative">
                        <button
                          onClick={() => setShowTrace(!showTrace)}
                          className={`text-[10px] uppercase font-bold tracking-[0.4em] transition-colors border-none outline-none bg-transparent cursor-pointer ${showTrace ? 'text-neon-cyan' : 'text-content-dim hover:text-neon-cyan'}`}
                        >
                          Certainty: {state.probability}%
                        </button>
                        <AnimatePresence>
                          {showTrace && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 w-64 p-5 glass-panel text-[10px] leading-relaxed text-content-secondary border-none shadow-glass z-50 pointer-events-auto"
                            >
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-neon-cyan opacity-80 uppercase tracking-widest font-bold text-[8px]">Cognitive Trace</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowTrace(false); }}
                                  className="text-content-dim hover:text-content-primary border-none bg-transparent p-1"
                                >
                                  <ChevronLeft size={12} className="rotate-90" />
                                </button>
                              </div>
                              <div className="max-h-32 overflow-y-auto pr-2 no-scrollbar text-left font-light leading-relaxed">
                                {state.thinking || "Synthesizing clinical evidence..."}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="w-1 h-3 rounded-full bg-surface-muted" />
                      <span className={`text-[10px] uppercase font-bold tracking-[0.4em] ${state.urgency === 'critical' ? 'text-neon-red' : 'text-content-dim'}`}>
                        {state.urgency}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Phasic Grid (Rule 10) */}
                <div className="space-y-4">
                  <div className={`grid gap-2 animate-emergence ${(state.response_options?.options?.length || 0) > 6 ? 'grid-cols-2' : 'grid-cols-1'
                    }`}>
                    {state.response_options?.options?.map((option: any) => {
                      const isSelected = selectedOptionIds.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleOptionSelect(option.id)}
                          className={`relative overflow-hidden py-3.5 px-4 rounded-xl transition-all duration-300 outline-none text-center group cursor-pointer border ${isSelected
                            ? 'bg-surface-active text-content-active shadow-glass scale-[1.02] z-10 border-transparent'
                            : 'bg-surface-muted hover:bg-surface-muted/80 text-content-secondary hover:text-content-primary backdrop-blur-md shadow-sm border-content-primary/5'
                            }`}
                        >
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                layoutId={state.response_options?.mode === 'single' ? "active-pill" : undefined}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-surface-active"
                                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                              />
                            )}
                          </AnimatePresence>
                          <span className={`relative z-10 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors duration-300 ${isSelected ? 'text-content-active' : 'group-hover:text-content-primary'}`}>
                            {option.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {state.response_options?.mode === 'multiple' && selectedOptionIds.length > 0 && (
                    <button
                      onClick={handleMultipleSubmit}
                      className="w-full py-5 bg-neon-cyan text-black font-bold text-[10px] uppercase tracking-[0.4em] transition-all hover:scale-[1.01] hover:-translate-y-0.5 active:scale-95 shadow-[0_20px_40px_rgba(0,245,255,0.3)] hover:shadow-[0_30px_60px_rgba(0,245,255,0.4)] rounded-xl cursor-pointer"
                    >
                      Confirm Analysis ({selectedOptionIds.length})
                    </button>
                  )}

                  {showInput && (
                    <div className="pt-2 flex items-center gap-2">
                      <textarea
                        rows={1}
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        placeholder="Additional details..."
                        className="flex-1 bg-surface-muted hover:bg-surface-muted/80 p-4 rounded-xl outline-none text-xs text-content-primary placeholder-content-dim transition-all resize-none no-scrollbar text-center cursor-text"
                      />
                      {val.trim() && !loading && (
                        <button onClick={() => handleInitialInput()} className="p-3 bg-surface-active text-content-active rounded-xl">
                          <ChevronLeft size={16} className="rotate-180" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

  );
};
