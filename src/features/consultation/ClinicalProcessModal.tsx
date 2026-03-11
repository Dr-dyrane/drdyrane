import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Activity, AlertTriangle, Gauge, ListChecks, X } from 'lucide-react';
import { OverlayPortal } from '../../components/shared/OverlayPortal';

interface ClinicalProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const phaseLabel = (phase: string): string => {
  switch (phase) {
    case 'intake':
      return 'Intake';
    case 'assessment':
      return 'Assessment';
    case 'differential':
      return 'Differential';
    case 'resolution':
      return 'Resolution';
    case 'followup':
      return 'Follow-Up';
    default:
      return phase;
  }
};

export const ClinicalProcessModal: React.FC<ClinicalProcessModalProps> = ({ isOpen, onClose }) => {
  const { state } = useClinical();
  const timeline = state.conversation.slice(-10);
  const confidence = Math.max(0, Math.min(100, state.probability || state.agent_state.confidence || 0));

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[140] overlay-backdrop backdrop-blur-md"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 290 }}
              className="fixed inset-x-0 bottom-0 max-w-[440px] mx-auto z-[150] rounded-t-[34px] surface-raised shadow-modal pointer-events-auto"
            >
            <div className="px-5 py-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.24em] text-content-dim font-semibold">Clinical Process</p>
                <p className="text-sm text-content-secondary">Current consult trajectory</p>
              </div>
              <button onClick={onClose} className="h-10 w-10 rounded-full surface-strong flex items-center justify-center" aria-label="Close clinical process modal">
                <X size={15} />
              </button>
            </div>

            <div className="px-5 pb-6 max-h-[75vh] overflow-y-auto no-scrollbar space-y-4">
              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Activity size={15} className="text-neon-cyan" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Stage</span>
                </div>
                <p className="text-lg text-content-primary display-type">{phaseLabel(state.agent_state.phase)}</p>
                <p className="text-sm text-content-secondary">{state.agent_state.focus_area}</p>
              </section>

              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Gauge size={15} className="text-neon-cyan" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Confidence</span>
                </div>
                <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${confidence}%` }}
                    className="h-full bg-surface-active"
                  />
                </div>
                <p className="text-sm text-content-primary">{confidence}% diagnostic confidence</p>
              </section>

              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ListChecks size={15} className="text-neon-cyan" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Pending Actions</span>
                </div>
                {state.agent_state.pending_actions.length === 0 ? (
                  <p className="text-sm text-content-dim">No pending actions.</p>
                ) : (
                  <div className="space-y-2">
                    {state.agent_state.pending_actions.map((action, index) => (
                      <p key={`${action}-${index}`} className="text-sm text-content-primary leading-relaxed">
                        {action}
                      </p>
                    ))}
                  </div>
                )}
              </section>

              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className={state.urgency === 'high' || state.urgency === 'critical' ? 'text-neon-red' : 'text-neon-cyan'} />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Urgency</span>
                </div>
                <p className={`text-sm ${state.urgency === 'high' || state.urgency === 'critical' ? 'text-neon-red' : 'text-content-primary'}`}>
                  {state.urgency.toUpperCase()}
                </p>
              </section>

              <section className="surface-strong rounded-[24px] p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Timeline</p>
                {timeline.length === 0 ? (
                  <p className="text-sm text-content-dim">No clinical exchange yet.</p>
                ) : (
                  <div className="space-y-2">
                    {timeline.map((entry) => (
                      <div key={entry.id} className="surface-raised rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-content-dim">
                          {entry.role === 'doctor' ? 'Dr Dyrane' : entry.role === 'patient' ? 'Patient' : 'System'}
                        </p>
                        <p className="text-sm text-content-primary mt-1 leading-relaxed">{entry.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};
