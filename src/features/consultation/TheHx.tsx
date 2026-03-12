import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { X, ClipboardList, Activity, Target, Shield } from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { OverlayPortal } from '../../components/shared/OverlayPortal';
import { SessionRecord } from '../../core/types/clinical';

interface TheHxProps {
  isOpen: boolean;
  onClose: () => void;
  overrideState?: SessionRecord;
}

const prettyLabel = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const renderValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return 'Unavailable';
  }
};

export const TheHx: React.FC<TheHxProps> = ({ isOpen, onClose, overrideState }) => {
  const { state: liveState } = useClinical();

  const displaySoap = overrideState ? overrideState.soap : liveState.soap;
  const displayDiagnosis = overrideState
    ? overrideState.diagnosis
    : liveState.pillars?.diagnosis || 'Active Case';
  const displayDDx = overrideState ? overrideState.snapshot?.ddx || [] : liveState.ddx || [];
  const emptyClerking = { hpc: '', pmh: '', dh: '', sh: '', fh: '' };
  const displayClerking = overrideState
    ? overrideState.clerking || overrideState.snapshot?.clerking || emptyClerking
    : liveState.clerking;

  const latestEntry = liveState.conversation[liveState.conversation.length - 1];
  const latestPatientInput = [...liveState.conversation]
    .reverse()
    .find((entry) => entry.role === 'patient')?.content;
  const latestDoctorPrompt = [...liveState.conversation]
    .reverse()
    .find((entry) => entry.role === 'doctor')?.metadata?.question;

  const getElapsedLabel = (timestamp?: number): string => {
    if (!timestamp) return 'No recent updates';
    const deltaMs = Date.now() - timestamp;
    const minutes = Math.floor(deltaMs / 60_000);
    if (minutes < 1) return 'Updated just now';
    if (minutes < 60) return `Updated ${minutes}m ago`;
    return `Updated ${Math.floor(minutes / 60)}h ago`;
  };

  const soapSections = [
    { label: 'Subjective', key: 'S' as const, icon: ClipboardList },
    { label: 'Objective', key: 'O' as const, icon: Activity },
    { label: 'Assessment', key: 'A' as const, icon: Target },
    { label: 'Plan', key: 'P' as const, icon: Shield },
  ];

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
              className="fixed inset-0 overlay-backdrop backdrop-blur-sm z-[100] pointer-events-auto"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 290 }}
              className="fixed inset-x-0 bottom-0 max-w-[440px] mx-auto h-[88dvh] z-[110] pointer-events-auto"
            >
              <div className="ios-sheet-surface h-full rounded-t-[32px] shadow-modal overflow-hidden">
                <div className="flex items-center justify-center pt-2 pb-1">
                  <span className="h-1 w-11 rounded-full surface-chip" />
                </div>

                <div className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-content-dim font-medium">Clinical Record</p>
                    <h2 className="display-type text-[1.45rem] text-content-primary leading-tight mt-0.5">
                      {displayDiagnosis}
                    </h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="h-10 w-10 rounded-full surface-strong inline-flex items-center justify-center focus-glow interactive-tap"
                    aria-label="Close clinical record"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="px-4 pb-8 h-[calc(100%-5.7rem)] overflow-y-auto no-scrollbar space-y-4">
                  {!overrideState && (
                    <GlassContainer className="rounded-[20px] p-4 bg-surface-muted/85 shadow-none">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-content-dim font-medium">Live Snapshot</span>
                          <span className="text-xs text-content-dim">{getElapsedLabel(latestEntry?.timestamp)}</span>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs text-content-dim">Latest complaint</p>
                          <p className="text-sm text-content-primary leading-relaxed">
                            {latestPatientInput || 'No patient complaint captured yet.'}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs text-content-dim">Current question</p>
                          <p className="text-sm text-content-secondary leading-relaxed">
                            {latestDoctorPrompt || 'No active question yet.'}
                          </p>
                        </div>
                      </div>
                    </GlassContainer>
                  )}

                  {soapSections.map((section) => {
                    const data = displaySoap?.[section.key] || {};
                    const hasData = Object.keys(data).length > 0;

                    return (
                      <section key={section.key} className="space-y-2">
                        <div className="px-1 inline-flex items-center gap-2">
                          <section.icon size={14} className="text-accent-primary" />
                          <span className="text-xs text-content-dim font-medium">{section.label}</span>
                        </div>

                        <GlassContainer className="rounded-[20px] p-4 bg-surface-muted/82 shadow-none">
                          {!hasData ? (
                            <p className="text-sm text-content-dim">No findings recorded yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {Object.entries(data).map(([key, value]) => (
                                <div key={key} className="space-y-1">
                                  <p className="text-xs text-accent-soft">{prettyLabel(key)}</p>
                                  <p className="text-sm text-content-secondary leading-relaxed">
                                    {renderValue(value)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </GlassContainer>
                      </section>
                    );
                  })}

                  <section className="space-y-2">
                    <div className="px-1 inline-flex items-center gap-2">
                      <Shield size={14} className="text-accent-primary" />
                      <span className="text-xs text-content-dim font-medium">Clinical Notes</span>
                    </div>

                    <GlassContainer className="rounded-[20px] p-4 bg-surface-muted/82 shadow-none">
                      <div className="space-y-3">
                        {[
                          { label: 'History of present complaint', value: displayClerking.hpc },
                          { label: 'Past medical history', value: displayClerking.pmh },
                          { label: 'Drug history', value: displayClerking.dh },
                          { label: 'Social history', value: displayClerking.sh },
                          { label: 'Family history', value: displayClerking.fh },
                        ].map((section) => (
                          <div key={section.label} className="space-y-1">
                            <p className="text-xs text-content-dim">{section.label}</p>
                            <p className="text-sm text-content-secondary leading-relaxed">
                              {section.value || 'Not recorded.'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </GlassContainer>
                  </section>

                  <section className="space-y-2">
                    <div className="px-1 inline-flex items-center gap-2">
                      <Activity size={14} className="text-accent-primary" />
                      <span className="text-xs text-content-dim font-medium">Differential Diagnosis</span>
                    </div>

                    <GlassContainer className="rounded-[20px] p-4 bg-surface-muted/82 shadow-none">
                      {displayDDx.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {displayDDx.map((item, index) => (
                            <span
                              key={`${item}-${index}`}
                              className="px-3 py-1.5 rounded-full bg-accent-soft text-xs text-accent-primary font-medium"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-content-dim">Assessment in progress.</p>
                      )}
                    </GlassContainer>
                  </section>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

