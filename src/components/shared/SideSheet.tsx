import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { OverlayPortal } from './OverlayPortal';

interface SideSheetProps {
  isOpen: boolean;
  side: 'left' | 'right';
  onClose: () => void;
  children: React.ReactNode;
}

export const SideSheet: React.FC<SideSheetProps> = ({ isOpen, side, onClose, children }) => {
  const lateralOffset = side === 'left' ? -10 : 10;

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[120] overlay-backdrop-soft backdrop-blur-sm"
            />

            <motion.aside
              initial={{ opacity: 0, y: '12%', x: lateralOffset }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: '14%', x: lateralOffset }}
              transition={{ type: 'spring', damping: 30, stiffness: 290, mass: 0.85 }}
              className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[440px] z-[130] pointer-events-auto"
            >
              <div className="ios-sheet-surface rounded-t-[32px] shadow-modal overflow-hidden max-h-[88dvh] min-h-[60dvh] h-[min(88dvh,760px)] pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-center justify-center pt-2 pb-1">
                  <span className="h-1 w-11 rounded-full surface-chip" />
                </div>
                {children}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};
