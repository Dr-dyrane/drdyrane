import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Settings2,
  Activity,
  Users,
  ShieldCheck,
  Lock,
  ChevronRight
} from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { LifeStage } from '../../core/types/clinical';
import { useClinical } from '../../core/context/ClinicalContext';

interface CycleSettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  discreetMode: boolean;
  onSetDiscreetMode: (val: boolean) => void;
  lifeStage: LifeStage;
  onSetLifeStage: (stage: LifeStage) => void;
  trackingGoal: string;
  onSetTrackingGoal: (goal: any) => void;
  onSettingIntent: () => void;
  onExportPdf: () => void;
  isPartnerMode?: boolean;
  partnerName?: string;
  isConfirmingDisconnect?: boolean;
  onSetConfirmingDisconnect?: (val: boolean) => void;
  onDisconnect?: () => void;
}

export const CycleSettingsOverlay: React.FC<CycleSettingsOverlayProps> = ({
  isOpen,
  onClose,
  discreetMode,
  onSetDiscreetMode,
  lifeStage,
  onSetLifeStage,
  trackingGoal,
  onSetTrackingGoal,
  onSettingIntent,
  onExportPdf,
  isPartnerMode = false,
  partnerName,
  isConfirmingDisconnect = false,
  onSetConfirmingDisconnect,
  onDisconnect
}) => {
  const { state, dispatch } = useClinical();

  const stageLabels: Record<LifeStage, string> = {
    teen: 'Puberty & Growth',
    adult: 'Regular Tracking',
    ttc: 'Trying to Conceive',
    postpartum: 'Postpartum Recovery',
    perimenopause: 'Menopause Transition'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex flex-col justify-end p-2 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { type: 'tween', duration: 0.3 } }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full max-h-[85vh] overflow-hidden pointer-events-auto relative surface-raised rounded-[40px] shadow-2xl bg-black/40 backdrop-blur-2xl"
          >
            <div className="sticky top-0 z-[11] p-6 pb-4 flex items-center justify-between bg-surface-strong/20 backdrop-blur-xl border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/5 text-content-primary">
                  <Settings2 size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold display-type text-content-primary">Health Settings</h3>
                  <p className="text-[10px] text-content-dim uppercase tracking-widest font-medium">Reproductive OS</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="h-10 w-10 rounded-full surface-muted flex items-center justify-center interactive-tap"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-3 pb-24">
              <GlassContainer className="p-5 rounded-[28px] space-y-4 bg-white/5 backdrop-blur-md border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-surface-strong text-accent-primary">
                      <Activity size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-content-primary">Sync Focus</p>
                      <p className="text-xs text-content-dim">Adaptive UI Priority</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      onSettingIntent();
                      onClose();
                    }}
                    className="text-[10px] font-bold text-neon-rose uppercase tracking-widest px-3 py-1.5 surface-strong rounded-lg h-fit interactive-tap"
                  >
                    Change
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'conception', label: 'Fertility' },
                    { id: 'avoidance', label: 'Prevention' },
                    { id: 'mood', label: 'Wellbeing' },
                    { id: 'medical', label: 'Medical' },
                  ].map((goal) => (
                    <button
                      key={goal.id}
                      onClick={() => onSetTrackingGoal(goal.id as any)}
                      className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all interactive-tap ${trackingGoal === goal.id ? 'bg-neon-rose text-white shadow-lg shadow-neon-rose/20' : 'bg-surface-strong text-content-dim'}`}
                    >
                      {goal.label}
                    </button>
                  ))}
                </div>
              </GlassContainer>

              <GlassContainer className="p-5 rounded-[28px] space-y-4 bg-white/5 backdrop-blur-md border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-surface-strong text-accent-primary">
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-content-primary">Life Stage</p>
                      <p className="text-xs text-content-dim">Reproductive Profile</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => dispatch({ type: 'UPDATE_PROFILE', payload: { sex: state.profile.sex === 'male' ? 'female' : 'male' } })}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 text-[8px] font-bold uppercase interactive-tap"
                    >
                      Switch Sex
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(stageLabels).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => onSetLifeStage(val as LifeStage)}
                      className={`px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-tight text-left transition-all interactive-tap ${lifeStage === val ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-surface-strong text-content-dim'}`}
                    >
                      <span className="line-clamp-1">{label}</span>
                    </button>
                  ))}
                </div>
              </GlassContainer>

              <button 
                onClick={() => onSetDiscreetMode(!discreetMode)}
                className="w-full text-left"
              >
                <GlassContainer 
                  className="p-5 rounded-[28px] flex items-center justify-between interactive-tap bg-white/5 backdrop-blur-md border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl bg-surface-strong ${discreetMode ? 'text-neon-rose' : 'text-content-dim'}`}>
                      <ShieldCheck size={18} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-content-primary">Discreet Mode</p>
                      <p className="text-xs text-content-dim">Hide App & Encrypt Data</p>
                    </div>
                  </div>
                  <div className={`h-6 w-10 ${discreetMode ? 'bg-neon-rose/40' : 'bg-surface-strong'} rounded-full relative p-1 transition-colors cursor-pointer`}>
                    <motion.div 
                      animate={{ x: discreetMode ? 16 : 0 }}
                      className="h-4 w-4 bg-white rounded-full shadow-md" 
                    />
                  </div>
                </GlassContainer>
              </button>

              <button 
                onClick={() => {
                  onExportPdf();
                  onClose();
                }}
                className="w-full text-left"
              >
                <GlassContainer 
                  className="p-5 rounded-[28px] flex items-center justify-between interactive-tap bg-white/5 backdrop-blur-md border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-surface-strong text-content-secondary">
                      <Lock size={18} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-content-primary">Medical Export</p>
                      <p className="text-xs text-content-dim">Generate Clinical PDF</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-content-dim" />
                </GlassContainer>
              </button>

              {isPartnerMode && (
                <GlassContainer className="p-5 rounded-[28px] bg-white/5 backdrop-blur-md border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-content-primary">Partner Sync</p>
                      <p className="text-xs text-content-dim">Connected to {partnerName}</p>
                    </div>
                  </div>
                  {isConfirmingDisconnect && onSetConfirmingDisconnect && onDisconnect ? (
                    <div className="flex items-center justify-between gap-3 animate-emergence">
                      <button 
                        onClick={() => onSetConfirmingDisconnect(false)}
                        className="flex-1 py-3 rounded-xl surface-strong text-[10px] font-bold uppercase tracking-widest interactive-tap"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          onDisconnect();
                          onClose();
                        }}
                        className="flex-1 py-3 rounded-xl bg-danger-soft text-danger-primary text-[10px] font-bold uppercase tracking-widest interactive-tap"
                      >
                        Confirm Disconnect
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => onSetConfirmingDisconnect && onSetConfirmingDisconnect(true)}
                      className="w-full py-3 rounded-xl surface-strong text-[10px] font-bold text-content-dim uppercase tracking-widest hover:text-danger-primary transition-colors interactive-tap"
                    >
                      Disconnect Partner
                    </button>
                  )}
                </GlassContainer>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
