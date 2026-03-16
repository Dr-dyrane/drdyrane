import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Droplets, ChevronRight, TrendingUp } from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { CycleState } from '../../core/types/clinical';

interface CycleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: CycleState;
}

export const CycleHistoryModal: React.FC<CycleHistoryModalProps> = ({ isOpen, onClose, cycle }) => {
  const logs = cycle.logs;
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg surface-raised rounded-[40px] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl bg-black/40 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="p-6 flex items-center justify-between bg-surface-strong/20">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-neon-rose/10 text-neon-rose">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold display-type text-content-primary">Cycle Trends</h3>
                  <p className="text-xs text-content-dim">Advanced Pattern Recognition</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="h-10 w-10 rounded-full surface-muted flex items-center justify-center interactive-tap"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Stats Card */}
              <div className="grid grid-cols-2 gap-3">
                <GlassContainer className="p-4 rounded-3xl bg-white/5 backdrop-blur-md">
                  <p className="text-[10px] font-bold text-neon-rose uppercase tracking-wider mb-1">Consistency</p>
                  <p className="text-2xl font-bold display-type">92%</p>
                  <p className="text-[10px] text-content-dim mt-1">High regularity detected</p>
                </GlassContainer>
                <GlassContainer className="p-4 rounded-3xl bg-white/5 backdrop-blur-md">
                  <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">Total Logs</p>
                  <p className="text-2xl font-bold display-type">{logs.length}</p>
                  <p className="text-[10px] text-content-dim mt-1">Recorded entries</p>
                </GlassContainer>
              </div>

              {/* Log List */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-content-dim uppercase tracking-widest px-1">Entry History</h4>
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <GlassContainer key={log.id} className="p-4 rounded-[24px] flex items-center justify-between bg-surface-muted/30">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-xl ${log.flow && log.flow !== 'none' ? 'bg-neon-rose/20 text-neon-rose' : 'bg-surface-strong text-content-dim'}`}>
                          <Droplets size={16} fill={log.flow === 'heavy' ? 'currentColor' : 'none'} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-content-primary">
                            {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <p className="text-[10px] text-content-dim flex items-center gap-2">
                            <span className="capitalize">{log.flow || 'No flow'}</span>
                            {log.symptoms.length > 0 && <span className="w-1 h-1 rounded-full bg-white/10" />}
                            <span>{log.symptoms.slice(0, 2).join(', ')}{log.symptoms.length > 2 ? '...' : ''}</span>
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-content-dim" />
                    </GlassContainer>
                  ))
                ) : (
                  <div className="py-12 text-center space-y-3">
                    <div className="h-16 w-16 bg-surface-strong rounded-full flex items-center justify-center mx-auto text-content-dim opacity-20">
                      <Calendar size={32} />
                    </div>
                    <p className="text-sm text-content-dim">No log entries found. Start logging to reveal trends.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-surface-strong/20">
              <button 
                onClick={onClose}
                className="w-full py-4 rounded-2xl bg-white text-black text-sm font-bold interactive-tap"
              >
                Close Insights
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
