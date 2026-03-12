import React, { useCallback, useMemo, useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { AppView } from '../../core/types/clinical';
import {
  ClipboardList,
  History,
  LineChart,
  MoreHorizontal,
  Plus,
  Printer,
  RotateCcw,
  Stethoscope,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { signalFeedback } from '../../core/services/feedback';
import { playCelebrationBurst } from '../../core/services/celebration';
import { ClinicalProcessModal } from '../../features/consultation/ClinicalProcessModal';

export const BottomNav: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [menuOpen, setMenuOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);

  const feedback = useCallback(
    (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
      signalFeedback(kind, {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      }),
    [state.settings.audio_enabled, state.settings.haptics_enabled]
  );

  const setView = (view: AppView) => {
    dispatch({ type: 'CLOSE_SHEETS' });
    dispatch({ type: 'SET_VIEW', payload: view });
    setMenuOpen(false);
  };

  const navItems = [
    { id: 'consult' as AppView, icon: Stethoscope, label: 'Consult' },
    { id: 'history' as AppView, icon: History, label: 'History' },
  ];

  const hasArchives = state.archives.length > 0;
  const actionItems = useMemo(
    () => [
      {
        key: 'case-record',
        label: 'Record',
        icon: ClipboardList,
        onClick: () => {
          dispatch({ type: 'TOGGLE_HX' });
          feedback('select');
        },
      },
      {
        key: 'process',
        label: 'Process',
        icon: LineChart,
        onClick: () => {
          setProcessOpen(true);
          feedback('select');
        },
      },
      {
        key: 'print',
        label: 'Print',
        icon: Printer,
        onClick: () => {
          feedback('submit');
          window.print();
        },
      },
      {
        key: 'revisit',
        label: 'Revisit',
        icon: History,
        disabled: !hasArchives,
        onClick: () => {
          if (!hasArchives) return;
          dispatch({ type: 'RESTORE_ARCHIVE', payload: state.archives[0].id });
          dispatch({ type: 'SET_VIEW', payload: 'consult' });
          feedback('question');
        },
      },
      {
        key: 'new',
        label: 'Reset',
        icon: RotateCcw,
        onClick: () => {
          dispatch({ type: 'RESET' });
          feedback('submit');
        },
      },
    ],
    [
      dispatch,
      hasArchives,
      state.archives,
      feedback,
    ]
  );

  const primaryAction = useMemo(() => {
    if (state.view === 'history') {
      if (hasArchives) {
        return {
          label: 'Revisit Last Visit',
          icon: RotateCcw,
          onClick: () => {
            dispatch({ type: 'RESTORE_ARCHIVE', payload: state.archives[0].id });
            dispatch({ type: 'SET_VIEW', payload: 'consult' });
            feedback('question');
          },
          disabled: false,
        };
      }
      return {
        label: 'Start New Visit',
        icon: Plus,
        onClick: () => {
          dispatch({ type: 'SET_VIEW', payload: 'consult' });
          dispatch({ type: 'RESET' });
          feedback('submit');
        },
        disabled: false,
      };
    }

    if (state.status === 'idle') {
      return {
        label: 'Clinical Process',
        icon: LineChart,
        onClick: () => {
          setProcessOpen(true);
          feedback('question');
        },
        disabled: false,
      };
    }

    if (state.status === 'active' || state.status === 'intake') {
      return {
        label: 'Clinical Process',
        icon: LineChart,
        onClick: () => {
          setProcessOpen(true);
          feedback('question');
        },
        disabled: false,
      };
    }

    return {
      label: 'Reset Visit',
      icon: RotateCcw,
      onClick: () => {
        dispatch({ type: 'RESET' });
        feedback('submit');
      },
      disabled: false,
    };
  }, [dispatch, feedback, hasArchives, state.archives, state.status, state.view]);

  const triggerPrimaryAction = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (primaryAction.disabled) return;
    playCelebrationBurst({
      reducedMotion: state.settings.reduced_motion,
      intensity: 'medium',
    });
    primaryAction.onClick();
  };

  const triggerAction = (run: () => void, disabled?: boolean) => {
    if (disabled) return;
    playCelebrationBurst({
      reducedMotion: state.settings.reduced_motion,
      intensity: 'soft',
    });
    run();
    setMenuOpen(false);
  };

  const PrimaryIcon = primaryAction.icon;

  return (
    <>
      <nav className="fixed bottom-0 max-w-[440px] w-full z-40 px-2 pb-7 pointer-events-none">
        <div className="flex items-end justify-between pointer-events-auto">
          <div className="surface-raised rounded-full px-2 py-2 shadow-glass flex items-center gap-1 backdrop-blur-xl">
            {navItems.map((item) => {
              const isActive = state.view === item.id;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    feedback('select');
                    setView(item.id);
                  }}
                  whileTap={{ scale: 0.97 }}
                  className={`h-11 rounded-full flex items-center transition-all ${
                    isActive
                      ? 'px-4 gap-2 bg-surface-strong text-content-primary'
                      : 'w-11 justify-center text-content-dim hover:text-content-secondary'
                  }`}
                  aria-label={`Open ${item.id}`}
                >
                  <item.icon size={18} className={isActive ? 'text-accent-primary' : ''} />
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="text-[10px] uppercase tracking-[0.2em] font-semibold overflow-hidden whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          <div className="relative">
            {!menuOpen && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -top-9 right-0 h-7 px-3 rounded-full surface-raised text-[9px] uppercase tracking-[0.16em] text-content-secondary inline-flex items-center"
              >
                {primaryAction.label}
              </motion.span>
            )}

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  className="absolute bottom-16 right-0 w-[252px] surface-raised rounded-[28px] p-3 shadow-float"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {actionItems.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => triggerAction(item.onClick, item.disabled)}
                        disabled={item.disabled}
                        className="h-[72px] rounded-2xl surface-strong option-live option-tone-cyan text-content-primary disabled:opacity-45 flex flex-col items-center justify-center gap-1.5 focus-glow interactive-tap"
                      >
                        <span className="h-8 w-8 rounded-xl surface-chip flex items-center justify-center">
                          <item.icon size={14} />
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.16em]">
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2 justify-end">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  feedback('select');
                  setMenuOpen((prev) => !prev);
                }}
                className="h-10 w-10 rounded-full surface-raised option-live option-tone-amber text-content-dim shadow-glass flex items-center justify-center interactive-tap"
                aria-label="Open more clinical actions"
              >
                {menuOpen ? <X size={14} /> : <MoreHorizontal size={14} />}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={triggerPrimaryAction}
                className="h-14 w-14 rounded-full fab-live flex items-center justify-center"
                aria-label={menuOpen ? 'Close actions' : primaryAction.label}
              >
                {menuOpen ? <X size={18} /> : <PrimaryIcon size={18} />}
              </motion.button>
            </div>
          </div>
        </div>
      </nav>

      <ClinicalProcessModal
        isOpen={processOpen}
        onClose={() => setProcessOpen(false)}
      />
    </>
  );
};
