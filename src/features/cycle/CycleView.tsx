import React, { useState } from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { LifeStage } from '../../core/types/clinical';
import { exportCycleReportPdf } from '../../core/pdf/clinicalPdf';

// Global Modals
import { CycleHistoryModal } from './CycleHistoryModal';
import { CycleAISheet } from './CycleAISheet';
import { CycleLogModal } from './CycleLogModal';

// Extracted Views
import { CycleIntentSelector } from './CycleIntentSelector';
import { CyclePartnerSetup } from './CyclePartnerSetup';
import { CyclePartnerDashboard } from './CyclePartnerDashboard';
import { CycleMainDashboard } from './CycleMainDashboard';
import { CycleSettingsOverlay } from './CycleSettingsOverlay';
import { CycleCalendarOverlay } from './CycleCalendarOverlay';

export const CycleView: React.FC = () => {
  const { state, dispatch } = useClinical();
  const { cycle } = state;
  const [isLogging, setIsLogging] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [prefillQuery, setPrefillQuery] = useState<string | undefined>(undefined);
  const [discreetMode, setDiscreetMode] = useState(false);
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);
  const [isSettingIntent, setIsSettingIntent] = useState(false);
  const [focusPanelExpanded, setFocusPanelExpanded] = useState(false);
  
  // Z=2 Overlay State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Check if user needs onboarding for partner setup specifically
  const isMale = state.profile.sex === 'male';
  const needsPartnerSetup = isMale && !cycle.partner_name;

  const openAISheet = (query?: string) => {
    setPrefillQuery(query);
    setAiSheetOpen(true);
  };

  const lifeStage = cycle.life_stage;
  const setLifeStage = (stage: LifeStage) => {
    dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { life_stage: stage } });
  };

  const trackingGoal = cycle.tracking_goal || 'general';
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const setTrackingGoal = (goal: any) => {
    dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { tracking_goal: goal } });
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
      lifeStage: lifeStage,
      lastPeriodDate: cycle.last_period_date,
      logs: cycle.logs,
      patient: {
        displayName: state.profile.display_name,
        age: state.profile.age,
        sex: state.profile.sex,
      }
    });
  };

  // Shared Domain Logic for Phase visualization
  const lastPeriodDate = cycle.last_period_date;
  const dayOfCycle = lastPeriodDate ? Math.max(1, Math.floor((Date.now() - lastPeriodDate) / (24 * 60 * 60 * 1000)) + 1) : 0;
  const daysUntilNext = lastPeriodDate ? Math.max(0, cycle.cycle_length - (dayOfCycle % cycle.cycle_length)) : 0;
  const progressPercent = Math.min(100, (dayOfCycle / cycle.cycle_length) * 100);

  const getPhase = (day: number) => {
    if (day <= 5) return { label: 'Menstrual', color: 'text-neon-rose', bg: 'bg-neon-rose/10', glow: 'shadow-neon-rose/20' };
    if (day <= 13) return { label: 'Follicular', color: 'text-cyan-400', bg: 'bg-cyan-400/10', glow: 'shadow-cyan-400/20' };
    if (day === 14) return { label: 'Ovulation', color: 'text-amber-400', bg: 'bg-amber-400/10', glow: 'shadow-amber-400/20' };
    return { label: 'Luteal Phase', color: 'text-neon-rose', bg: 'bg-neon-rose/10', glow: 'shadow-neon-rose/20' };
  };

  const phase = getPhase(dayOfCycle);

  const renderContent = () => {
    if (isSettingIntent) {
      return (
        <CycleIntentSelector 
          onBack={() => setIsSettingIntent(false)} 
          isMale={isMale} 
        />
      );
    }

    if (needsPartnerSetup) {
      return <CyclePartnerSetup />;
    }

    // If male and has partner, or female tracking a partner, show Partner Dashboard
    if (cycle.partner_name) {
      return (
        <CyclePartnerDashboard
          cycle={cycle}
          phase={phase}
          lastPeriodDate={lastPeriodDate}
          dayOfCycle={dayOfCycle}
          daysUntilNext={daysUntilNext}
          progressPercent={progressPercent}
          onOpenAiSheet={openAISheet}
          onLogFlow={() => setIsLogging(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenCalendar={() => setIsCalendarOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      );
    }

    return (
      <CycleMainDashboard
        cycle={cycle}
        phase={phase}
        lastPeriodDate={lastPeriodDate}
        dayOfCycle={dayOfCycle}
        daysUntilNext={daysUntilNext}
        progressPercent={progressPercent}
        focusPanelExpanded={focusPanelExpanded}
        onSetFocusPanelExpanded={setFocusPanelExpanded}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenAiSheet={openAISheet}
        onLogFlow={() => setIsLogging(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCalendar={() => setIsCalendarOpen(true)}
      />
    );
  };

  return (
    <>
      {renderContent()}

      <CycleAISheet 
        isOpen={aiSheetOpen} 
        onClose={() => setAiSheetOpen(false)} 
        cycle={cycle} 
        prefillQuery={prefillQuery}
      />
      
      <CycleHistoryModal 
        isOpen={historyOpen} 
        onClose={() => setHistoryOpen(false)} 
        cycle={cycle}
      />
      
      <CycleLogModal 
        isOpen={isLogging} 
        onClose={() => setIsLogging(false)} 
      />

      {/* Extracted Modals (Z=2) */}
      <CycleSettingsOverlay 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        discreetMode={discreetMode}
        onSetDiscreetMode={setDiscreetMode}
        lifeStage={lifeStage}
        onSetLifeStage={setLifeStage}
        trackingGoal={trackingGoal}
        onSetTrackingGoal={setTrackingGoal}
        onSettingIntent={() => {
          setIsSettingsOpen(false);
          setIsSettingIntent(true);
        }}
        onExportPdf={handleExportPdf}
        isPartnerMode={!!cycle.partner_name}
        partnerName={cycle.partner_name}
        isConfirmingDisconnect={isConfirmingDisconnect}
        onSetConfirmingDisconnect={setIsConfirmingDisconnect}
        onDisconnect={() => dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { partner_name: undefined } })}
      />

      <CycleCalendarOverlay 
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        cycle={cycle}
        isPartnerMode={!!cycle.partner_name}
      />
    </>
  );
};
