import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { X, ClipboardList, Activity, Target, Shield } from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { OverlayPortal } from '../../components/shared/OverlayPortal';

import { SessionRecord } from '../../core/types/clinical';

export const TheHx: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void;
  overrideState?: SessionRecord; // Optional past session data
}> = ({ isOpen, onClose, overrideState }) => {
  const { state: liveState } = useClinical();

  // Use override state if provided (for history), otherwise use live state
  const displaySoap = overrideState ? overrideState.soap : liveState.soap;
  const displayDiagnosis = overrideState ? overrideState.diagnosis : (liveState.pillars?.diagnosis || 'Active Case');
  const displayDDx = overrideState ? (overrideState.snapshot?.ddx || []) : (liveState.ddx || []);
  const emptyClerking = { hpc: '', pmh: '', dh: '', sh: '', fh: '' };
  const displayClerking = overrideState
    ? (overrideState.clerking || overrideState.snapshot?.clerking || emptyClerking)
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
    const minutes = Math.floor(deltaMs / 60000);
    if (minutes < 1) return 'Updated just now';
    if (minutes < 60) return `Updated ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `Updated ${hours}h ago`;
  };

  const soapSections = [
    { label: 'Subjective', key: 'S' as const, icon: ClipboardList, color: 'text-accent-primary' },
    { label: 'Objective', key: 'O' as const, icon: Activity, color: 'text-accent-primary' },
    { label: 'Assessment', key: 'A' as const, icon: Target, color: 'text-accent-primary' },
    { label: 'Plan', key: 'P' as const, icon: Shield, color: 'text-accent-primary' },
  ];

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 overlay-backdrop backdrop-blur-md z-[100] pointer-events-auto"
            />

            {/* Hx Drawer */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 h-[85vh] bg-surface-primary rounded-t-[40px] z-[110] flex flex-col overflow-hidden glass-panel pointer-events-auto"
            >
            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-content-dim uppercase tracking-[0.3em] font-bold">Clinical Records</span>
                <h2 className="text-2xl font-light text-content-primary mt-1">{displayDiagnosis}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-3 bg-surface-muted rounded-full hover:bg-surface-muted/80 transition-colors border-none outline-none"
              >
                <X size={20} className="text-content-dim" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 no-scrollbar pb-12">
              {!overrideState && (
                <GlassContainer className="p-5 rounded-[24px] border-none shadow-none bg-surface-muted/80">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.22em] text-accent-soft font-semibold">
                        Active Case Snapshot
                      </span>
                      <span className="text-[10px] text-content-dim">{getElapsedLabel(latestEntry?.timestamp)}</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-content-dim">Latest complaint</p>
                      <p className="text-sm text-content-primary font-light leading-relaxed">
                        {latestPatientInput || 'No patient complaint captured yet.'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-content-dim">Current clinical question</p>
                      <p className="text-sm text-content-secondary font-light leading-relaxed">
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
                  <div key={section.key} className="space-y-3">
                    <div className="flex items-center gap-2 px-2">
                      <section.icon size={14} className={`${section.color} opacity-60`} />
                      <span className="text-[10px] uppercase tracking-widest font-bold text-content-dim">
                        {section.label}
                      </span>
                    </div>

                    <GlassContainer className="p-5 rounded-[24px] border-none shadow-none">
                      {!hasData ? (
                        <p className="text-xs text-content-dim font-light italic">No findings recorded yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(data).map(([key, value]) => (
                            <div key={key} className="space-y-1">
                              <span className="text-[9px] uppercase tracking-wider text-accent-soft font-medium">{key}</span>
                              <p className="text-sm text-content-secondary font-light leading-relaxed">
                                {typeof value === 'string' ? value : JSON.stringify(value)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassContainer>
                  </div>
                );
              })}

              {/* Differential Diagnosis (Live Only) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-2">
                  <Shield size={14} className="text-accent-primary opacity-80" />
                  <span className="text-[10px] uppercase tracking-widest font-bold text-content-dim">
                    Clinical Notes (Auto)
                  </span>
                </div>
                <GlassContainer className="p-5 rounded-[24px] border-none shadow-none">
                  <div className="space-y-3">
                    {[
                      { label: 'HPC', value: displayClerking.hpc },
                      { label: 'PMH', value: displayClerking.pmh },
                      { label: 'DH', value: displayClerking.dh },
                      { label: 'SH', value: displayClerking.sh },
                      { label: 'FH', value: displayClerking.fh },
                    ].map((section) => (
                      <div key={section.label} className="space-y-1">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-content-dim">{section.label}</p>
                        <p className="text-sm text-content-secondary font-light leading-relaxed">
                          {section.value || 'Not recorded.'}
                        </p>
                      </div>
                    ))}
                  </div>
                </GlassContainer>
              </div>

              {(!overrideState || displayDDx.length > 0) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-2">
                    <Activity size={14} className="text-accent-primary opacity-80" />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-content-dim">
                      Differential Diagnosis (DDx)
                    </span>
                  </div>
                  <GlassContainer className="p-5 rounded-[24px] border-none shadow-none">
                    {displayDDx.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {displayDDx.map((item: string, i: number) => (
                          <span key={i} className="px-3 py-1 bg-accent-soft rounded-full text-[10px] text-accent-primary font-bold tracking-wide">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-content-dim font-light italic">Assessment in progress...</p>
                    )}
                  </GlassContainer>
                </div>
              )}
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};
