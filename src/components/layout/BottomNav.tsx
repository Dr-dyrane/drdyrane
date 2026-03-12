import React, { useCallback, useMemo, useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { AppView } from '../../core/types/clinical';
import {
  Camera,
  ClipboardList,
  History,
  LineChart,
  MoreHorizontal,
  Pill,
  Printer,
  RotateCcw,
  ScanLine,
  SendHorizontal,
  Stethoscope,
  Upload,
  X,
  Calculator,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { signalFeedback } from '../../core/services/feedback';
import { playCelebrationFromSettings } from '../../core/services/celebration';
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
  icon: ActionIcon;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

interface SmartTab {
  id: AppView;
  label: string;
  icon: ActionIcon;
}

const TAB_REGISTRY: Record<AppView, SmartTab> = {
  consult: { id: 'consult', label: 'Consult', icon: Stethoscope },
  history: { id: 'history', label: 'History', icon: History },
  drug: { id: 'drug', label: 'Rx', icon: Pill },
  scan: { id: 'scan', label: 'Scan', icon: ScanLine },
  about: { id: 'about', label: 'System', icon: LineChart },
};

const getSmartTabs = (view: AppView): SmartTab[] => {
  switch (view) {
    case 'consult':
      return [TAB_REGISTRY.consult, TAB_REGISTRY.history, TAB_REGISTRY.drug];
    case 'history':
      return [TAB_REGISTRY.consult, TAB_REGISTRY.history, TAB_REGISTRY.drug];
    case 'drug':
      return [TAB_REGISTRY.history, TAB_REGISTRY.drug, TAB_REGISTRY.scan];
    case 'scan':
      return [TAB_REGISTRY.drug, TAB_REGISTRY.scan, TAB_REGISTRY.consult];
    default:
      return [TAB_REGISTRY.consult, TAB_REGISTRY.history, TAB_REGISTRY.drug];
  }
};

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

  const emitEvent = useCallback((name: string, detail?: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }, []);

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

  const hasArchives = state.archives.length > 0;
  const hasCompletedEncounter = state.status === 'complete' && Boolean(state.pillars);
  const hasHistoryRecord = state.view === 'history' && hasArchives;
  const canExportPdf = hasCompletedEncounter || hasHistoryRecord;
  const smartTabs = useMemo(() => getSmartTabs(state.view), [state.view]);

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

  const triggerDiagnostic = useCallback(
    (action: 'open-upload' | 'open-scanner' | 'run-review' | 'send-consult') => {
      emitEvent(`drdyrane:diagnostic:${action}`, { kind: 'scan' });
      feedback(action === 'send-consult' ? 'submit' : 'select');
    },
    [emitEvent, feedback]
  );

  const actionItems = useMemo<NavAction[]>(() => {
    switch (state.view) {
      case 'consult':
        return [
          { key: 'record', label: 'Record', icon: ClipboardList, onClick: () => dispatch({ type: 'TOGGLE_HX' }) },
          { key: 'process', label: 'Process', icon: LineChart, onClick: openProcess },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !hasCompletedEncounter },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      case 'history':
        return [
          { key: 'revisit', label: 'Revisit', icon: RotateCcw, onClick: revisitLatest, disabled: !hasArchives },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !hasArchives },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      case 'drug':
        return [
          { key: 'volume', label: 'Volume', icon: Calculator, onClick: () => emitEvent('drdyrane:drug:open-calculator') },
          { key: 'pdf', label: 'PDF', icon: Printer, onClick: exportPdf, disabled: !canExportPdf },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      case 'scan':
        return [
          { key: 'upload', label: 'Upload', icon: Upload, onClick: () => triggerDiagnostic('open-upload') },
          { key: 'scan', label: 'Scan', icon: Camera, onClick: () => triggerDiagnostic('open-scanner') },
          { key: 'review', label: 'Review', icon: LineChart, onClick: () => triggerDiagnostic('run-review') },
          { key: 'send', label: 'Send', icon: SendHorizontal, onClick: () => triggerDiagnostic('send-consult') },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
      default:
        return [
          { key: 'consult', label: 'Consult', icon: Stethoscope, onClick: () => openView('consult') },
          { key: 'history', label: 'History', icon: History, onClick: () => openView('history') },
          { key: 'reset', label: 'Reset', icon: RotateCcw, onClick: resetVisit },
        ];
    }
  }, [
    canExportPdf,
    dispatch,
    emitEvent,
    exportPdf,
    hasArchives,
    hasCompletedEncounter,
    openProcess,
    openView,
    resetVisit,
    revisitLatest,
    state.view,
    triggerDiagnostic,
  ]);

  const primaryAction = useMemo<PrimaryAction>(() => {
    switch (state.view) {
      case 'consult':
        if (hasCompletedEncounter) {
          return { label: 'Export PDF', icon: Printer, onClick: exportPdf };
        }
        return { label: 'Clinical Process', icon: LineChart, onClick: openProcess };
      case 'history':
        if (hasArchives) {
          return { label: 'Revisit Last', icon: RotateCcw, onClick: revisitLatest };
        }
        return { label: 'Start Consult', icon: Stethoscope, onClick: () => openView('consult', 'submit') };
      case 'drug':
        return { label: 'Open Volume', icon: Calculator, onClick: () => emitEvent('drdyrane:drug:open-calculator') };
      case 'scan':
        return { label: 'Open Scanner', icon: Camera, onClick: () => triggerDiagnostic('open-scanner') };
      default:
        return { label: 'Consult', icon: Stethoscope, onClick: () => openView('consult') };
    }
  }, [emitEvent, exportPdf, hasArchives, hasCompletedEncounter, openProcess, openView, revisitLatest, state.view, triggerDiagnostic]);

  const triggerPrimaryAction = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (primaryAction.disabled) return;
    playCelebrationFromSettings(state.settings, {
      intensity: 'soft',
    });
    primaryAction.onClick();
  };

  const triggerAction = (action: NavAction) => {
    if (action.disabled) return;
    playCelebrationFromSettings(state.settings, {
      intensity: 'soft',
    });
    action.onClick();
    setMenuOpen(false);
  };

  const PrimaryIcon = primaryAction.icon;

  return (
    <>
      <nav className="fixed bottom-0 max-w-[440px] w-full z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pointer-events-none">
        <div className="relative flex items-end justify-between gap-2 pointer-events-auto">
          <motion.div
            layout
            className="ios-tabbar-surface rounded-full h-14 px-2 inline-flex items-center gap-1 shadow-float min-w-0"
          >
            {smartTabs.map((tab) => {
              const isActive = state.view === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => openView(tab.id)}
                  className={`relative h-10 rounded-full inline-flex items-center gap-1.5 transition-all interactive-tap tap-compact ${
                    isActive ? 'px-3.5 bg-surface-active text-content-active selected-elevation' : 'px-2.5 text-content-dim'
                  }`}
                  aria-label={`Open ${tab.label}`}
                >
                  <Icon size={16} />
                  <AnimatePresence mode="wait">
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden whitespace-nowrap text-[11px] font-semibold"
                      >
                        {tab.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </motion.div>

          <div className="relative shrink-0">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={triggerPrimaryAction}
              className="h-14 w-14 rounded-full cta-live inline-flex items-center justify-center shadow-float interactive-tap"
              aria-label={menuOpen ? 'Close actions' : primaryAction.label}
            >
              {menuOpen ? <X size={19} /> : <PrimaryIcon size={19} />}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                feedback('select');
                setMenuOpen((prev) => !prev);
              }}
              className="absolute -top-1 -left-1 h-8 w-8 rounded-full ios-tabbar-surface shadow-glass text-content-dim inline-flex items-center justify-center interactive-tap tap-compact"
              aria-label="Open contextual actions"
            >
              {menuOpen ? <X size={13} /> : <MoreHorizontal size={13} />}
            </motion.button>
          </div>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="absolute bottom-[4.95rem] right-0 w-[236px] ios-sheet-surface rounded-[24px] p-3 shadow-float"
              >
                <div className="grid grid-cols-2 gap-2">
                  {actionItems.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.key}
                        onClick={() => triggerAction(action)}
                        disabled={action.disabled}
                        className="h-[70px] rounded-2xl surface-strong option-live option-tone-cyan text-content-primary disabled:opacity-45 flex flex-col items-center justify-center gap-1.5 focus-glow interactive-tap"
                      >
                        <span className="h-8 w-8 rounded-xl surface-chip inline-flex items-center justify-center">
                          <Icon size={14} />
                        </span>
                        <span className="text-[10px] font-medium leading-none">{action.label}</span>
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
