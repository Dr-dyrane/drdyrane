import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface SideSheetProps {
  isOpen: boolean;
  side: 'left' | 'right';
  onClose: () => void;
  children: React.ReactNode;
}

export const SideSheet: React.FC<SideSheetProps> = ({ isOpen, side, onClose, children }) => {
  const isLeft = side === 'left';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/18 backdrop-blur-sm"
          />

          <motion.aside
            initial={{ x: isLeft ? '-100%' : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: isLeft ? '-100%' : '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className={`fixed top-0 ${isLeft ? 'left-0 rounded-r-[30px]' : 'right-0 rounded-l-[30px]'} h-full w-[82%] max-w-[360px] z-[80] surface-raised shadow-[0_30px_60px_rgba(0,0,0,0.35)]`}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
