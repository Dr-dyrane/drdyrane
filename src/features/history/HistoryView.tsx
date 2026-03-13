import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { GlassContainer } from '../../components/shared/GlassContainer';
import {
  Calendar,
  AlertCircle,
  CheckCircle,
  ChevronRight,
} from 'lucide-react';
import { TheHx } from '../consultation/TheHx';
import { SessionRecord } from '../../core/types/clinical';
import { VisitRecordModal } from './VisitRecordModal';
import { signalFeedback } from '../../core/services/feedback';

export const HistoryView: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [soapSession, setSoapSession] = useState<SessionRecord | null>(null);
  const [recordModal, setRecordModal] = useState<SessionRecord | null>(null);
  const orderedArchives = useMemo(
    () =>
      [...(state.archives || [])].sort(
        (a, b) => (b.updated_at || b.timestamp) - (a.updated_at || a.timestamp)
      ),
    [state.archives]
  );

  const feedback = useCallback(
    (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
      signalFeedback(kind, {
        hapticsEnabled: state.settings.haptics_enabled,
        audioEnabled: state.settings.audio_enabled,
      }),
    [state.settings.audio_enabled, state.settings.haptics_enabled]
  );

  const openRecord = (session: SessionRecord) => {
    setRecordModal(session);
    feedback('select');
  };

  const openSoap = (session: SessionRecord) => {
    setSoapSession(session);
    feedback('select');
  };

  const createManualRecord = useCallback(() => {
    const now = Date.now();
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      timestamp: now,
      updated_at: now,
      source: 'manual',
      visit_label: `Manual ${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      diagnosis: 'Draft Visit',
      complaint: '',
      notes: '',
      status: 'active',
      soap: state.soap,
      pillars: state.pillars || undefined,
      profile_snapshot: state.profile,
      clerking: { ...state.clerking },
      diagnostic_reviews: [...state.diagnostic_reviews],
      snapshot: {
        soap: state.soap,
        ddx: [...state.ddx],
        status: state.status,
        redFlag: state.redFlag,
        pillars: state.pillars,
        conversation: [...state.conversation],
        agent_state: { ...state.agent_state },
        probability: state.probability,
        urgency: state.urgency,
        thinking: state.thinking,
        clerking: { ...state.clerking },
        diagnostic_reviews: [...state.diagnostic_reviews],
      },
    };
    dispatch({ type: 'UPSERT_ARCHIVE', payload: record });
    setRecordModal(record);
    feedback('submit');
  }, [
    dispatch,
    feedback,
    state.agent_state,
    state.clerking,
    state.conversation,
    state.ddx,
    state.diagnostic_reviews,
    state.pillars,
    state.probability,
    state.profile,
    state.redFlag,
    state.soap,
    state.status,
    state.thinking,
    state.urgency,
  ]);

  useEffect(() => {
    const handleCreateRecord = () => {
      createManualRecord();
    };
    window.addEventListener('drdyrane:history:create-record', handleCreateRecord);
    return () => {
      window.removeEventListener('drdyrane:history:create-record', handleCreateRecord);
    };
  }, [createManualRecord]);

  return (
    <div className="flex-1 w-full min-w-0 overflow-x-hidden py-4 space-y-4 animate-emergence">
      <div className="space-y-4 pb-24">
        {orderedArchives.length === 0 ? (
          <div className="text-center py-20 text-content-dim font-light space-y-4">
            <Calendar className="w-12 h-12 mx-auto stroke-1 opacity-20" />
            <p>No recorded sessions found.</p>
          </div>
        ) : (
          orderedArchives.map((session) => (
            <GlassContainer
              key={session.id}
              interactive
              onClick={() => openRecord(session)}
              className="w-full min-w-0 p-5 rounded-[22px] space-y-4 shadow-none active:scale-[0.98] transition-all bg-surface-muted"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl ${session.status === 'emergency' ? 'bg-danger-soft text-danger-primary' : 'bg-accent-soft text-accent-primary'
                  }`}>
                  {session.status === 'emergency' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-content-primary truncate">
                      {session.visit_label || session.diagnosis}
                    </h3>
                    <span className="text-xs text-content-dim whitespace-nowrap">
                      {new Date(session.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm text-content-secondary truncate">{session.diagnosis}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-content-dim font-light tracking-wide truncate">
                      {session.complaint || 'No complaint recorded'}
                    </p>
                    <ChevronRight size={14} className="text-content-dim opacity-40" />
                  </div>
                </div>
              </div>
            </GlassContainer>
          ))
        )}
      </div>

      {soapSession && (
        <TheHx
          isOpen={!!soapSession}
          onClose={() => setSoapSession(null)}
          overrideState={soapSession}
        />
      )}

      <VisitRecordModal
        record={recordModal}
        isOpen={!!recordModal}
        onClose={() => setRecordModal(null)}
        onOpenHx={(record) => {
          setRecordModal(null);
          openSoap(record);
        }}
      />
    </div>
  );
};

