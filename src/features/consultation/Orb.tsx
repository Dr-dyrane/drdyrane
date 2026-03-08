import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';

export const Orb: React.FC = () => {
  const { state } = useClinical();

  const isEmergency = state.status === 'emergency';
  const hasThinking = state.thinking && state.status !== 'idle' && state.status !== 'complete';

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="relative flex items-center justify-center">

        {/* The 'Living' Logo (Globe) */}
        <motion.div
          animate={{
            filter: isEmergency
              ? 'drop-shadow(0 0 20px rgba(255, 68, 68, 0.4))'
              : 'drop-shadow(0 0 15px rgba(0, 243, 255, 0.2))'
          }}
          className="relative z-10"
        >
          <motion.img
            src={state.theme === 'dark' ? "/logo.png" : "/logo_light.png"}
            alt="Dr. Dyrane AI"
            initial={{ rotate: -10, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="w-48 h-48 object-contain opacity-95"
          />
        </motion.div>
      </div>

      <AnimatePresence>
        {hasThinking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 px-8 text-center"
          >
            <p className="text-[10px] text-neon-cyan/40 uppercase tracking-[0.2em] font-bold mb-2">Diagnostic Focus</p>
            <p className="text-sm text-[var(--text-dim)] font-light leading-relaxed italic max-w-[320px]">
              &ldquo;{state.thinking}&rdquo;
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-[9px] text-[var(--text-dim)] uppercase tracking-widest font-bold">Certainty</span>
              <span className="text-xs font-mono text-neon-cyan">{state.probability}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
