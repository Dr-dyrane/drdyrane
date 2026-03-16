import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Droplets, Gift, Sparkles, Calendar, TrendingUp, Settings2 } from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { CycleState } from '../../core/types/clinical';

interface PhaseMetrics {
  label: string;
  color: string;
  bg: string;
  glow: string;
}

interface CyclePartnerDashboardProps {
  cycle: CycleState;
  phase: PhaseMetrics;
  lastPeriodDate?: number;
  dayOfCycle: number;
  daysUntilNext: number;
  progressPercent: number;
  onOpenHistory: () => void;
  onOpenAiSheet: (query?: string) => void;
  onLogFlow: () => void;
  onOpenSettings: () => void;
  onOpenCalendar: () => void;
}

export const CyclePartnerDashboard: React.FC<CyclePartnerDashboardProps> = ({
  cycle,
  phase,
  lastPeriodDate,
  dayOfCycle,
  daysUntilNext,
  progressPercent,
  onOpenHistory,
  onOpenAiSheet,
  onLogFlow,
  onOpenSettings,
  onOpenCalendar
}) => {
  return (
    <div className="flex-1 w-full min-w-0 py-4 space-y-6 animate-emergence pb-32">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="display-type text-2xl text-content-primary transition-all">
            Ava Partner Track
          </h1>
          <p className="text-xs text-content-dim uppercase tracking-widest font-medium">
            Connected: {cycle.partner_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onOpenAiSheet()}
            className="h-10 w-10 rounded-full surface-strong flex items-center justify-center interactive-tap text-accent-primary"
          >
            <Sparkles size={18} />
          </button>
          <button 
            onClick={onOpenSettings}
            className="h-10 w-10 rounded-full surface-strong flex items-center justify-center interactive-tap text-content-secondary"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      <GlassContainer className="p-6 rounded-[34px] surface-raised text-center space-y-4 relative overflow-hidden min-h-[300px] flex flex-col justify-center">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Activity size={120} className="text-neon-rose" />
        </div>
        
        <div className="relative z-10 space-y-2">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full surface-strong ${phase.color} text-[10px] font-bold uppercase tracking-wider`}>
            <Activity size={10} />
            {phase.label} Phase
          </div>
          <h2 className="text-5xl font-bold display-type text-content-primary">
            {lastPeriodDate ? `Day ${dayOfCycle}` : 'Setup Sync'}
          </h2>
          <p className="text-sm text-content-secondary line-clamp-1">
            {lastPeriodDate 
              ? <>{cycle.partner_name}'s period in <span className={`${phase.color} font-bold`}>{daysUntilNext} days</span></>
              : `Set ${cycle.partner_name}'s last period to start tracking.`}
          </p>
          {!lastPeriodDate && (
            <button 
              onClick={onLogFlow}
              className="mt-4 px-6 py-2 rounded-full bg-neon-rose text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-neon-rose/30 interactive-tap"
            >
              Set Period
            </button>
          )}
        </div>

        {lastPeriodDate && (
          <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden relative">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              className={`h-full bg-gradient-to-r from-neon-rose to-pink-400`}
            />
          </div>
        )}
      </GlassContainer>

      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={() => onOpenAiSheet(`What are some thoughtful gift ideas for ${cycle.partner_name} during her ${phase.label} phase?`)}
          className="p-5 rounded-3xl surface-strong text-center space-y-2 interactive-tap"
        >
          <Gift size={24} className="mx-auto text-amber-400" />
          <p className="text-[10px] font-bold uppercase tracking-tight">Gift Ideas</p>
        </button>
        <button 
          onClick={() => onOpenAiSheet(`How can I best support ${cycle.partner_name} during the ${phase.label} phase based on common symptoms?`)}
          className="p-5 rounded-3xl surface-strong text-center space-y-2 interactive-tap"
        >
          <Sparkles size={24} className="mx-auto text-cyan-400" />
          <p className="text-[10px] font-bold uppercase tracking-tight">Support Tips</p>
        </button>
      </div>

      {/* Z=1: The Action Dock */}
      <div className="fixed bottom-[100px] left-0 right-0 px-4 z-[50] pointer-events-none">
        <div className="max-w-md mx-auto relative flex justify-center pointer-events-auto">
          <GlassContainer className="flex items-center gap-2 p-2 rounded-[32px] bg-black/60 backdrop-blur-3xl border border-white/10 shadow-float">
            <button
              onClick={onOpenCalendar}
              className="flex items-center gap-2 px-6 py-4 rounded-[24px] bg-surface-strong/50 hover:bg-surface-strong interactive-tap transition-colors"
            >
              <Calendar size={18} className="text-content-secondary" />
              <span className="text-xs font-bold text-content-primary uppercase tracking-widest hidden sm:inline-block">Calendar</span>
            </button>
            <button
              onClick={onLogFlow}
              className="flex items-center gap-2 px-8 py-4 rounded-[24px] bg-neon-rose text-white shadow-lg shadow-neon-rose/20 interactive-tap transition-transform hover:scale-105"
            >
              <Droplets size={18} />
              <span className="text-xs font-bold uppercase tracking-widest">Log</span>
            </button>
            <button
              onClick={onOpenHistory}
              className="flex items-center gap-2 px-6 py-4 rounded-[24px] bg-surface-strong/50 hover:bg-surface-strong interactive-tap transition-colors"
            >
              <TrendingUp size={18} className="text-content-secondary" />
              <span className="text-xs font-bold text-content-primary uppercase tracking-widest hidden sm:inline-block">Trends</span>
            </button>
          </GlassContainer>
        </div>
      </div>
    </div>
  );
};
