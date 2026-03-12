import React from 'react';
import { motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { resolveTheme } from '../../core/theme/resolveTheme';

interface OrbProps {
  loading?: boolean;
  prominence?: 'hero' | 'support';
}

export const Orb: React.FC<OrbProps> = ({ loading, prominence = 'support' }) => {
  const { state } = useClinical();
  const resolvedTheme = resolveTheme(state.theme);

  const isEmergency = state.status === 'emergency';
  const isActive = state.status !== 'idle' && state.status !== 'complete';
  const isHero = prominence === 'hero';
  const containerClass = isHero
    ? isActive
      ? 'h-12 scale-[0.4]'
      : 'h-32 pt-4'
    : 'h-20 pt-1 scale-[0.78]';
  const imageClass = isHero ? 'w-32 h-32' : 'w-28 h-28';
  const animationDuration = loading ? (isHero ? 1.5 : 1.8) : isHero ? 4 : 5;

  return (
    <div className={`flex flex-col items-center justify-center transition-all duration-700 ${containerClass}`}>
      <div className="relative flex items-center justify-center translate-y-2">
        <motion.div
          animate={{
            filter: isEmergency
              ? 'var(--orb-drop-emergency)'
              : loading
                ? ['var(--orb-drop-soft)', 'var(--orb-drop-active)', 'var(--orb-drop-soft)']
                : 'var(--orb-drop-idle)',
            scale: isEmergency ? [1, 1.05, 1] : loading ? [0.98, 1.02, 0.98] : 1,
          }}
          transition={{
            repeat: Infinity,
            duration: animationDuration,
            ease: 'easeInOut',
          }}
          className="relative z-10"
        >
          <motion.img
            src={resolvedTheme === 'dark' ? '/logo.png' : '/logo_light.png'}
            alt=""
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            className={`${imageClass} object-contain transition-all duration-1000`}
          />
        </motion.div>

        {loading && isHero && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
            className="absolute inset-0 surface-chip rounded-full blur-2xl"
          />
        )}
      </div>
    </div>
  );
};
