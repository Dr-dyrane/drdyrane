import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar as CalendarIcon } from 'lucide-react';
import { CycleState } from '../../core/types/clinical';
import { CycleCalendar } from './CycleCalendarSimple';

interface CycleCalendarOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: CycleState;
  isPartnerMode?: boolean;
}

export const CycleCalendarOverlay: React.FC<CycleCalendarOverlayProps> = ({
  isOpen,
  onClose,
  cycle,
  isPartnerMode = false
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex flex-col justify-end p-2 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { type: 'tween', duration: 0.3 } }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full max-h-[85vh] overflow-hidden pointer-events-auto relative surface-raised rounded-[40px] shadow-2xl bg-black/40 backdrop-blur-2xl flex flex-col"
          >
            {/* Header */}
            <div className="sticky top-0 z-[11] p-6 pb-4 flex items-center justify-between bg-surface-strong/20 backdrop-blur-xl border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/5 text-content-primary">
                  <CalendarIcon size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold display-type text-content-primary">Cycle Calendar</h3>
                  <p className="text-[10px] text-content-dim uppercase tracking-widest font-medium">
                    {isPartnerMode ? "Partner View" : "Timeline Mapping"}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="h-10 w-10 rounded-full surface-muted flex items-center justify-center interactive-tap"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-24">
              <CycleCalendar 
                cycle={cycle}
                isPartnerMode={isPartnerMode}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
