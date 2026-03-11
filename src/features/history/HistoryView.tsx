import React, { useMemo, useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { GlassContainer } from '../../components/shared/GlassContainer';
import {
  Calendar,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
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
  const archives = state.archives || [];
  const orderedArchives = useMemo(
    () => [...archives].sort((a, b) => (b.updated_at || b.timestamp) - (a.updated_at || a.timestamp)),
    [archives]
  );

  const openRecord = (session: SessionRecord) => {
    setRecordModal(session);
    signalFeedback('select', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
  };

  const revisit = (session: SessionRecord) => {
    dispatch({ type: 'RESTORE_ARCHIVE', payload: session.id });
    dispatch({ type: 'SET_VIEW', payload: 'consult' });
    signalFeedback('question', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
  };

  const removeRecord = (session: SessionRecord) => {
    const ok = window.confirm(`Delete "${session.visit_label}"?`);
    if (!ok) return;
    dispatch({ type: 'DELETE_ARCHIVE', payload: session.id });
    signalFeedback('error', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
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
    signalFeedback('submit', {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });
  };

  return (
    <div className="flex-1 px-4 py-8 space-y-6 animate-emergence">
      <div className="flex justify-center">
        <Orb />
      </div>
      <div className="text-center space-y-2">
        <span className="text-neon-cyan/40 uppercase tracking-[0.3em] text-[10px] font-bold">Archives</span>
        <h1 className="text-2xl font-light text-content-primary">Clinical History</h1>
      </div>

      <button
        onClick={createManualRecord}
        className="w-full h-12 rounded-2xl surface-raised text-content-primary text-[10px] uppercase tracking-[0.24em] font-semibold focus-glow"
      >
        <span className="inline-flex items-center gap-2">
          <Plus size={14} /> New Visit Record
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
              className="p-5 rounded-[28px] space-y-4 shadow-none active:scale-[0.98] transition-all bg-surface-muted"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl ${session.status === 'emergency' ? 'bg-neon-red/12 text-neon-red' : 'bg-neon-cyan/12 text-neon-cyan'
                  }`}>
                  {session.status === 'emergency' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-content-primary truncate">
                      {session.visit_label || session.diagnosis}
                    </h3>
                    <span className="text-[10px] text-content-dim whitespace-nowrap">
                      {new Date(session.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm text-content-secondary truncate">{session.diagnosis}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-content-dim font-light tracking-wide">
                      {session.complaint || 'No complaint recorded'}
                    </p>
                    <ChevronRight size={14} className="text-content-dim opacity-40" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    revisit(session);
                  }}
                  className="h-10 rounded-xl surface-strong text-[10px] uppercase tracking-[0.2em] text-content-primary"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw size={12} /> Revisit
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSoapSession(session);
                  }}
                  className="h-10 rounded-xl surface-strong text-[10px] uppercase tracking-[0.2em] text-content-primary"
                >
                  SOAP
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecord(session);
                  }}
                  className="h-10 rounded-xl bg-neon-red/80 text-[10px] uppercase tracking-[0.2em] text-white"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Trash2 size={12} /> Delete
                  </span>
                </button>
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
          setSoapSession(record);
        }}
      />
    </div>
  );
};
