import React from 'react';
import { motion } from 'framer-motion';

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onToggle, ariaLabel }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative h-8 w-[54px] rounded-full transition-all duration-300 focus-glow interactive-tap ${
        checked ? 'bg-accent-primary' : 'surface-chip'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
        className={`absolute top-1 h-6 w-6 rounded-full ${
          checked ? 'left-[1.7rem] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.28)]' : 'left-1 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.24)]'
        }`}
      />
    </button>
  );
};

