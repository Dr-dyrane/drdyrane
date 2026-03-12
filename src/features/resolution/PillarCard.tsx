import React from 'react';
import { motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Activity, Shield, TrendingUp, UserCheck } from 'lucide-react';
import { Orb } from '../consultation/Orb';

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
    <div className="flex-1 px-2 py-7 space-y-7 animate-emergence">
      <div className="flex justify-center">
        <Orb />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-2"
      >
        <h1 className="display-type text-[1.9rem] text-content-primary leading-tight tracking-tight px-4">
          Conclusion
        </h1>
        <p className="text-sm text-content-dim">Clinical synthesis complete</p>
      </motion.div>

      <div className="flex flex-col gap-6 pb-24">
        {pillars.map((pillar, idx) => (
          <motion.div
            key={pillar.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + idx * 0.1 }}
            className="p-6 bg-surface-muted rounded-[24px] space-y-4 shadow-glass"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-accent-soft rounded-2xl">
                <pillar.icon className="w-5 h-5 text-accent-primary" />
              </div>
              <h3 className="text-xs font-semibold text-content-dim tracking-wide">{pillar.title}</h3>
            </div>
            <p className="text-base leading-relaxed text-content-secondary pr-2">
              {pillar.content}
            </p>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex justify-center pt-12"
        >
          <button
            onClick={reset}
            className="px-10 py-4 cta-live rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 shadow-glass"
          >
            New Consultation
          </button>
        </motion.div>
      </div>
    </div>
  );
};
