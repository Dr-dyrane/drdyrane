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

const clerkingFields = [
  { key: 'hpc', label: 'HPC' },
  { key: 'pmh', label: 'PMH' },
  { key: 'dh', label: 'DH' },
  { key: 'sh', label: 'SH' },
  { key: 'fh', label: 'FH' },
] as const;
const MODAL_HANDOFF_MS = 240;

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
  const timestampLabel = useMemo(
    () => (record ? new Date(record.timestamp).toLocaleString() : ''),
    [record]
  );

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
    onClose();
    window.setTimeout(() => {
      onOpenHx(record);
    }, MODAL_HANDOFF_MS);
  };

  const statusLabel = record
    ? record.status.charAt(0).toUpperCase() + record.status.slice(1)
    : 'Archived';

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
              <div className="flex items-center justify-center pt-2 pb-1">
                <span className="h-1 w-11 rounded-full surface-chip" />
              </div>

              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-content-dim font-medium">Visit Record</p>
                  <p className="text-sm text-content-secondary">{timestampLabel}</p>
                </div>
                <button
                  onClick={handleClose}
                  className="h-10 w-10 rounded-full surface-strong flex items-center justify-center focus-glow interactive-tap interactive-soft"
                  aria-label="Close visit modal"
                >
                  <X size={16} />
                </button>
              </div>

              <motion.div
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
                }}
                className="flex-1 overflow-y-auto no-scrollbar px-5 pb-7 space-y-4"
              >
                <motion.section
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  className="surface-raised rounded-[24px] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-content-dim">Visit Label</p>
                      <p className="text-lg text-content-primary display-type leading-tight mt-1">
                        {visitLabel.trim() || record.visit_label || 'Visit'}
                      </p>
                    </div>
                    <span className="h-8 px-3 rounded-full inline-flex items-center text-xs font-semibold bg-accent-soft text-accent-primary">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-sm text-content-primary leading-relaxed">
                    {diagnosis.trim() || record.diagnosis || 'Unlabeled Visit'}
                  </p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={isDirty ? 'dirty' : 'saved'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className={`text-xs ${isDirty ? 'text-accent-primary' : 'text-content-dim'}`}
                    >
                      {isDirty ? 'Unsaved edits' : 'All changes saved'}
                    </motion.p>
                  </AnimatePresence>
                </motion.section>

                <motion.section
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  className="surface-strong rounded-[24px] p-4 space-y-3"
                >
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
                </motion.section>

                <motion.section
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  className="surface-strong rounded-[24px] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-content-dim">Chief Complaint</span>
                    <span className="text-xs text-content-dim">{statusLabel}</span>
                  </div>
                  <p className="text-sm text-content-primary leading-relaxed">
                    {record.complaint || 'No complaint captured for this visit.'}
                  </p>
                </motion.section>

                <motion.section
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  className="surface-strong rounded-[24px] p-4 space-y-3"
                >
                  <span className="text-xs text-content-dim">Patient Clerking</span>
                  <div className="space-y-2">
                    {clerkingFields.map((item) => {
                      const current = record.clerking?.[item.key] || record.snapshot?.clerking?.[item.key];
                      return (
                        <div key={item.key} className="surface-raised rounded-2xl px-3 py-2.5">
                          <p className="text-[11px] text-content-dim">{item.label}</p>
                          <p className="text-sm text-content-primary mt-1 leading-relaxed">
                            {current || 'Not recorded.'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </motion.section>

                <motion.section
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  className="surface-raised rounded-[24px] p-3.5 space-y-2.5"
                >
                  <button
                    onClick={saveRecord}
                    disabled={!isDirty}
                    className={`h-12 w-full rounded-2xl px-4 text-sm font-semibold focus-glow interactive-tap ${
                      isDirty ? 'cta-live' : 'surface-strong text-content-dim'
                    }`}
                    aria-label="Save visit record"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Save size={14} />
                      {isDirty ? 'Save Updates' : 'Saved'}
                    </span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={revisitRecord}
                      className="h-[62px] rounded-2xl surface-strong text-content-primary focus-glow interactive-tap interactive-soft"
                      aria-label="Revisit this consultation"
                    >
                      <span className="inline-flex flex-col items-center gap-1.5">
                        <RotateCcw size={15} />
                        <span className="text-[11px]">Revisit</span>
                      </span>
                    </button>
                    <button
                      onClick={printRecord}
                      className="h-[62px] rounded-2xl surface-strong text-content-primary focus-glow interactive-tap interactive-soft"
                      aria-label="Print visit record"
                    >
                      <span className="inline-flex flex-col items-center gap-1.5">
                        <Printer size={15} />
                        <span className="text-[11px]">Print</span>
                      </span>
                    </button>
                    <button
                      onClick={openHxFromRecord}
                      className="h-[62px] rounded-2xl surface-strong text-content-primary focus-glow interactive-tap interactive-soft"
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
                    className="h-12 w-full rounded-2xl px-4 cta-danger text-sm font-semibold focus-glow interactive-tap"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Trash2 size={14} /> Delete Visit
                    </span>
                  </button>
                </motion.section>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

