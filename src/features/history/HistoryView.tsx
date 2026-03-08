import React, { useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { Calendar, AlertCircle, CheckCircle, ChevronRight } from 'lucide-react';
import { TheHx } from '../consultation/TheHx';
import { SessionRecord } from '../../core/types/clinical';

export const HistoryView: React.FC = () => {
  const { state } = useClinical();
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);
  const archives = state.archives || [];

  return (
    <div className="flex-1 px-4 py-8 space-y-10 animate-emergence">
      <div className="text-center space-y-2">
        <span className="text-neon-cyan/40 uppercase tracking-[0.3em] text-[10px] font-bold">Archives</span>
        <h1 className="text-2xl font-light text-[var(--text-primary)]">Clinical History</h1>
      </div>

      <div className="space-y-4 pb-24">
        {archives.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-dim)] font-light space-y-4">
            <Calendar className="w-12 h-12 mx-auto stroke-1 opacity-20" />
            <p>No recorded sessions found.</p>
          </div>
        ) : (
          archives.map((session) => (
            <GlassContainer
              key={session.id}
              interactive
              onClick={() => setSelectedSession(session)}
              className="p-5 rounded-[28px] flex items-center gap-4 border-none shadow-none active:scale-[0.98] transition-all"
            >
              <div className={`p-3 rounded-2xl ${
                session.status === 'emergency' ? 'bg-neon-red/10 text-neon-red' : 'bg-neon-cyan/10 text-neon-cyan'
              }`}>
                {session.status === 'emergency' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {session.diagnosis}
                  </h3>
                  <span className="text-[10px] text-[var(--text-dim)] whitespace-nowrap">
                    {new Date(session.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-[var(--text-dim)] font-light tracking-wide">
                    Status: {session.status.toUpperCase()}
                  </p>
                  <ChevronRight size={14} className="text-[var(--text-dim)] opacity-40" />
                </div>
              </div>
            </GlassContainer>
          ))
        )}
      </div>

      {/* Detail Overlay using the same Hx component but with past data */}
      {selectedSession && (
        <TheHx 
          isOpen={!!selectedSession} 
          onClose={() => setSelectedSession(null)} 
          overrideState={selectedSession}
        />
      )}
    </div>
  );
};
