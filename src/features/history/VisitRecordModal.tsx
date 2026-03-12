import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardList, Printer, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { SessionRecord } from '../../core/types/clinical';
import { useClinical } from '../../core/context/ClinicalContext';
import { signalFeedback } from '../../core/services/feedback';
import { OverlayPortal } from '../../components/shared/OverlayPortal';

interface VisitRecordModalProps {
  record: SessionRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenHx: (record: SessionRecord) => void;
}

const buildPrintableText = (record: SessionRecord): string => {
  const clerking = record.clerking || record.snapshot?.clerking;
  const lines = [
    `Visit: ${record.visit_label}`,
    `Date: ${new Date(record.timestamp).toLocaleString()}`,
    `Status: ${record.status}`,
    `Diagnosis: ${record.diagnosis}`,
    `Complaint: ${record.complaint || 'Not recorded'}`,
    '',
    'SOAP',
    `S: ${JSON.stringify(record.soap.S || {})}`,
    `O: ${JSON.stringify(record.soap.O || {})}`,
    `A: ${JSON.stringify(record.soap.A || {})}`,
    `P: ${JSON.stringify(record.soap.P || {})}`,
    '',
    'Patient Clerking',
    `HPC: ${clerking?.hpc || 'Not recorded'}`,
    `PMH: ${clerking?.pmh || 'Not recorded'}`,
    `DH: ${clerking?.dh || 'Not recorded'}`,
    `SH: ${clerking?.sh || 'Not recorded'}`,
    `FH: ${clerking?.fh || 'Not recorded'}`,
    '',
    'Record Notes',
    record.notes || 'None',
  ];
  return lines.join('\n');
};

