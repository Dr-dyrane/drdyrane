import React from 'react';
import { motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Activity, Shield, TrendingUp, UserCheck } from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';

export const PillarCard: React.FC = () => {
  const { state, dispatch } = useClinical();

  if (state.status !== 'complete' || !state.pillars) return null;

  const pillars = [
    { title: 'Diagnosis', icon: Activity, content: state.pillars.diagnosis },
    { title: 'Management', icon: Shield, content: state.pillars.management },
    { title: 'Prognosis', icon: TrendingUp, content: state.pillars.prognosis },
    { title: 'Prevention', icon: UserCheck, content: state.pillars.prevention },
  ];

  const reset = () => {
    dispatch({ type: 'RESET' });
  };

  return (
    <div className="flex-1 px-2 py-8 space-y-8 animate-emergence">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="text-center"
      >
        <span className="text-neon-cyan/40 uppercase tracking-[0.3em] text-[10px] font-bold">Clinical Resolution</span>
        <h1 className="text-2xl font-light text-[var(--text-primary)] mt-3 leading-tight tracking-tight">{state.pillars.diagnosis}</h1>
      </motion.div>

      <div className="flex flex-col gap-4 pb-20">
        {pillars.map((pillar) => (
          <GlassContainer
            key={pillar.title}
            className="p-6 rounded-[28px] space-y-4 shadow-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-neon-cyan/10 rounded-xl">
                <pillar.icon className="w-4 h-4 text-neon-cyan" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-dim)] uppercase tracking-widest">{pillar.title}</h3>
            </div>
            <p className="text-base leading-relaxed text-[var(--text-secondary)] font-light pr-2">
              {pillar.content}
            </p>
          </GlassContainer>
        ))}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex justify-center pt-8"
        >
          <button
            onClick={reset}
            className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors active:scale-95 border-none outline-none bg-transparent"
          >
            Terminate Session & Reset
          </button>
        </motion.div>
      </div>
    </div>
  );
};
