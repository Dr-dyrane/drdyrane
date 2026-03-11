import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardList, Printer, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { SessionRecord } from '../../core/types/clinical';
import { useClinical } from '../../core/context/ClinicalContext';
import { signalFeedback } from '../../core/services/feedback';

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

    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
  };

  const deleteRecord = () => {
    if (!record) return;
    const ok = window.confirm('Delete this visit record permanently?');
    if (!ok) return;
    dispatch({ type: 'DELETE_ARCHIVE', payload: record.id });
    signalFeedback('error', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    onClose();
  };

  const revisitRecord = () => {
    if (!record) return;
    dispatch({ type: 'RESTORE_ARCHIVE', payload: record.id });
    dispatch({ type: 'SET_VIEW', payload: 'consult' });
    signalFeedback('question', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
    onClose();
  };

  const printRecord = () => {
    if (!record) return;
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

  return (
    <AnimatePresence>
      {isOpen && record && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[72] bg-black/30 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 h-[88vh] z-[82] rounded-t-[36px] surface-raised shadow-[0_30px_60px_rgba(0,0,0,0.35)] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-content-dim font-semibold">Visit Record</p>
                <p className="text-sm text-content-secondary mt-1">
                  {new Date(record.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                onClick={onClose}
                className="h-10 w-10 rounded-full surface-strong flex items-center justify-center focus-glow"
                aria-label="Close visit modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-28 space-y-5">
              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Visit label</span>
                  <input
                    value={visitLabel}
                    onChange={(e) => setVisitLabel(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl surface-raised text-sm text-content-primary"
                    placeholder="e.g., Follow-up visit"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Diagnosis</span>
                  <input
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl surface-raised text-sm text-content-primary"
                    placeholder="Working diagnosis"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Record notes</span>
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
                  <span className="text-[10px] uppercase tracking-[0.22em] text-content-dim">Complaint</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-content-dim">
                    {record.status}
                  </span>
                </div>
                <p className="text-sm text-content-primary leading-relaxed">
                  {record.complaint || 'No complaint captured for this visit.'}
                </p>
              </section>

              <section className="surface-strong rounded-[24px] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-content-dim">Patient Clerking</span>
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
                      <p className="text-[10px] uppercase tracking-[0.18em] text-content-dim">{item.label}</p>
                      <p className="text-sm text-content-primary leading-relaxed">{item.value || 'Not recorded.'}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="absolute bottom-0 inset-x-0 px-4 pb-6 pt-3 bg-gradient-to-t from-black/40 to-transparent">
              <div className="surface-raised rounded-[26px] p-3 grid grid-cols-2 gap-2">
                <button
                  onClick={saveRecord}
                  disabled={!isDirty}
                  className="h-12 rounded-2xl surface-strong text-content-primary text-[10px] uppercase tracking-[0.22em] font-semibold disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Save size={14} /> Save
                  </span>
                </button>
                <button
                  onClick={revisitRecord}
                  className="h-12 rounded-2xl surface-strong text-content-primary text-[10px] uppercase tracking-[0.22em] font-semibold"
                >
                  <span className="inline-flex items-center gap-2">
                    <RotateCcw size={14} /> Revisit
                  </span>
                </button>
                <button
                  onClick={printRecord}
                  className="h-12 rounded-2xl surface-strong text-content-primary text-[10px] uppercase tracking-[0.22em] font-semibold"
                >
                  <span className="inline-flex items-center gap-2">
                    <Printer size={14} /> Print
                  </span>
                </button>
                <button
                  onClick={() => onOpenHx(record)}
                  className="h-12 rounded-2xl surface-strong text-content-primary text-[10px] uppercase tracking-[0.22em] font-semibold"
                >
                  <span className="inline-flex items-center gap-2">
                    <ClipboardList size={14} /> SOAP
                  </span>
                </button>
                <button
                  onClick={deleteRecord}
                  className="h-12 rounded-2xl bg-neon-red/85 text-white text-[10px] uppercase tracking-[0.22em] font-semibold col-span-2"
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
  );
};
