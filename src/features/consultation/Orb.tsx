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
  // FLOW STATE: Faster breathing rhythm - like Hamilton's focus, not mechanical loader
  const animationDuration = loading ? (isHero ? 1.2 : 1.4) : isHero ? 2.5 : 3;

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
            // FLOW STATE: Subtle breathing rhythm - like focused presence, not mechanical loader
            scale: isEmergency ? [1, 1.05, 1] : loading ? [0.99, 1.01, 0.99] : [1, 1.005, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: animationDuration,
            ease: 'easeInOut', // Smooth breathing, like Hamilton's focus
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

        {/* FLOW STATE: Removed pulsing ring - orb breathes naturally without extra effects */}
      </div>
    </div>
  );
};
