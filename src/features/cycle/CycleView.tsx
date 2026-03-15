import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets,
  Sparkles,
  Calendar,
  Heart,
  Activity,
  Thermometer,
  Moon,
  Zap,
  Info,
  ChevronRight,
  ShieldCheck,
  Lock,
  Users,
  Gift
} from 'lucide-react';
import { GlassContainer } from '../../components/shared/GlassContainer';
import { useClinical } from '../../core/context/ClinicalContext';
import { LifeStage } from '../../core/types/clinical';
import { exportCycleReportPdf } from '../../core/pdf/clinicalPdf';
import { CycleHistoryModal } from './CycleHistoryModal';
import { CycleAISheet } from './CycleAISheet';

export const CycleView: React.FC = () => {
  const { state, dispatch } = useClinical();
  const { cycle } = state;
  const [isLogging, setIsLogging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [discreetMode, setDiscreetMode] = useState(false);

  const lifeStage = cycle.life_stage;
  const setLifeStage = (stage: LifeStage) => {
    dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { life_stage: stage } });
  };

  React.useEffect(() => {
    const handleOpenLogger = () => setIsLogging(true);
    const handleViewHistory = () => setHistoryOpen(true);
    const handleOpenAI = () => setAiSheetOpen(true);
    const handleExport = () => handleExportPdf();

    window.addEventListener('drdyrane:cycle:open-logger', handleOpenLogger);
    window.addEventListener('drdyrane:cycle:view-history', handleViewHistory);
    window.addEventListener('drdyrane:cycle:open-ai', handleOpenAI);
    window.addEventListener('drdyrane:cycle:export-report', handleExport);

    return () => {
      window.removeEventListener('drdyrane:cycle:open-logger', handleOpenLogger);
      window.removeEventListener('drdyrane:cycle:view-history', handleViewHistory);
      window.removeEventListener('drdyrane:cycle:open-ai', handleOpenAI);
      window.removeEventListener('drdyrane:cycle:export-report', handleExport);
    };
  }, [cycle]);

  const handleExportPdf = () => {
    exportCycleReportPdf({
      cycleLength: cycle.cycle_length,
      periodLength: cycle.period_length,
      lifeStage: stageLabels[lifeStage],
      lastPeriodDate: cycle.last_period_date,
      logs: cycle.logs,
      patient: {
        displayName: state.profile.display_name,
        age: state.profile.age,
        sex: state.profile.sex,
      }
    });
  };

  const stageLabels: Record<LifeStage, string> = {
    teen: 'Puberty & Growth',
    adult: 'Regular Tracking',
    ttc: 'Trying to Conceive',
    postpartum: 'Postpartum Recovery',
    perimenopause: 'Menopause Transition'
  };

  const lastPeriodDate = cycle.last_period_date || (Date.now() - 21 * 24 * 60 * 60 * 1000); // Mock 21 days ago
  const dayOfCycle = Math.max(1, Math.floor((Date.now() - lastPeriodDate) / (24 * 60 * 60 * 1000)) + 1);
  const daysUntilNext = Math.max(0, cycle.cycle_length - (dayOfCycle % cycle.cycle_length));
  const progressPercent = Math.min(100, (dayOfCycle / cycle.cycle_length) * 100);

  const getPhase = (day: number) => {
    if (day <= 5) return { label: 'Menstrual', color: 'text-neon-rose' };
    if (day <= 13) return { label: 'Follicular', color: 'text-cyan-400' };
    if (day === 14) return { label: 'Ovulation', color: 'text-amber-400' };
    return { label: 'Luteal Phase', color: 'text-neon-rose' };
  };

  const phase = getPhase(dayOfCycle);

  const isMale = state.profile.sex === 'male';

  if (isMale) {
    return (
      <div className="flex-1 w-full min-w-0 py-8 px-4 space-y-8 animate-emergence">
        <div className="space-y-2 text-center">
          <div className="w-16 h-16 bg-neon-rose/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Heart size={32} className="text-neon-rose" />
          </div>
          <h1 className="display-type text-3xl text-content-primary">Ava Partner</h1>
          <p className="text-sm text-content-dim max-w-[280px] mx-auto leading-relaxed">
            {cycle.partner_name 
              ? `Tracking ${cycle.partner_name}'s cycle to help you provide the best support.`
              : "Step into sync. Connect with your partner's health data to stay ahead of milestones."}
          </p>
        </div>

        {!cycle.partner_name ? (
          <GlassContainer className="p-8 rounded-[34px] surface-raised space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-content-dim px-1">Partner's Name</label>
                <input 
                  type="text"
                  placeholder="e.g. Sarah"
                  className="w-full bg-white/5 border-0 surface-strong rounded-2xl py-4 px-5 text-sm focus:outline-none ring-1 ring-white/10 focus:ring-neon-rose/30 transition-all font-medium"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const name = (e.currentTarget as HTMLInputElement).value;
                      if (name) dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { partner_name: name } });
                    }
                  }}
                />
              </div>
              <p className="text-[10px] text-content-dim italic px-2">Cycle data will be shared securely once linked via token or manual entry.</p>
            </div>
            <button 
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling?.querySelector('input');
                if (input?.value) dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { partner_name: input.value } });
              }}
              className="w-full py-4 rounded-3xl bg-neon-rose text-white text-sm font-bold shadow-lg shadow-neon-rose/20 interactive-tap"
            >
              Add Partner
            </button>
          </GlassContainer>
        ) : (
          <div className="space-y-6">
            <GlassContainer className="p-6 rounded-[34px] surface-raised text-center space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                 <Droplets size={80} className="text-neon-rose" />
              </div>
              <p className="text-xs font-bold text-neon-rose uppercase tracking-widest">Upcoming Milestone</p>
              <h2 className="text-xl font-bold display-type">{cycle.partner_name}'s Ovulation</h2>
              <p className="text-xs text-content-dim">Next window: 12 - 14 April</p>
              <div className="pt-2">
                <button className="px-6 py-3 rounded-2xl bg-white text-black text-xs font-bold interactive-tap shadow-sm">
                  Support Guide
                </button>
              </div>
            </GlassContainer>

            <div className="grid grid-cols-2 gap-3">
              <GlassContainer className="p-5 rounded-3xl bg-white/5 backdrop-blur-md text-center space-y-2 relative group overflow-hidden">
                <div className="absolute inset-0 bg-amber-400/5 opacity-0 group-active:opacity-100 transition-opacity" />
                <Gift size={24} className="mx-auto text-amber-400" />
                <p className="text-[10px] font-bold uppercase tracking-tight">Gift Ideas</p>
              </GlassContainer>
              <GlassContainer className="p-5 rounded-3xl bg-white/5 backdrop-blur-md text-center space-y-2 relative group overflow-hidden">
                <div className="absolute inset-0 bg-cyan-400/5 opacity-0 group-active:opacity-100 transition-opacity" />
                <Info size={24} className="mx-auto text-cyan-400" />
                <p className="text-[10px] font-bold uppercase tracking-tight">Expert Advice</p>
              </GlassContainer>
            </div>

            <div className="pt-4 text-center">
               <button 
                 onClick={() => dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { partner_name: undefined } })}
                 className="text-[10px] font-bold text-content-dim uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
               >
                 Change Partner
               </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 w-full min-w-0 py-4 space-y-6 animate-emergence">
      {/* Header & Life Stage Selector */}
      <div className="px-1 flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="display-type text-2xl text-content-primary transition-all">
            {discreetMode ? 'Health Tracker' : 'Ava Cycle'}
          </h1>
          <p className="text-xs text-content-dim uppercase tracking-widest font-medium">
            {discreetMode ? 'Privacy Active' : 'Reproductive Health OS'}
          </p>
        </div>
        <button 
          onClick={() => setIsLogging(!isLogging)}
          className="h-10 px-4 rounded-full surface-strong inline-flex items-center gap-2 interactive-tap tap-compact text-xs font-semibold text-accent-primary"
        >
          <Sparkles size={14} />
          {lifeStage === 'ttc' ? 'Fertility Mode' : 'AI Scientist'}
        </button>
      </div>

      {/* Main Cycle Visualization */}
      <GlassContainer className={`relative overflow-hidden p-6 rounded-[34px] min-h-[220px] flex flex-col items-center justify-center space-y-4 surface-raised transition-all duration-700 ${discreetMode ? 'blur-xl grayscale' : ''}`}>
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Droplets size={120} className="text-neon-rose" />
        </div>
        
        <div className="relative z-10 text-center space-y-2">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full surface-strong ${phase.color} text-[10px] font-bold uppercase tracking-wider`}>
            <Activity size={10} />
            {phase.label}
          </div>
          <h2 className="text-5xl font-bold display-type text-content-primary">Day {dayOfCycle}</h2>
          <p className="text-sm text-content-secondary">Period expected in <span className={`${phase.color} font-bold`}>{daysUntilNext} days</span></p>
        </div>

        <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            className={`h-full bg-gradient-to-r from-neon-rose to-pink-400`}
          />
        </div>

        <div className="flex justify-between w-full text-[10px] text-content-dim font-medium px-1">
          <span>Day 1</span>
          <span className="text-neon-rose">Ovulation</span>
          <span>Day {cycle.cycle_length}</span>
        </div>
      </GlassContainer>

      {/* AI Scientist Insight Card */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-1"
        >
          <div className="surface-strong rounded-[28px] p-5 space-y-4 shadow-float option-tone-rose overflow-hidden relative transition-all duration-500">
            <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-neon-rose/10 blur-3xl rounded-full" />
            
            <div className="flex items-center gap-2 text-neon-rose">
              <Sparkles size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Cycle Scientist AI</span>
            </div>

            <p className="text-sm text-content-primary leading-relaxed">
              {cycle.logs.length > 0 ? (
                <>
                  Based on your log from {new Date(cycle.logs[0].timestamp).toLocaleDateString()}, 
                  {cycle.logs[0].flow && cycle.logs[0].flow !== 'none' ? ` your ${cycle.logs[0].flow} flow suggests you are in the menstrual phase.` : ' your symptoms are being analyzed.'}
                  <span className="block mt-2 opacity-80">I've noted {cycle.logs[0].symptoms.join(', ') || 'no companion symptoms'} for this entry.</span>
                </>
              ) : (
                <>
                  Welcome to Ava Cycle. Start logging your symptoms to see personal reproductive health insights.
                  <span className="block mt-2 opacity-80">I will predict your next period and ovulation once I have 2-3 logs.</span>
                </>
              )}
            </p>

            <div className="flex gap-2 pt-2 text-center">
              <button 
                onClick={() => setHistoryOpen(true)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 backdrop-blur-md text-[10px] font-bold uppercase tracking-tight interactive-tap shadow-sm"
              >
                Trends
              </button>
              <button 
                onClick={() => setAiSheetOpen(true)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 backdrop-blur-md text-[10px] font-bold uppercase tracking-tight interactive-tap shadow-sm"
              >
                Deep Scan
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Quick Logging Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-content-dim uppercase tracking-widest px-1">Quick Log</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Droplets, label: 'Flow', tone: 'rose' },
            { icon: Heart, label: 'Cramps', tone: 'rose' },
            { icon: Moon, label: 'Sleep', tone: 'cyan' },
            { icon: Zap, label: 'Energy', tone: 'amber' },
            { icon: Thermometer, label: 'Temp', tone: 'mint' },
            { icon: Activity, label: 'Exercise', tone: 'mint' },
            { icon: Calendar, label: 'Intimacy', tone: 'pink' },
            { icon: Info, label: 'Mood', tone: 'cyan' },
          ].map((item, idx) => (
            <button 
              key={idx}
              onClick={() => setIsLogging(true)}
              className={`flex flex-col items-center justify-center p-3 rounded-2xl bg-white/5 backdrop-blur-md interactive-tap shadow-sm group`}
            >
              <item.icon size={20} className="text-content-secondary group-active:text-neon-rose transition-colors" />
              <span className="text-[10px] mt-1.5 text-content-dim font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modes & Settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-content-dim uppercase tracking-widest px-1">Health Settings</h3>
        <div className="space-y-2">
          <GlassContainer className="p-4 rounded-[22px] flex items-center justify-between interactive-tap bg-white/5 backdrop-blur-md relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-surface-strong text-accent-primary">
                <Users size={18} />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-content-primary">Life Stage / Profile</p>
                <p className="text-xs text-content-dim">
                  {stageLabels[lifeStage]} · {state.profile.sex === 'male' ? 'Male' : 'Female'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
               <button 
                  onClick={() => dispatch({ type: 'UPDATE_PROFILE', payload: { sex: state.profile.sex === 'male' ? 'female' : 'male' } })}
                  className="px-2 py-1 rounded-md bg-white/10 text-[8px] font-bold uppercase"
               >
                 Switch Sex
               </button>
               <ChevronRight size={16} className="text-content-dim" />
            </div>
            <select 
              value={lifeStage} 
              onChange={(e) => setLifeStage(e.target.value as LifeStage)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            >
              {Object.entries(stageLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </GlassContainer>
          <GlassContainer 
            onClick={() => setDiscreetMode(!discreetMode)}
            className="p-4 rounded-[22px] flex items-center justify-between interactive-tap bg-white/5 backdrop-blur-md"
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
            <div className={`h-5 w-9 ${discreetMode ? 'bg-neon-rose/40' : 'bg-surface-strong'} rounded-full relative p-1 transition-colors`}>
              <motion.div 
                animate={{ x: discreetMode ? 16 : 0 }}
                className="h-3 w-3 bg-white rounded-full shadow-sm" 
              />
            </div>
          </GlassContainer>

          <GlassContainer 
            onClick={handleExportPdf}
            className="p-4 rounded-[22px] flex items-center justify-between interactive-tap bg-white/5 backdrop-blur-md"
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
        </div>
      </div>

      <CycleAISheet 
        isOpen={aiSheetOpen} 
        onClose={() => setAiSheetOpen(false)} 
        cycle={cycle} 
      />
      
      <CycleHistoryModal 
        isOpen={historyOpen} 
        onClose={() => setHistoryOpen(false)} 
        logs={cycle.logs} 
      />

      {/* Logging Sheet Overlay */}
      <AnimatePresence>
        {isLogging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-8 sm:pb-12"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => { setIsLogging(false); setIsScanning(false); }}
            />
            
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg surface-raised rounded-[40px] p-8 shadow-2xl space-y-8 bg-black/40 backdrop-blur-2xl"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-1 bg-white/10 rounded-full mx-auto mb-6" />
                <div className="flex items-center justify-between px-2 mb-2">
                  <h3 className="text-2xl font-bold display-type text-content-primary">Quick Log</h3>
                  <button 
                    onClick={() => {
                      setIsScanning(true);
                      setTimeout(() => {
                        dispatch({ type: 'LOG_CYCLE_EVENT', payload: { flow: 'medium', symptoms: [], timestamp: Date.now() } });
                        // Transition to success state
                        setIsScanning(false);
                        const event = new CustomEvent('drdyrane:toast', { 
                          detail: { message: 'Ava Vision identified Medium Flow intensity', type: 'success' } 
                        });
                        window.dispatchEvent(event);
                        setIsLogging(false);
                      }, 2500);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-neon-rose/10 text-neon-rose text-[10px] font-bold shadow-sm interactive-tap"
                  >
                    <Sparkles size={14} />
                    Scan Flow
                  </button>
                </div>
                {!isScanning && <p className="text-sm text-content-dim italic">"Hey Ava, medium flow and cramps today."</p>}
              </div>

              {isScanning ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-8">
                  <div className="relative w-48 h-48 rounded-3xl overflow-hidden bg-white/5 backdrop-blur-md">
                    <motion.div 
                      animate={{ top: ["0%", "100%", "0%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 right-0 h-1 bg-neon-rose shadow-[0_0_15px_rgba(244,63,94,0.8)] z-10"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-20">
                      <Droplets size={64} className="text-neon-rose" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold display-type text-white">Analyzing Flow Intensity...</p>
                    <p className="text-[10px] text-content-dim uppercase tracking-widest mt-1">Ava Vision™ Active</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Flow Selector */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-content-dim px-1">Flow Intensity</p>
                    <div className="grid grid-cols-5 gap-2">
                      {(['none', 'spotting', 'light', 'medium', 'heavy'] as const).map((flow) => (
                        <button
                          key={flow}
                          onClick={() => {
                            dispatch({ 
                              type: 'LOG_CYCLE_EVENT', 
                              payload: { flow, symptoms: [], timestamp: Date.now() } 
                            });
                            setIsLogging(false);
                          }}
                          className="flex flex-col items-center gap-2 group"
                        >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${flow === 'none' ? 'surface-strong' : 'bg-neon-rose/10 text-neon-rose'}`}>
                            <Droplets size={20} className={flow === 'heavy' ? 'fill-current' : ''} />
                          </div>
                          <span className="text-[10px] font-medium text-content-dim capitalize">{flow}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Symptom Grid */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-content-dim px-1">Common Symptoms</p>
                    <div className="grid grid-cols-4 gap-3">
                      {['Cramps', 'Headache', 'Bloating', 'Acne', 'Fatigue', 'Backache', 'Nausea', 'Mood'].map((symptom) => (
                        <button
                          key={symptom}
                          onClick={() => {
                            dispatch({ 
                              type: 'LOG_CYCLE_EVENT', 
                              payload: { symptoms: [symptom], timestamp: Date.now() } 
                            });
                          }}
                          className="py-3 rounded-2xl bg-white/5 backdrop-blur-sm text-[10px] font-bold text-content-secondary interactive-tap"
                        >
                          {symptom}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                       onClick={() => setIsLogging(false)}
                       className="flex-1 py-4 rounded-3xl surface-strong text-sm font-bold text-content-primary interactive-tap"
                    >
                      Dismiss
                    </button>
                    <button className="flex-1 py-4 rounded-3xl bg-neon-rose text-white shadow-neon-rose/20 shadow-lg text-sm font-bold interactive-tap">
                      Complete
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer for bottom nav */}
      <div className="h-10" />
    </div>
  );
};

export default CycleView;
