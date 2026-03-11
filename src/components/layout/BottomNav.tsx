import React, { useMemo, useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { AppView } from '../../core/types/clinical';
import {
  ClipboardList,
  FilePenLine,
  History,
  LineChart,
  Plus,
  Printer,
  RotateCcw,
  Stethoscope,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { signalFeedback } from '../../core/services/feedback';
import { ClinicalProcessModal } from '../../features/consultation/ClinicalProcessModal';

export const BottomNav: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [menuOpen, setMenuOpen] = useState(false);
  const [clerkingOpen, setClerkingOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [clerkingDraft, setClerkingDraft] = useState({
    hpc: '',
    pmh: '',
    dh: '',
    sh: '',
    fh: '',
  });

  const feedback = (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
    signalFeedback(kind, {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });

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
        label: 'Case Record',
        icon: ClipboardList,
        onClick: () => {
          dispatch({ type: 'TOGGLE_HX' });
          feedback('select');
        },
      },
      {
        key: 'clerking',
        label: 'Patient Clerking',
        icon: FilePenLine,
        onClick: () => {
          setClerkingDraft({
            hpc: state.clerking.hpc || '',
            pmh: state.clerking.pmh || '',
            dh: state.clerking.dh || '',
            sh: state.clerking.sh || '',
            fh: state.clerking.fh || '',
          });
          setClerkingOpen(true);
          feedback('select');
        },
      },
      {
        key: 'process',
        label: 'Clinical Process',
        icon: LineChart,
        onClick: () => {
          setProcessOpen(true);
          feedback('select');
        },
      },
      {
        key: 'print',
        label: 'Print Record',
        icon: Printer,
        onClick: () => {
          feedback('submit');
          window.print();
        },
      },
      {
        key: 'revisit',
        label: 'Revisit Last Visit',
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
        label: 'New Visit',
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
      state.clerking.dh,
      state.clerking.fh,
      state.clerking.hpc,
      state.clerking.pmh,
      state.clerking.sh,
      state.settings.audio_enabled,
      state.settings.haptics_enabled,
    ]
  );

  const commitClerking = () => {
    const payload = {
      hpc: clerkingDraft.hpc.trim(),
      pmh: clerkingDraft.pmh.trim(),
      dh: clerkingDraft.dh.trim(),
      sh: clerkingDraft.sh.trim(),
      fh: clerkingDraft.fh.trim(),
    };

    if (!Object.values(payload).some(Boolean)) return;
    dispatch({ type: 'UPDATE_CLERKING', payload });
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        title: 'Clerking Updated',
        body: 'Structured clerking sections were updated for the active case.',
      },
    });
    setClerkingDraft({ hpc: '', pmh: '', dh: '', sh: '', fh: '' });
    setClerkingOpen(false);
    setMenuOpen(false);
    feedback('submit');
  };

  const triggerAction = (run: () => void, disabled?: boolean) => {
    if (disabled) return;
    run();
    setMenuOpen(false);
  };

  const closeComposer = () => {
    setClerkingOpen(false);
    setClerkingDraft({ hpc: '', pmh: '', dh: '', sh: '', fh: '' });
  };

  return (
    <>
      <nav className="fixed bottom-0 max-w-[440px] w-full z-50 px-6 pb-7 pointer-events-none">
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
                  <item.icon size={18} className={isActive ? 'text-neon-cyan' : ''} />
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
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  className="absolute bottom-16 right-0 w-[220px] surface-raised rounded-[24px] p-2 shadow-[0_24px_42px_rgba(0,0,0,0.35)]"
                >
                  <div className="space-y-1">
                    {actionItems.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => triggerAction(item.onClick, item.disabled)}
                        disabled={item.disabled}
                        className="w-full h-11 rounded-xl surface-strong text-left px-3 text-[10px] uppercase tracking-[0.18em] text-content-primary disabled:opacity-45"
                      >
                        <span className="inline-flex items-center gap-2">
                          <item.icon size={13} />
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                feedback('select');
                setMenuOpen((prev) => !prev);
              }}
              className="h-14 w-14 rounded-full bg-neon-cyan text-black shadow-[0_20px_45px_rgba(0,245,255,0.34)] flex items-center justify-center"
              aria-label="Open clinical actions"
            >
              {menuOpen ? <X size={18} /> : <Plus size={18} />}
            </motion.button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {clerkingOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeComposer}
              className="fixed inset-0 z-[85] bg-black/24 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-x-0 bottom-0 max-w-[440px] mx-auto z-[90] px-4 pb-6"
            >
              <div className="surface-raised rounded-[30px] p-4 shadow-[0_24px_48px_rgba(0,0,0,0.35)] space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-content-dim font-semibold">
                    Patient Clerking
                  </p>
                  <button onClick={closeComposer} className="h-9 w-9 rounded-full surface-strong flex items-center justify-center">
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  {[
                    { key: 'hpc', label: 'HPC', placeholder: 'History of presenting complaint' },
                    { key: 'pmh', label: 'PMH', placeholder: 'Past medical history' },
                    { key: 'dh', label: 'DH', placeholder: 'Drug history' },
                    { key: 'sh', label: 'SH', placeholder: 'Social history' },
                    { key: 'fh', label: 'FH', placeholder: 'Family history' },
                  ].map((field) => (
                    <label key={field.key} className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-content-dim">{field.label}</span>
                      <textarea
                        rows={2}
                        value={clerkingDraft[field.key as keyof typeof clerkingDraft]}
                        onChange={(e) =>
                          setClerkingDraft((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        className="w-full rounded-xl surface-strong p-3 text-sm text-content-primary resize-none"
                      />
                    </label>
                  ))}
                </div>
                <button
                  onClick={commitClerking}
                  disabled={!Object.values(clerkingDraft).some((value) => value.trim())}
                  className="w-full h-12 rounded-2xl bg-surface-active text-content-active text-[10px] uppercase tracking-[0.24em] font-semibold disabled:opacity-45"
                >
                  Save Clerking
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ClinicalProcessModal
        isOpen={processOpen}
        onClose={() => setProcessOpen(false)}
      />
    </>
  );
};
