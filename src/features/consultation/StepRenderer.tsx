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
      <div className="flex items-center justify-between px-6 -mb-2 z-20">
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

      <AnimatePresence mode="wait">
        {(state.status === 'idle' || state.status === 'intake') ? (
          <motion.div
            key="intake"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center -mt-12 px-4"
          >
            <div className="max-w-2xl w-full flex flex-col items-center">
              <Orb loading={loading} />
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center pb-2"
              >
                <h1 className="text-3xl font-light tracking-tight text-white/90 leading-tight">
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
                    className="w-full bg-white/[0.01] hover:bg-white/[0.02] p-6 rounded-2xl outline-none text-lg text-center text-[var(--text-primary)] placeholder-[var(--text-dim)] transition-all resize-none shadow-none border-none"
                  />

                  <AnimatePresence>
                    {val.trim() && !loading && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        type="submit"
                        className="w-full mt-4 py-5 bg-white text-black font-bold text-[10px] uppercase tracking-[0.4em] transition-all active:scale-95 shadow-[0_30px_60px_rgba(255,255,255,0.15)] rounded-2xl"
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
            {/* The Blurred History (Rule 18/21) */}
            <div className="flex-1 overflow-y-auto px-2 no-scrollbar">
              <div className="space-y-12">
                {state.conversation.slice(0, -1).map((message: any, idx: number) => {
                  if (message.role === 'patient') return null;
                  const isOld = idx < state.conversation.length - 4;
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: isOld ? 0 : 0.05,
                        filter: isOld ? 'blur(20px)' : 'blur(12px)',
                        scale: isOld ? 0.8 : 0.9
                      }}
                      className="text-center"
                    >
                      <p className="text-lg font-light leading-relaxed text-[var(--text-primary)]">
                        {message.content}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* The Focal Command Panel (Rule 4/29) */}
            <div className="absolute bottom-0 left-0 right-0 p-2 pb-2 pt-12 bg-gradient-to-t from-black via-black/98 to-transparent backdrop-blur-3xl border-none">
              <div className="max-w-2xl mx-auto space-y-4">

                {/* The Current Question (Rule 30: Type is Interface) */}
                {state.conversation.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="text-center px-2"
                  >
                    <p className="text-base font-medium leading-normal tracking-tight text-white mb-2 selection:bg-neon-cyan/30">
                      {state.conversation[state.conversation.length - 1].content}
                    </p>
                    <div className="flex justify-center gap-6 mt-4 items-center">
                      <div className="group relative cursor-default">
                        <span className="text-[10px] uppercase font-bold tracking-[0.4em] text-white/40 group-hover:text-neon-cyan transition-colors">Certainty: {state.probability}%</span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 w-64 p-5 glass-panel opacity-0 group-hover:opacity-100 transition-all pointer-events-none text-[10px] leading-relaxed text-[var(--text-secondary)] scale-95 group-hover:scale-100 origin-bottom border-none shadow-[0_40px_80px_rgba(0,0,0,0.8)] z-50">
                          <span className="block mb-3 text-neon-cyan opacity-80 uppercase tracking-widest font-bold text-[8px]">Cognitive Trace</span>
                          <div className="max-h-32 overflow-y-auto pr-2 no-scrollbar">
                            {state.thinking || "Synthesizing clinical evidence..."}
                          </div>
                        </div>
                      </div>
                      <div className="w-1 h-3 rounded-full bg-white/10" />
                      <span className={`text-[10px] uppercase font-bold tracking-[0.4em] ${state.urgency === 'critical' ? 'text-neon-red' : 'text-white/40'}`}>
                        {state.urgency}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Phasic Grid (Rule 10) */}
                <div className="space-y-4">
                  <div className={`grid gap-2 animate-emergence ${(state.response_options?.options.length || 0) > 4 ? 'grid-cols-2' : 'grid-cols-1'
                    }`}>
                    {state.response_options?.options.map((option: any) => {
                      const isSelected = selectedOptionIds.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleOptionSelect(option.id)}
                          className={`relative overflow-hidden py-2.5 px-2 rounded-lg transition-all duration-300 border-none outline-none text-center group ${isSelected
                            ? 'shadow-[0_15px_30px_rgba(0,245,255,0.15)] z-10 scale-[1.01]'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-white/[0.05]'
                            }`}
                          style={{
                            backgroundColor: isSelected ? 'var(--bg-active)' : undefined,
                            color: isSelected ? 'var(--text-active)' : undefined
                          }}
                        >
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                layoutId={state.response_options?.mode === 'single' ? "active-pill" : undefined}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-[var(--bg-active)]"
                                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                              />
                            )}
                          </AnimatePresence>
                          <span className="relative z-10 text-[9px] font-bold uppercase tracking-[0.2em] transition-colors duration-300">
                            {option.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {state.response_options?.mode === 'multiple' && selectedOptionIds.length > 0 && (
                    <button
                      onClick={handleMultipleSubmit}
                      className="w-full py-5 bg-neon-cyan text-black font-bold text-[10px] uppercase tracking-[0.4em] transition-all active:scale-95 shadow-[0_20px_40px_rgba(0,245,255,0.2)] rounded-xl"
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
                        className="flex-1 bg-white/[0.02] hover:bg-white/[0.04] p-3 rounded-xl outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] transition-all resize-none no-scrollbar text-center"
                      />
                      {val.trim() && !loading && (
                        <button onClick={() => handleInitialInput()} className="p-3 bg-white text-black rounded-xl">
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
