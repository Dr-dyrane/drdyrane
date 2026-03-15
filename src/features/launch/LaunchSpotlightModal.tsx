import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ClipboardList, Pill, Sparkles, Stethoscope, X } from 'lucide-react';
import { AppView } from '../../core/types/clinical';
import { OverlayPortal } from '../../components/shared/OverlayPortal';

interface LaunchSpotlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: AppView, action?: 'open-scanner') => void;
}

export const LaunchSpotlightModal: React.FC<LaunchSpotlightModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => (
  <OverlayPortal>
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[160] overlay-backdrop backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.4rem)] mx-auto z-[170] w-[calc(100%-1rem)] max-w-[412px] ios-sheet-surface rounded-[30px] shadow-modal p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs text-content-dim uppercase tracking-wide">Welcome</p>
                <h2 className="display-type text-2xl leading-tight text-content-primary">
                  Dr Dyrane
                </h2>
                <p className="text-sm text-content-secondary leading-relaxed">
                  Start with the fastest flow below. You can switch anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close spotlight"
                className="h-10 w-10 rounded-full surface-strong inline-flex items-center justify-center interactive-tap interactive-soft"
              >
                <X size={15} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('scan', 'open-scanner')}
              className="w-full text-left surface-raised rounded-[24px] p-4 space-y-2 interactive-tap option-live option-tone-cyan"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <span className="h-9 w-9 rounded-xl surface-chip inline-flex items-center justify-center text-accent-primary">
                    <Camera size={15} />
                  </span>
                  <p className="text-sm font-semibold text-content-primary">Featured: Scan</p>
                </div>
                <span className="h-6 px-2.5 rounded-full badge-accent text-[10px] font-semibold inline-flex items-center">
                  Ready
                </span>
              </div>
              <p className="text-xs text-content-secondary leading-relaxed">
                Spot diagnosis, differential, management, investigations, counseling, and printable plan.
              </p>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onNavigate('consult')}
                className="surface-raised rounded-[20px] p-3 space-y-2 text-left interactive-tap option-live option-tone-mint"
              >
                <div className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-xl surface-chip inline-flex items-center justify-center text-accent-primary">
                    <Stethoscope size={14} />
                  </span>
                  <span className="h-5 px-2 rounded-full bg-danger-soft text-danger-primary text-[10px] font-semibold inline-flex items-center">
                    Beta
                  </span>
                </div>
                <p className="text-sm font-semibold text-content-primary">Consult Room</p>
                <p className="text-[11px] text-content-dim leading-relaxed">Chat with Dr Dyrane step by step.</p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('drug')}
                className="surface-raised rounded-[20px] p-3 space-y-2 text-left interactive-tap option-live option-tone-amber"
              >
                <div className="h-8 w-8 rounded-xl surface-chip inline-flex items-center justify-center text-accent-primary">
                  <Pill size={14} />
                </div>
                <p className="text-sm font-semibold text-content-primary">Prescription</p>
                <p className="text-[11px] text-content-dim leading-relaxed">
                  Already diagnosed? Open treatment and print.
                </p>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('cycle')}
              className="w-full text-left surface-raised rounded-[24px] p-4 space-y-2 interactive-tap option-live option-tone-rose"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <span className="h-9 w-9 rounded-xl surface-chip inline-flex items-center justify-center text-neon-rose">
                    <Sparkles size={15} />
                  </span>
                  <p className="text-sm font-semibold text-content-primary">Cycle Scientist</p>
                </div>
                <span className="h-6 px-2.5 rounded-full badge-accent bg-neon-rose text-[10px] font-semibold inline-flex items-center">
                  Ava AI
                </span>
              </div>
              <p className="text-xs text-content-secondary leading-relaxed">
                Reproductive health OS, symptom logging, AI cycle intelligence, and fertility guidance.
              </p>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="surface-strong rounded-[18px] p-3 text-left interactive-tap"
              >
                <div className="h-7 w-7 rounded-lg surface-chip inline-flex items-center justify-center text-accent-primary mb-1.5">
                  <ClipboardList size={13} />
                </div>
                <p className="text-xs font-semibold text-content-primary">Records</p>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="surface-strong rounded-[18px] p-3 text-left interactive-tap"
              >
                <div className="h-7 w-7 rounded-lg surface-chip inline-flex items-center justify-center text-accent-primary mb-1.5">
                  <Sparkles size={13} />
                </div>
                <p className="text-xs font-semibold text-content-primary">Continue to App</p>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  </OverlayPortal>
);
