import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Brain, Zap, SendHorizontal } from 'lucide-react';
import { CycleState } from '../../core/types/clinical';

interface CycleAISheetProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: CycleState;
}

export const CycleAISheet: React.FC<CycleAISheetProps> = ({ isOpen, onClose, cycle }) => {
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const handleAsk = () => {
    if (!query.trim()) return;
    setIsAnalyzing(true);
    setResponse(null);
    
    // Simulate AI thinking
    setTimeout(() => {
      setIsAnalyzing(false);
      setResponse(`Based on your recent logs and current life stage (${cycle.life_stage}), your energy levels might fluctuate over the next 48 hours. I recommend increasing magnesium intake and maintaining consistent sleep hygiene.`);
    }, 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] flex items-end justify-center px-4 pb-12"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative w-full max-w-lg surface-raised rounded-[40px] p-8 shadow-2xl space-y-8 flex flex-col max-h-[70vh] bg-black/40 backdrop-blur-2xl"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-1 bg-white/10 rounded-full mx-auto mb-6" />
              <div className="flex items-center justify-center gap-2 text-neon-rose mb-2">
                <Brain size={24} />
                <h3 className="text-2xl font-bold display-type text-content-primary">Ava AI</h3>
              </div>
              <p className="text-sm text-content-dim italic">Your personal reproductive health consultant.</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-2">
              {!response && !isAnalyzing && (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-content-dim uppercase tracking-widest px-1">Suggested Questions</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      "How will my energy be tomorrow?",
                      "Is my current flow normal for adult stage?",
                      "When is my peak fertility window?",
                      "Manage PMS mood swings naturally"
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setQuery(q)}
                        className="p-4 rounded-2xl bg-white/5 backdrop-blur-sm text-sm text-left text-content-secondary interactive-tap"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isAnalyzing && (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="text-neon-rose"
                  >
                    <Sparkles size={40} />
                  </motion.div>
                  <p className="text-sm text-content-dim animate-pulse">Consulting reproductive data patterns...</p>
                </div>
              )}

              {response && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 rounded-3xl bg-white/5 backdrop-blur-md space-y-4"
                >
                   <div className="flex items-center gap-2 text-neon-rose">
                    <Zap size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">AI Insight</span>
                  </div>
                  <p className="text-sm text-content-primary leading-relaxed whitespace-pre-wrap">
                    {response}
                  </p>
                  <button 
                    onClick={() => setResponse(null)}
                    className="text-xs text-neon-rose font-bold uppercase tracking-widest opacity-80 hover:opacity-100 transition-opacity"
                  >
                    Ask something else
                  </button>
                </motion.div>
              )}
            </div>

            <div className="relative pt-4">
              <input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="Ask Ava anything..."
                className="w-full bg-white/5 border-0 backdrop-blur-md rounded-3xl py-4 pl-6 pr-14 text-sm text-white focus:outline-none ring-1 ring-white/10 focus:ring-neon-rose/30 transition-all"
              />
              <button 
                onClick={handleAsk}
                disabled={!query.trim() || isAnalyzing}
                className="absolute right-2 top-[calc(1rem+8px)] h-10 w-10 rounded-full bg-neon-rose text-white flex items-center justify-center disabled:opacity-50 disabled:bg-surface-muted transition-all"
              >
                <SendHorizontal size={18} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
