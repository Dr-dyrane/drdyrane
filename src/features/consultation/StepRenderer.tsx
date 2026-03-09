import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { processAgentInteraction } from '../../core/api/agentCoordinator';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { ChevronLeft, Check, MessageCircle } from 'lucide-react';

export const StepRenderer: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);

  const handleInitialInput = async (e: React.FormEvent) => {
    e.preventDefault();
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
      // Toggle selection for multiple mode
      const newSelection = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter(id => id !== optionId)
        : [...selectedOptionIds, optionId];
      setSelectedOptionIds(newSelection);
    } else if (mode === 'single') {
      // Immediate submission for single mode
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
        ) : (
          <motion.div
            key="conversation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4 pt-2 pb-12 animate-emergence"
          >
            {/* Conversation History */}
            <div className="space-y-4 max-h-96 overflow-y-auto px-2">
              {state.conversation.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.role === 'doctor' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[80%] p-4 rounded-2xl ${
                    message.role === 'doctor'
                      ? 'bg-neon-cyan/10 text-[var(--text-primary)] border border-neon-cyan/20'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {message.role === 'doctor' ? (
                        <MessageCircle size={16} className="text-neon-cyan" />
                      ) : (
                        <div className="w-2 h-2 bg-neon-cyan rounded-full" />
                      )}
                      <span className="text-xs text-[var(--text-dim)] uppercase tracking-wide">
                        {message.role === 'doctor' ? 'Dr. Dyrane' : 'You'}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    {message.metadata?.thinking && (
                      <div className="mt-2 text-xs text-[var(--text-dim)] italic">
                        {message.metadata.thinking}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Response Options */}
            {state.response_options && (
              <div className="space-y-4">
                <div className="text-center">
                  <span className="text-[10px] text-neon-cyan/40 uppercase tracking-[0.3em] font-bold">
                    {state.response_options.mode === 'multiple' ? 'Select All That Apply' :
                     state.response_options.mode === 'single' ? 'Choose One' :
                     state.response_options.mode === 'confirm' ? 'Confirm' : 'Response Options'}
                  </span>
                  {state.response_options.context_hint && (
                    <p className="text-xs text-[var(--text-dim)] mt-1">
                      {state.response_options.context_hint}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {state.response_options.options.map((option) => {
                    const isSelected = selectedOptionIds.includes(option.id);
                    return (
                      <GlassContainer
                        key={option.id}
                        interactive
                        onClick={() => handleOptionSelect(option.id)}
                        disabled={loading}
                        className={`text-left px-6 py-5 rounded-[24px] transition-all ${
                          isSelected ? 'ring-2 ring-neon-cyan bg-neon-cyan/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base text-[var(--text-secondary)]">
                            {option.text}
                          </span>
                          {state.response_options?.mode === 'multiple' && (
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'border-neon-cyan bg-neon-cyan'
                                : 'border-[var(--text-dim)]'
                            }`}>
                              {isSelected && <Check size={12} className="text-black" />}
                            </div>
                          )}
                        </div>
                        {option.category && (
                          <span className="text-xs text-[var(--text-dim)] mt-1 block">
                            {option.category}
                          </span>
                        )}
                      </GlassContainer>
                    );
                  })}
                </div>

                {/* Multiple selection submit button */}
                {state.response_options.mode === 'multiple' && selectedOptionIds.length > 0 && (
                  <button
                    onClick={handleMultipleSubmit}
                    disabled={loading}
                    className="w-full bg-neon-cyan/10 py-4 rounded-[24px] text-neon-cyan font-bold tracking-wide transition-all active:scale-95 disabled:opacity-20 border-none outline-none"
                  >
                    {loading ? 'Processing...' : `Continue with ${selectedOptionIds.length} selection${selectedOptionIds.length > 1 ? 's' : ''}`}
                  </button>
                )}

                {/* Freeform input option */}
                {state.response_options.allow_custom_input && (
                  <form onSubmit={handleInitialInput} className="relative">
                    <textarea
                      rows={2}
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder="Or tell me in your own words..."
                      className="w-full bg-[var(--bg-secondary)] backdrop-blur-3xl border-none outline-none text-sm p-4 rounded-[24px] text-[var(--text-primary)] placeholder-[var(--text-dim)] transition-all focus:bg-[var(--bg-secondary)]/10 resize-none"
                    />
                    {val.trim() && (
                      <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full bg-neon-cyan/10 py-3 rounded-[20px] text-neon-cyan font-bold tracking-wide transition-all active:scale-95 disabled:opacity-20 border-none outline-none text-sm"
                      >
                        {loading ? 'Sending...' : 'Send'}
                      </button>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* Loading indicator */}
            {loading && (
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 text-neon-cyan">
                  <div className="w-4 h-4 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
                  <span className="text-sm">Dr. Dyrane is thinking...</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
