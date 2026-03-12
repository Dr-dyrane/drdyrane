import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Activity, AlertTriangle, Gauge, ListChecks, X } from 'lucide-react';
import { OverlayPortal } from '../../components/shared/OverlayPortal';
import { normalizePercentage } from '../../core/api/agent/clinicalMath';

interface ClinicalProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PHASE_ORDER = ['intake', 'assessment', 'differential', 'resolution', 'followup'] as const;

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

const roleMeta = (role: 'doctor' | 'patient' | 'system') => {
  if (role === 'doctor') {
    return { label: 'Dr Dyrane', tone: 'option-tone-cyan' };
  }
  if (role === 'patient') {
    return { label: 'Patient', tone: 'option-tone-mint' };
  }
  return { label: 'System', tone: 'option-tone-amber' };
};

const urgencyTone = (urgency: 'low' | 'medium' | 'high' | 'critical') => {
  if (urgency === 'critical') {
    return {
      label: 'Critical',
      className: 'bg-danger-soft text-danger-primary',
      iconClassName: 'text-danger-primary',
    };
  }
  if (urgency === 'high') {
    return {
      label: 'High',
      className: 'bg-danger-soft text-danger-primary',
      iconClassName: 'text-danger-primary',
    };
  }
  if (urgency === 'medium') {
    return {
      label: 'Moderate',
      className: 'bg-accent-soft text-accent-primary',
      iconClassName: 'text-accent-primary',
    };
  }
  return {
    label: 'Low',
    className: 'surface-chip text-content-secondary',
    iconClassName: 'text-content-secondary',
  };
};

export const ClinicalProcessModal: React.FC<ClinicalProcessModalProps> = ({ isOpen, onClose }) => {
  const { state } = useClinical();
  const timeline = state.conversation.slice(-12);
  const confidence = normalizePercentage(
    state.probability || state.agent_state.confidence || 0,
    0
  );
  const currentPhaseIndex = Math.max(PHASE_ORDER.indexOf(state.agent_state.phase), 0);
  const phaseProgress = Math.round(((currentPhaseIndex + 1) / PHASE_ORDER.length) * 100);
  const urgency = urgencyTone(state.urgency);

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
              className="fixed inset-0 z-[140] overlay-backdrop backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 290 }}
              className="fixed inset-x-0 bottom-0 max-w-[440px] mx-auto z-[150] rounded-t-[32px] ios-sheet-surface shadow-modal pointer-events-auto"
            >
              <div className="flex items-center justify-center pt-2 pb-1">
                <span className="h-1 w-11 rounded-full surface-chip" />
              </div>

              <div className="px-5 py-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-content-dim font-medium">Clinical Process</p>
                  <p className="text-sm text-content-secondary">Current consult trajectory</p>
                </div>
                <button
                  onClick={onClose}
                  className="h-10 w-10 rounded-full surface-strong flex items-center justify-center interactive-tap interactive-soft"
                  aria-label="Close clinical process modal"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="px-5 pb-7 max-h-[75vh] overflow-y-auto no-scrollbar space-y-4">
                <section className="sticky top-0 z-20 pt-1 pb-2">
                  <div className="surface-raised rounded-[24px] p-4 shadow-float space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Activity size={15} className="text-accent-primary" />
                        <span className="text-xs text-content-dim">Active Stage</span>
                      </div>
                      <span className={`h-8 px-3 rounded-full inline-flex items-center text-xs font-semibold ${urgency.className}`}>
                        <AlertTriangle size={12} className={`mr-1.5 ${urgency.iconClassName}`} />
                        {urgency.label}
                      </span>
                    </div>

                    <div>
                      <p className="text-lg text-content-primary display-type leading-tight">
                        {phaseLabel(state.agent_state.phase)}
                      </p>
                      <p className="text-sm text-content-secondary mt-1 leading-relaxed">
                        {state.agent_state.focus_area || 'Gathering clinical detail for tighter differential.'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-content-dim">
                        <span>Trajectory</span>
                        <span>{phaseProgress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${phaseProgress}%` }}
                          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                          className="h-full bg-surface-active"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="surface-strong rounded-[24px] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Gauge size={15} className="text-accent-primary" />
                    <span className="text-xs text-content-dim">Diagnostic Confidence</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${confidence}%` }}
                      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                      className="h-full bg-surface-active"
                    />
                  </div>
                  <p className="text-sm text-content-primary">{confidence}% confidence in current direction</p>
                </section>

                <section className="surface-strong rounded-[24px] p-4 space-y-3">
                  <p className="text-xs text-content-dim">Phase Sequence</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PHASE_ORDER.map((phase, index) => {
                      const isDone = index < currentPhaseIndex;
                      const isCurrent = index === currentPhaseIndex;
                      return (
                        <div
                          key={phase}
                          className={`h-10 rounded-xl px-2 inline-flex items-center justify-center text-[11px] font-medium transition-all ${
                            isCurrent
                              ? 'option-live-selected text-content-active'
                              : isDone
                                ? 'surface-chip-strong text-content-primary'
                                : 'surface-chip text-content-dim'
                          }`}
                        >
                          {phaseLabel(phase)}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="surface-strong rounded-[24px] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ListChecks size={15} className="text-accent-primary" />
                    <span className="text-xs text-content-dim">Focused Next Actions</span>
                  </div>
                  {state.agent_state.pending_actions.length === 0 ? (
                    <p className="text-sm text-content-dim">No pending actions. Ready to continue progression.</p>
                  ) : (
                    <div className="space-y-2">
                      {state.agent_state.pending_actions.map((action, index) => (
                        <motion.div
                          key={`${action}-${index}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03, duration: 0.24 }}
                          className="surface-raised rounded-2xl px-3 py-2.5"
                        >
                          <p className="text-sm text-content-primary leading-relaxed">{action}</p>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="surface-strong rounded-[24px] p-4 space-y-3">
                  <p className="text-xs text-content-dim">Recent Clinical Exchange</p>
                  {timeline.length === 0 ? (
                    <p className="text-sm text-content-dim">No clinical exchange yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {timeline.map((entry, index) => {
                        const meta = roleMeta(entry.role);
                        return (
                          <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.02, duration: 0.22 }}
                            className={`rounded-2xl p-3.5 ${meta.tone}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs text-content-dim">{meta.label}</p>
                              <p className="text-[11px] text-content-dim">
                                {new Date(entry.timestamp).toLocaleTimeString([], {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <p className="text-sm text-content-primary mt-1.5 leading-relaxed">
                              {entry.content}
                            </p>
                          </motion.div>
                        );
                      })}
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