export const VisitRecordModal: React.FC<VisitRecordModalProps> = ({
  record,
  isOpen,
  onClose,
  onOpenHx,
}) => {
  const { state, dispatch } = useClinical();
  const [visitLabel, setVisitLabel] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const feedback = (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
    signalFeedback(kind, {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });

  useEffect(() => {
    if (!record) return;
    setVisitLabel(record.visit_label || 'Visit');
    setDiagnosis(record.diagnosis || '');
    setNotes(record.notes || '');
  }, [record]);

  const isDirty = useMemo(() => {
    if (!record) return false;
    return (
      visitLabel.trim() !== (record.visit_label || '').trim() ||
      diagnosis.trim() !== (record.diagnosis || '').trim() ||
      notes.trim() !== (record.notes || '').trim()
    );
  }, [record, visitLabel, diagnosis, notes]);

  const saveRecord = () => {
    if (!record) return;
    const nextLabel = visitLabel.trim() || 'Visit';
    const nextDiagnosis = diagnosis.trim() || 'Unlabeled Visit';

    dispatch({
      type: 'UPSERT_ARCHIVE',
      payload: {
        ...record,
        visit_label: nextLabel,
        diagnosis: nextDiagnosis,
        notes: notes.trim(),
        pillars: record.pillars
          ? { ...record.pillars, diagnosis: nextDiagnosis }
          : record.pillars,
        snapshot: {
          ...record.snapshot,
          pillars: record.snapshot.pillars
            ? { ...record.snapshot.pillars, diagnosis: nextDiagnosis }
            : record.snapshot.pillars,
        },
      },
    });

    feedback('submit');
  };

  const deleteRecord = () => {
    if (!record) return;
    const ok = window.confirm('Delete this visit record permanently?');
    if (!ok) return;
    dispatch({ type: 'DELETE_ARCHIVE', payload: record.id });
    feedback('error');
    onClose();
  };

  const revisitRecord = () => {
    if (!record) return;
    dispatch({ type: 'RESTORE_ARCHIVE', payload: record.id });
    dispatch({ type: 'SET_VIEW', payload: 'consult' });
    feedback('question');
    onClose();
  };

  const printRecord = () => {
    if (!record) return;
    feedback('submit');
    const payload = buildPrintableText({
      ...record,
      visit_label: visitLabel.trim() || record.visit_label,
      diagnosis: diagnosis.trim() || record.diagnosis,
      notes: notes.trim(),
    });
    const printWin = window.open('', '_blank', 'noopener,noreferrer,width=760,height=900');
    if (printWin) {
      printWin.document.write(`<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; padding: 24px;">${payload}</pre>`);
      printWin.document.close();
      printWin.focus();
      printWin.print();
      printWin.close();
    } else {
      window.print();
    }
  };

  const handleClose = () => {
    feedback('select');
    onClose();
  };

  const openHxFromRecord = () => {
    if (!record) return;
    feedback('select');
    onOpenHx(record);
  };

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && record && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 z-[140] overlay-backdrop backdrop-blur-sm"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 h-[88vh] max-w-[440px] mx-auto z-[150] rounded-t-[32px] ios-sheet-surface shadow-modal flex flex-col overflow-hidden pointer-events-auto"
            >
            <div className="px-5 py-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-content-dim font-medium">Visit Record</p>
                <p className="text-sm text-content-secondary mt-1">
                  {new Date(record.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="h-10 w-10 rounded-full surface-strong flex items-center justify-center focus-glow interactive-tap interactive-soft"
                aria-label="Close visit modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-28 space-y-5">
              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs text-content-dim">Visit label</span>
                  <input
                    value={visitLabel}
                    onChange={(e) => setVisitLabel(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl surface-raised text-sm text-content-primary"
                    placeholder="e.g., Follow-up visit"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-content-dim">Diagnosis</span>
                  <input
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl surface-raised text-sm text-content-primary"
                    placeholder="Working diagnosis"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-content-dim">Record notes</span>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl surface-raised text-sm text-content-primary resize-none"
                    placeholder="Follow-up plan, context, reminders..."
                  />
                </label>
              </section>

              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-content-dim">Complaint</span>
                  <span className="text-xs text-content-dim">
                    {record.status}
                  </span>
                </div>
                <p className="text-sm text-content-primary leading-relaxed">
                  {record.complaint || 'No complaint captured for this visit.'}
                </p>
              </section>

              <section className="surface-strong rounded-[24px] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-dim">Patient Clerking</span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'HPC', value: record.clerking?.hpc || record.snapshot?.clerking?.hpc },
                    { label: 'PMH', value: record.clerking?.pmh || record.snapshot?.clerking?.pmh },
                    { label: 'DH', value: record.clerking?.dh || record.snapshot?.clerking?.dh },
                    { label: 'SH', value: record.clerking?.sh || record.snapshot?.clerking?.sh },
                    { label: 'FH', value: record.clerking?.fh || record.snapshot?.clerking?.fh },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <p className="text-xs text-content-dim">{item.label}</p>
                      <p className="text-sm text-content-primary leading-relaxed">{item.value || 'Not recorded.'}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="absolute bottom-0 inset-x-0 px-4 pb-6 pt-3 overlay-fade-bottom">
              <div className="surface-raised rounded-[26px] p-3 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={saveRecord}
                    disabled={!isDirty}
                    className="h-[64px] rounded-2xl surface-strong text-content-primary disabled:opacity-50 focus-glow interactive-tap interactive-soft"
                    aria-label="Save visit record"
                  >
                    <span className="inline-flex flex-col items-center gap-1.5">
                      <Save size={15} />
                      <span className="text-[11px]">Save</span>
                    </span>
                  </button>
                  <button
                    onClick={revisitRecord}
                    className="h-[64px] rounded-2xl surface-strong text-content-primary focus-glow interactive-tap interactive-soft"
                    aria-label="Revisit this consultation"
                  >
                    <span className="inline-flex flex-col items-center gap-1.5">
                      <RotateCcw size={15} />
                      <span className="text-[11px]">Revisit</span>
                    </span>
                  </button>
                  <button
                    onClick={printRecord}
                    className="h-[64px] rounded-2xl surface-strong text-content-primary focus-glow interactive-tap interactive-soft"
                    aria-label="Print visit record"
                  >
                    <span className="inline-flex flex-col items-center gap-1.5">
                      <Printer size={15} />
                      <span className="text-[11px]">Print</span>
                    </span>
                  </button>
                  <button
                    onClick={openHxFromRecord}
                    className="h-[64px] rounded-2xl surface-strong text-content-primary focus-glow interactive-tap interactive-soft"
                    aria-label="Open SOAP data"
                  >
                    <span className="inline-flex flex-col items-center gap-1.5">
                      <ClipboardList size={15} />
                      <span className="text-[11px]">SOAP</span>
                    </span>
                  </button>
                </div>
                <button
                  onClick={deleteRecord}
                  className="h-12 rounded-2xl cta-danger text-sm font-semibold focus-glow interactive-tap"
                >
                  <span className="inline-flex items-center gap-2">
                    <Trash2 size={14} /> Delete Visit
                  </span>
                </button>
              </div>
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

