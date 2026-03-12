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
  const showPrimaryLabel =
    !menuOpen && state.status !== 'idle' && state.status !== 'intake';

  return (
    <>
      <nav className="fixed bottom-0 max-w-[440px] w-full z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pointer-events-none">
        <div className="relative pointer-events-auto">
          <div className="ios-tabbar-surface rounded-[30px] p-2.5 shadow-float flex items-center justify-between gap-2">
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
                  className={`h-11 rounded-2xl flex items-center transition-all ${
                    isActive
                      ? 'flex-1 px-4 gap-2 bg-content-primary/12 text-content-primary'
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
                        className="text-xs font-semibold overflow-hidden whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                feedback('select');
                setMenuOpen((prev) => !prev);
              }}
              className="h-10 w-10 rounded-full surface-raised text-content-dim shadow-glass flex items-center justify-center interactive-tap"
              aria-label="Open more clinical actions"
            >
              {menuOpen ? <X size={15} /> : <MoreHorizontal size={15} />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={triggerPrimaryAction}
              className={`h-12 rounded-2xl fab-live inline-flex items-center justify-center gap-2 text-sm font-semibold ${
                showPrimaryLabel ? 'px-4' : 'w-12'
              }`}
              aria-label={menuOpen ? 'Close actions' : primaryAction.label}
            >
              {menuOpen ? <X size={17} /> : <PrimaryIcon size={17} />}
              {showPrimaryLabel && <span className="max-w-[96px] truncate text-xs">{primaryAction.label}</span>}
            </motion.button>
          </div>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="absolute bottom-[4.7rem] right-0 w-[260px] ios-sheet-surface rounded-[24px] p-3 shadow-float"
              >
                <div className="grid grid-cols-3 gap-2">
                  {actionItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => triggerAction(item.onClick, item.disabled)}
                      disabled={item.disabled}
                      className="h-[74px] rounded-2xl surface-strong option-live option-tone-cyan text-content-primary disabled:opacity-45 flex flex-col items-center justify-center gap-1.5 focus-glow interactive-tap"
                    >
                      <span className="h-8 w-8 rounded-xl surface-chip flex items-center justify-center">
                        <item.icon size={14} />
                      </span>
                      <span className="text-[11px] font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      <ClinicalProcessModal
        isOpen={processOpen}
        onClose={() => setProcessOpen(false)}
      />
    </>
  );
};

