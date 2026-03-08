import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { callClinicalEngine } from '../../core/api/clinicalEngine';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { ChevronLeft } from 'lucide-react';

export const StepRenderer: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInitialInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!val.trim()) return;

    setLoading(true);
    const result = await callClinicalEngine(val, state);
    dispatch({ type: 'SET_AI_RESPONSE', payload: result, lastInput: val });
    setVal('');
    setLoading(false);
  };

  const handleOptionSelect = async (option: string) => {
    setLoading(true);
    const result = await callClinicalEngine(option, state);
    dispatch({ type: 'SET_AI_RESPONSE', payload: result, lastInput: option });
    setLoading(false);
  };

  const handleGoBack = () => {
    dispatch({ type: 'GO_BACK' });
  };

  if (state.status === 'complete') return null;

  const canGoBack = state.history.length > 0 || state.status !== 'idle';

  return (
    <div className="flex-1 flex flex-col justify-start">
      <AnimatePresence mode="wait">
        {state.status === 'idle' || state.status === 'intake' ? (
          <motion.div
            key="intake"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center space-y-6 pt-4 animate-emergence"
          >
            <div className="flex items-center justify-between gap-4 px-2 mb-2">
              <div className="w-12 h-12 flex items-center justify-center">
                {canGoBack && (
                  <button 
                    onClick={handleGoBack}
                    className="group p-3 bg-white/[0.05] hover:bg-white/[0.08] backdrop-blur-md text-[var(--text-dim)] hover:text-neon-cyan active:scale-90 transition-all rounded-full border-none outline-none flex items-center justify-center shadow-none"
                  >
                    <ChevronLeft size={24} className="group-hover:drop-shadow-[0_0_8px_var(--accent-glow)] transition-all" />
                  </button>
                )}
              </div>
              <h1 className="text-xl font-light tracking-tight text-[var(--text-secondary)] flex-1">
                Tell me what&apos;s happening.
              </h1>
              <div className="w-12 h-12 flex items-center justify-center">
                 {state.status !== 'idle' && (
                   <button 
                     onClick={() => dispatch({ type: 'RESET' })}
                     className="text-[var(--text-dim)] hover:text-neon-red transition-all border-none outline-none bg-transparent active:scale-95"
                   >
                     <motion.div whileHover={{ rotate: 90 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                     </motion.div>
                   </button>
                 )}
              </div>
            </div>
            
            <form onSubmit={handleInitialInput} className="relative">
              <textarea
                autoFocus
                rows={4}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="Describe your symptoms..."
                className="w-full bg-[var(--bg-secondary)] backdrop-blur-3xl border-none outline-none text-lg p-6 rounded-[32px] text-[var(--text-primary)] placeholder-[var(--text-dim)] transition-all focus:bg-[var(--bg-secondary)]/10 resize-none"
              />
              <button
                type="submit"
                disabled={loading || !val.trim()}
                className="mt-4 w-full bg-neon-cyan/10 py-5 rounded-[24px] text-neon-cyan font-bold tracking-wide transition-all active:scale-95 disabled:opacity-20 border-none outline-none"
              >
                {loading ? 'Analyzing...' : 'Begin Consultation'}
              </button>
            </form>
          </motion.div>
        ) : state.currentQuestion ? (
          <motion.div
            key={state.currentQuestion.question}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4 pt-2 pb-12 animate-emergence"
          >
            <div className="flex items-center justify-between mb-8 px-2">
              <div className="w-12 h-12 flex items-center justify-center">
                <button 
                  onClick={handleGoBack}
                  className="group p-3 bg-white/[0.05] hover:bg-white/[0.08] backdrop-blur-md text-[var(--text-dim)] hover:text-neon-cyan active:scale-90 transition-all rounded-full border-none outline-none flex items-center justify-center shadow-none"
                >
                  <ChevronLeft size={24} className="group-hover:drop-shadow-[0_0_8px_var(--accent-glow)] transition-all" />
                </button>
              </div>
              <div className="text-center flex-1">
                <span className="text-[10px] text-neon-cyan/40 uppercase tracking-[0.3em] font-bold">Questioning</span>
                <h2 className="text-xl font-light text-[var(--text-primary)] leading-tight mt-1 px-4">
                  {state.currentQuestion.question}
                </h2>
              </div>
              <div className="w-12 h-12 flex items-center justify-center">
                 <button 
                   onClick={() => dispatch({ type: 'RESET' })}
                   className="text-[var(--text-dim)] hover:text-neon-red transition-all border-none outline-none bg-transparent active:scale-95"
                 >
                   <motion.div whileHover={{ rotate: 90 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                   </motion.div>
                 </button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {state.currentQuestion.options.map((option, idx) => (
                <GlassContainer
                  key={idx}
                  interactive
                  onClick={() => handleOptionSelect(option)}
                  disabled={loading}
                  className="text-left px-6 py-5 rounded-[24px]"
                >
                  <span className="text-base text-[var(--text-secondary)]">{option}</span>
                </GlassContainer>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
