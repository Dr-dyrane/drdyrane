import React from 'react';
import { motion } from 'framer-motion';
import { 
  Activity, 
  Settings2, 
  Sparkles, 
  Droplets, 
  Calendar,
  TrendingUp
} from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { CycleFocusPanel } from './CycleFocusPanel';
import { CycleState } from '../../core/types/clinical';

interface PhaseMetrics {
  label: string;
  color: string;
  bg: string;
  glow: string;
}

interface CycleMainDashboardProps {
  cycle: CycleState;
  phase: PhaseMetrics;
  lastPeriodDate?: number;
  dayOfCycle: number;
  daysUntilNext: number;
  progressPercent: number;
  focusPanelExpanded: boolean;
  onSetFocusPanelExpanded: (val: boolean) => void;
  onOpenHistory: () => void;
  onOpenAiSheet: (query?: string) => void;
  onLogFlow: () => void;
  onOpenSettings: () => void;
  onOpenCalendar: () => void;
}

export const CycleMainDashboard: React.FC<CycleMainDashboardProps> = ({
  cycle,
  phase,
  lastPeriodDate,
  dayOfCycle,
  daysUntilNext,
  progressPercent,
  focusPanelExpanded,
  onSetFocusPanelExpanded,
  onOpenHistory,
  onOpenAiSheet,
  onLogFlow,
  onOpenSettings,
  onOpenCalendar
}) => {
  return (
    <div className="flex-1 w-full min-w-0 py-4 space-y-6 animate-emergence pb-32">
      {/* Z=0: The Core View */}
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="display-type text-2xl text-content-primary transition-all">
            Ava Cycle
          </h1>
          <p className="text-xs text-content-dim uppercase tracking-widest font-medium">
            Reproductive Health OS
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

      {/* Main Cycle Visualization (The Orb) */}
      <GlassContainer className={`relative overflow-hidden p-6 rounded-[34px] min-h-[300px] flex flex-col items-center justify-center space-y-6 surface-raised shadow-2xl transition-all duration-700`}>
        <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
          <Droplets size={180} className="text-neon-rose" />
        </div>
        
        <div className="relative z-10 text-center space-y-3">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full surface-strong ${phase.color} text-[10px] font-bold uppercase tracking-wider`}>
            <Activity size={10} />
            {phase.label} phase
          </div>
          
          {lastPeriodDate ? (
            <>
              <h2 className="text-7xl font-bold display-type text-content-primary tracking-tighter">Day {dayOfCycle}</h2>
              <p className="text-sm text-content-secondary line-clamp-1 italic text-center">
                Period expected in <span className={`${phase.color} font-bold`}>{daysUntilNext} days</span>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold display-type text-content-primary px-4">Ready to Sync?</h2>
              <p className="text-sm text-content-secondary max-w-[200px] text-center">Log your last period to start AI cycle monitoring.</p>
              <button 
                onClick={onLogFlow}
                className="mt-4 px-8 py-3 rounded-full bg-neon-rose text-white text-[12px] font-bold uppercase tracking-widest shadow-lg shadow-neon-rose/30 interactive-tap"
              >
                Set Period
              </button>
            </>
          )}
        </div>

        {lastPeriodDate && (
          <div className="w-full pt-4">
            <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden relative">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                className={`h-full bg-gradient-to-r from-neon-rose to-pink-400`}
              />
            </div>
            <div className="flex justify-between w-full text-[10px] text-content-dim font-medium px-1 mt-2">
              <span>Day 1</span>
              <span className={phase.label === 'Ovulation' ? 'text-neon-rose' : ''}>
                Ovulation
              </span>
              <span>Day {cycle.cycle_length}</span>
            </div>
          </div>
        )}
      </GlassContainer>

      {/* The AI Pulse */}
      {lastPeriodDate && (
        <button 
          onClick={() => onOpenAiSheet()}
          className="w-full"
        >
          <GlassContainer className="p-4 rounded-[24px] flex items-center justify-between interactive-tap bg-white/5 backdrop-blur-md border border-white/5 group shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-neon-rose rounded-full blur animate-pulse opacity-50" />
                <div className="relative p-2 rounded-full bg-surface-strong text-neon-rose">
                  <Sparkles size={16} />
                </div>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-content-primary group-hover:text-neon-rose transition-colors">Ava AI Active</p>
                <p className="text-xs text-content-dim line-clamp-1">
                  {cycle.logs.length > 0 ? "Analyzing recent logs..." : "Tap for deep cycle insights"}
                </p>
              </div>
            </div>
          </GlassContainer>
        </button>
      )}

      {/* Focus-Aware Panel (Directly Below Orb) */}
      <CycleFocusPanel 
        cycle={cycle}
        isExpanded={focusPanelExpanded}
        onToggle={() => onSetFocusPanelExpanded(!focusPanelExpanded)}
      />

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
