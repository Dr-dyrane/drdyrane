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
      className={`relative h-8 w-14 rounded-full transition-colors duration-300 focus-glow ${
        checked ? 'bg-surface-active' : 'bg-surface-muted'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
        className={`absolute top-1 h-6 w-6 rounded-full ${
          checked ? 'left-7 bg-black' : 'left-1 bg-white/90'
        }`}
      />
    </button>
  );
};
