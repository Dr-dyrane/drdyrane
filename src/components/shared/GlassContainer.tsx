import React from 'react';
import { motion } from 'framer-motion';

interface GlassContainerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
  disabled?: boolean;
}

export const GlassContainer: React.FC<GlassContainerProps> = ({ 
  children, 
  className = '', 
  onClick,
  interactive = false,
  disabled = false
}) => {
  return (
    <motion.div
      onClick={!disabled ? onClick : undefined}
      whileHover={interactive && !disabled ? { 
        backgroundColor: 'var(--glass-bg-hover)',
        boxShadow: 'var(--glass-shadow-hover)',
        scale: 1.01
      } : {}}
      whileTap={interactive && !disabled ? { scale: 0.98 } : {}}
      className={`glass-panel transition-all duration-300 ${interactive ? 'cursor-pointer' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
};
