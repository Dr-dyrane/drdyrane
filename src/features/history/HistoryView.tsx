import React, { useMemo, useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { GlassContainer } from '../../components/shared/GlassContainer';
import {
  Calendar,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { TheHx } from '../consultation/TheHx';
import { Orb } from '../consultation/Orb';
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

  const feedback = (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
    signalFeedback(kind, {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });

  const openRecord = (session: SessionRecord) => {
    setRecordModal(session);
    feedback('select');
  };

  const openSoap = (session: SessionRecord) => {
    setSoapSession(session);
    feedback('select');
  };

  const createManualRecord = () => {
    const now = Date.now();
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      timestamp: now,
      updated_at: now,
      visit_label: `Manual ${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      diagnosis: 'Draft Visit',
      complaint: '',
      notes: '',
      status: 'active',
      soap: state.soap,
      pillars: state.pillars || undefined,
      profile_snapshot: state.profile,
      clerking: { ...state.clerking },
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
      },
    };
    dispatch({ type: 'UPSERT_ARCHIVE', payload: record });
    setRecordModal(record);
    feedback('submit');
  };

  return (
    <div className="flex-1 w-full min-w-0 overflow-x-hidden px-2 py-7 space-y-5 animate-emergence">
      <div className="flex justify-center">
        <Orb />
      </div>
      <div className="text-center space-y-2">
        <span className="text-content-dim text-xs font-medium">Past visits</span>
        <h1 className="display-type text-[1.7rem] text-content-primary">Clinical History</h1>
      </div>

      <button
        onClick={createManualRecord}
        className="w-full min-w-0 h-12 rounded-2xl cta-live text-content-primary text-sm font-semibold focus-glow interactive-tap"
      >
        <span className="inline-flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-xl bg-white/20 inline-flex items-center justify-center">
            <Plus size={14} />
          </span>
          Create Record
        </span>
      </button>

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

