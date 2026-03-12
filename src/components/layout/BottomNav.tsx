import React, { useCallback, useMemo, useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { AppView } from '../../core/types/clinical';
import {
  ClipboardList,
  FlaskConical,
  History,
  LineChart,
  MoreHorizontal,
  Pill,
  Printer,
  RotateCcw,
  ScanLine,
  Stethoscope,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { signalFeedback } from '../../core/services/feedback';
import { playCelebrationBurst } from '../../core/services/celebration';
import { ClinicalProcessModal } from '../../features/consultation/ClinicalProcessModal';

type ActionIcon = React.ComponentType<{ size?: string | number }>;

interface NavAction {
  key: string;
  label: string;
  icon: ActionIcon;
  onClick: () => void;
  disabled?: boolean;
}

interface PrimaryAction {
  label: string;
  icon: ActionIcon;
  onClick: () => void;
  disabled?: boolean;
}

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

  const setView = useCallback(
    (view: AppView) => {
      dispatch({ type: 'CLOSE_SHEETS' });
      dispatch({ type: 'SET_VIEW', payload: view });
      setMenuOpen(false);
    },
    [dispatch]
  );

  const openView = useCallback(
    (view: AppView, kind: Parameters<typeof signalFeedback>[0] = 'select') => {
      feedback(kind);
      setView(view);
    },
    [feedback, setView]
  );

  const exportPdfFromContext = useCallback(async () => {
    const { exportEncounterPdf, exportVisitRecordPdf } = await import('../../core/pdf/clinicalPdf');
    if (state.status === 'complete' && state.pillars) {
      exportEncounterPdf({
        diagnosis: state.pillars.diagnosis,
        management: state.pillars.management,
        investigations: state.pillars.encounter?.investigations || [],
        prescriptions: state.pillars.encounter?.prescriptions || [],
        counseling: state.pillars.encounter?.counseling || [],
        followUp: state.pillars.encounter?.follow_up || [],
        prognosis: state.pillars.prognosis,
        prevention: state.pillars.prevention,
        patient: {
          displayName: state.profile.display_name,
          age: state.profile.age,
          sex: state.profile.sex,
          weightKg: state.profile.weight_kg ?? null,
        },
      });
      return;
    }

    if (state.view === 'history' && state.archives.length > 0) {
      const latest = state.archives[0];
      exportVisitRecordPdf({
        visitLabel: latest.visit_label,
        status: latest.status,
        diagnosis: latest.diagnosis,
        complaint: latest.complaint || 'Not recorded',
        notes: latest.notes || 'None',
        soap: latest.soap,
        clerking: latest.clerking || latest.snapshot?.clerking,
      });
      return;
    }

    window.alert('PDF export is available after a completed consultation or from visit records.');
  }, [
    state.archives,
    state.pillars,
    state.profile.age,
    state.profile.display_name,
    state.profile.sex,
    state.profile.weight_kg,
    state.status,
    state.view,
  ]);

  const navItems = [
    { id: 'consult' as AppView, icon: Stethoscope, label: 'Consult' },
    { id: 'history' as AppView, icon: History, label: 'History' },
    { id: 'drug' as AppView, icon: Pill, label: 'Rx' },
    { id: 'lab' as AppView, icon: FlaskConical, label: 'Lab' },
    { id: 'radiology' as AppView, icon: ScanLine, label: 'Radio' },
  ];

  const hasArchives = state.archives.length > 0;
  const hasCompletedEncounter = state.status === 'complete' && Boolean(state.pillars);
  const hasHistoryRecord = state.view === 'history' && hasArchives;
  const canExportPdf = hasCompletedEncounter || hasHistoryRecord;

  const openRecord = useCallback(() => {
    dispatch({ type: 'TOGGLE_HX' });
    feedback('select');
  }, [dispatch, feedback]);

  const openProcess = useCallback(() => {
    setProcessOpen(true);
    feedback('question');
  }, [feedback]);

  const exportPdf = useCallback(() => {
    feedback('submit');
    void exportPdfFromContext();
  }, [exportPdfFromContext, feedback]);

  const revisitLatest = useCallback(() => {
    if (!hasArchives) return;
    dispatch({ type: 'RESTORE_ARCHIVE', payload: state.archives[0].id });
    dispatch({ type: 'SET_VIEW', payload: 'consult' });
    feedback('question');
  }, [dispatch, feedback, hasArchives, state.archives]);

  const resetVisit = useCallback(() => {
    dispatch({ type: 'RESET' });
    feedback('submit');
  }, [dispatch, feedback]);

  const actionItems = useMemo<NavAction[]>(() => {
    switch (state.view) {
      case 'consult':
        return [
          { key: 'record', label: 'Record', icon: ClipboardList, onClick: openRecord },
          { key: 'process', label: 'Process', icon: LineChart, onClick: openProcess },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !hasCompletedEncounter },
          { key: 'history', label: 'History', icon: History, onClick: () => openView('history') },
          { key: 'pharmacy', label: 'Pharmacy', icon: Pill, onClick: () => openView('drug') },
          { key: 'lab', label: 'Labs', icon: FlaskConical, onClick: () => openView('lab') },
          { key: 'radiology', label: 'Radiology', icon: ScanLine, onClick: () => openView('radiology') },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      case 'history':
        return [
          { key: 'revisit', label: 'Revisit', icon: RotateCcw, onClick: revisitLatest, disabled: !hasArchives },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !hasArchives },
          { key: 'consult', label: 'Consult', icon: Stethoscope, onClick: () => openView('consult') },
          { key: 'pharmacy', label: 'Pharmacy', icon: Pill, onClick: () => openView('drug') },
          { key: 'lab', label: 'Labs', icon: FlaskConical, onClick: () => openView('lab') },
          { key: 'radiology', label: 'Radiology', icon: ScanLine, onClick: () => openView('radiology') },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      case 'drug':
        return [
          { key: 'lab', label: 'Labs', icon: FlaskConical, onClick: () => openView('lab') },
          { key: 'radiology', label: 'Radiology', icon: ScanLine, onClick: () => openView('radiology') },
          { key: 'consult', label: 'Consult', icon: Stethoscope, onClick: () => openView('consult') },
          { key: 'history', label: 'History', icon: History, onClick: () => openView('history') },
          { key: 'process', label: 'Process', icon: LineChart, onClick: openProcess },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !canExportPdf },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      case 'lab':
        return [
          { key: 'radiology', label: 'Radiology', icon: ScanLine, onClick: () => openView('radiology') },
          { key: 'pharmacy', label: 'Pharmacy', icon: Pill, onClick: () => openView('drug') },
          { key: 'consult', label: 'Consult', icon: Stethoscope, onClick: () => openView('consult') },
          { key: 'history', label: 'History', icon: History, onClick: () => openView('history') },
          { key: 'process', label: 'Process', icon: LineChart, onClick: openProcess },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !canExportPdf },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      case 'radiology':
        return [
          { key: 'lab', label: 'Labs', icon: FlaskConical, onClick: () => openView('lab') },
          { key: 'pharmacy', label: 'Pharmacy', icon: Pill, onClick: () => openView('drug') },
          { key: 'consult', label: 'Consult', icon: Stethoscope, onClick: () => openView('consult') },
          { key: 'history', label: 'History', icon: History, onClick: () => openView('history') },
          { key: 'process', label: 'Process', icon: LineChart, onClick: openProcess },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !canExportPdf },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      default:
        return [
          { key: 'consult', label: 'Consult', icon: Stethoscope, onClick: () => openView('consult') },
          { key: 'history', label: 'History', icon: History, onClick: () => openView('history') },
          { key: 'pharmacy', label: 'Pharmacy', icon: Pill, onClick: () => openView('drug') },
          { key: 'lab', label: 'Labs', icon: FlaskConical, onClick: () => openView('lab') },
          { key: 'radiology', label: 'Radiology', icon: ScanLine, onClick: () => openView('radiology') },
          { key: 'process', label: 'Process', icon: LineChart, onClick: openProcess },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
    }
  }, [
    canExportPdf,
    exportPdf,
    hasArchives,
    hasCompletedEncounter,
    openProcess,
    openRecord,
    openView,
    resetVisit,
    revisitLatest,
    state.view,
  ]);

  const primaryAction = useMemo<PrimaryAction>(() => {
    switch (state.view) {
      case 'consult':
        if (hasCompletedEncounter) {
          return {
            label: 'Export PDF',
            icon: Printer,
            onClick: exportPdf,
            disabled: false,
          };
        }
        return {
          label: 'Process',
          icon: LineChart,
          onClick: openProcess,
          disabled: false,
        };
      case 'history':
        if (hasArchives) {
          return {
            label: 'Revisit',
            icon: RotateCcw,
            onClick: revisitLatest,
            disabled: false,
          };
        }
        return {
          label: 'New Consult',
          icon: Stethoscope,
          onClick: () => openView('consult', 'submit'),
          disabled: false,
        };
      case 'drug':
        return {
          label: 'Open Labs',
          icon: FlaskConical,
          onClick: () => openView('lab'),
          disabled: false,
        };
      case 'lab':
        return {
          label: 'Radiology',
          icon: ScanLine,
          onClick: () => openView('radiology'),
          disabled: false,
        };
      case 'radiology':
        return {
          label: 'Consult',
          icon: Stethoscope,
          onClick: () => openView('consult'),
          disabled: false,
        };
      default:
        return {
          label: 'Consult',
          icon: Stethoscope,
          onClick: () => openView('consult'),
          disabled: false,
        };
    }
  }, [exportPdf, hasArchives, hasCompletedEncounter, openProcess, openView, revisitLatest, state.view]);

  const triggerPrimaryAction = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (primaryAction.disabled) return;
    playCelebrationBurst({
      reducedMotion: state.settings.reduced_motion,
      intensity: 'soft',
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
  const showPrimaryLabel = !menuOpen;

  return (
    <>
      <nav className="fixed bottom-0 max-w-[440px] w-full z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pointer-events-none">
        <div className="relative pointer-events-auto">
          <div className="ios-tabbar-surface rounded-[30px] px-1.5 pt-2 pb-1.5 shadow-float">
            <div className="grid grid-cols-5 gap-1">
              {navItems.map((item) => {
                const isActive = state.view === item.id;
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.id}
                    onClick={() => openView(item.id)}
                    whileTap={{ scale: 0.96 }}
                    className={`h-[54px] rounded-[16px] inline-flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-tight interactive-tap tap-compact transition-all ${
                      isActive
                        ? 'bg-surface-active text-content-active selected-elevation'
                        : 'text-content-dim hover:text-content-secondary'
                    }`}
                    aria-label={`Open ${item.label}`}
                  >
                    <Icon size={17} className={isActive ? 'text-content-active' : ''} />
                    <span className="leading-none">{item.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="absolute -top-[3.15rem] right-0 flex items-center gap-2 pointer-events-auto">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                feedback('select');
                setMenuOpen((prev) => !prev);
              }}
              className="h-11 w-11 rounded-full surface-raised text-content-dim shadow-glass flex items-center justify-center interactive-tap"
              aria-label="Open contextual actions"
            >
              {menuOpen ? <X size={15} /> : <MoreHorizontal size={15} />}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={triggerPrimaryAction}
              className={`h-11 rounded-2xl cta-live inline-flex items-center justify-center gap-1.5 text-xs font-semibold ${
                showPrimaryLabel ? 'px-4' : 'w-11'
              }`}
              aria-label={menuOpen ? 'Close actions' : primaryAction.label}
            >
              {menuOpen ? <X size={16} /> : <PrimaryIcon size={16} />}
              {showPrimaryLabel && <span className="max-w-[102px] truncate">{primaryAction.label}</span>}
            </motion.button>
          </div>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="absolute bottom-[5.7rem] right-0 w-[292px] ios-sheet-surface rounded-[24px] p-3 shadow-float"
              >
                <div className="grid grid-cols-3 gap-2">
                  {actionItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => triggerAction(item.onClick, item.disabled)}
                        disabled={item.disabled}
                        className="h-[72px] rounded-2xl surface-strong option-live option-tone-cyan text-content-primary disabled:opacity-45 flex flex-col items-center justify-center gap-1.5 focus-glow interactive-tap"
                      >
                        <span className="h-8 w-8 rounded-xl surface-chip flex items-center justify-center">
                          <Icon size={14} />
                        </span>
                        <span className="text-[10px] font-medium leading-none">{item.label}</span>
                      </button>
                    );
                  })}
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
