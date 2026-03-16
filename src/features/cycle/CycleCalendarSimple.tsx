import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
} from 'lucide-react';
import { CycleState } from '../../core/types/clinical';

type ViewMode = 'day' | 'week' | 'month';

interface CycleCalendarProps {
  cycle: CycleState;
  isPartnerMode?: boolean;
}

export const CycleCalendar: React.FC<CycleCalendarProps> = ({ cycle, isPartnerMode = false }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const trackingGoal = cycle.tracking_goal || 'general';
  const lastPeriodDate = cycle.last_period_date;
  
  // Calculate cycle metrics
  const cycleMetrics = useMemo(() => {
    if (!lastPeriodDate) return null;
    
    const today = new Date();
    const cycleStart = new Date(lastPeriodDate);
    const cycleLength = cycle.cycle_length;
    const periodLength = cycle.period_length;
    
    const dayOfCycle = Math.floor((today.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) % cycleLength || cycleLength;
    
    // Calculate fertile window (typically days 10-17)
    const fertileWindowStart = new Date(cycleStart);
    fertileWindowStart.setDate(cycleStart.getDate() + 9); // Day 10
    const fertileWindowEnd = new Date(fertileWindowStart);
    fertileWindowEnd.setDate(fertileWindowStart.getDate() + 7); // Day 17
    
    return {
      cycleStart,
      cycleLength,
      periodLength,
      dayOfCycle,
      fertileWindowStart,
      fertileWindowEnd,
      isInFertileWindow: today >= fertileWindowStart && today <= fertileWindowEnd,
    };
  }, [cycle, lastPeriodDate]);
  
  // Generate calendar days
  const generateCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const days = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const currentDay = new Date(year, month, i);
      const cycleDay = cycleMetrics ? Math.floor((currentDay.getTime() - cycleMetrics.cycleStart.getTime()) / (1000 * 60 * 60 * 24)) % cycleMetrics.cycleLength || cycleMetrics.cycleLength : 0;
      const log = cycle.logs.find(log => {
        const logDate = new Date(log.timestamp);
        return logDate.toDateString() === currentDay.toDateString();
      });
      
      days.push({
        date: currentDay,
        cycleDay,
        log,
        isToday: currentDay.toDateString() === new Date().toDateString(),
        isPast: currentDay < new Date(),
        isFuture: currentDay > new Date(),
      });
    }
    
    return days;
  };
  
  // Get cycle day classification
  const getCycleDayClassification = (cycleDay: number) => {
    if (!cycleMetrics) return 'unknown';
    
    if (cycleDay <= cycleMetrics.periodLength) return 'period';
    if (cycleDay >= 10 && cycleDay <= 17) {
      return trackingGoal === 'conception' ? 'fertile' : 'high-risk';
    }
    return 'safe';
  };
  
  // Get cycle day color
  const getCycleDayColor = (cycleDay: number) => {
    const classification = getCycleDayClassification(cycleDay);
    
    switch (classification) {
      case 'period':
        return trackingGoal === 'conception' ? 'text-pink-500' : 'text-red-500';
      case 'fertile':
        return trackingGoal === 'conception' ? 'text-green-500' : 'text-orange-500';
      case 'high-risk':
        return 'text-red-500';
      case 'safe':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };
  
  // Get cycle day background
  const getCycleDayBackground = (cycleDay: number) => {
    const classification = getCycleDayClassification(cycleDay);
    
    switch (classification) {
      case 'period':
        return trackingGoal === 'conception' ? 'bg-pink-500/10' : 'bg-red-500/10';
      case 'fertile':
        return trackingGoal === 'conception' ? 'bg-green-500/10' : 'bg-orange-500/10';
      case 'high-risk':
        return 'bg-red-500/10';
      case 'safe':
        return 'bg-blue-500/10';
      default:
        return 'bg-gray-500/10';
    }
  };
  
  const calendarDays = generateCalendarDays(selectedDate);
  
  // View mode handlers
  const navigateCalendar = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setSelectedDate(newDate);
  };
  
  const getViewTitle = () => {
    return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };
  
  return (
    <div className="surface-raised rounded-[32px] p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateCalendar('prev')}
            className="w-8 h-8 rounded-full surface-strong flex items-center justify-center interactive-tap"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-content-primary">{getViewTitle()}</h3>
            {isPartnerMode && (
              <p className="text-xs text-content-secondary">
                {cycle.partner_name ? `${cycle.partner_name}'s Calendar` : 'Partner Calendar'}
              </p>
            )}
          </div>
          <button
            onClick={() => navigateCalendar('next')}
            className="w-8 h-8 rounded-full surface-strong flex items-center justify-center interactive-tap"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        
        {/* View Mode Selector */}
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium uppercase tracking-tight transition-all ${
                viewMode === mode
                  ? 'bg-neon-rose text-white'
                  : 'bg-white/5 text-content-dim hover:text-content-primary'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Calendar Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="relative"
        >
          {viewMode === 'month' && (
            <MonthView
              days={calendarDays}
              isPartnerMode={isPartnerMode}
              onDateSelect={setSelectedDate}
              getCycleDayClassification={getCycleDayClassification}
              getCycleDayColor={getCycleDayColor}
              getCycleDayBackground={getCycleDayBackground}
            />
          )}
          
          {viewMode === 'week' && (
            <WeekView
              cycle={cycle}
              getCycleDayClassification={getCycleDayClassification}
              getCycleDayBackground={getCycleDayBackground}
            />
          )}
          
          {viewMode === 'day' && (
            <DayView
              cycle={cycle}
              isPartnerMode={isPartnerMode}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// Month View Component
const MonthView: React.FC<{ 
  days: any[]; 
  isPartnerMode: boolean; 
  onDateSelect: (date: Date) => void;
  getCycleDayClassification: (day: number) => string;
  getCycleDayColor: (day: number) => string;
  getCycleDayBackground: (day: number) => string;
}> = ({ 
  days, 
  isPartnerMode, 
  onDateSelect,
  getCycleDayClassification,
  getCycleDayColor,
  getCycleDayBackground
}) => {
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const getEmptyDays = (): number => {
    const firstDay = days[0]?.date;
    if (!firstDay) return 0;
    const firstDayOfWeek = firstDay.getDay();
    return firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Start on Monday
  };
  
  const emptyDays = getEmptyDays();
  
  return (
    <div className="space-y-4">
      {/* Month Header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day, idx) => (
          <div key={idx} className="text-center text-xs font-medium text-content-dim uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: emptyDays }).map((_, idx) => (
          <div key={`empty-${idx}`} className="aspect-square" />
        ))}
        {days.map((day, idx) => (
          <button
            key={idx}
            onClick={() => onDateSelect(day.date)}
            className={`aspect-square rounded-2xl p-2 flex flex-col items-center justify-center transition-all hover:scale-105 ${
              day.isToday ? 'ring-2 ring-neon-rose' : ''
            } ${getCycleDayBackground(day.cycleDay)} ${day.isPast ? 'opacity-60' : ''} ${day.isFuture ? 'opacity-40' : ''}`}
          >
            <div className="text-sm font-bold text-content-primary">
              {day.date.getDate()}
            </div>
            <div className="text-xs text-content-secondary">
              {day.cycleDay}
            </div>
            {day.log && (
              <div className="flex items-center gap-1 mt-1">
                <Droplets size={10} className={getCycleDayColor(day.cycleDay)} />
                <span className="text-xs">{day.log.flow || 'No flow'}</span>
              </div>
            )}
            {isPartnerMode && (
              <div className="text-xs text-content-dim mt-1">
                {day.isToday ? "Today" : ''}
              </div>
            )}
          </button>
        ))}
      </div>
      
      {/* Month Summary */}
      <div className="surface-strong rounded-2xl p-4 space-y-3">
        <h5 className="text-sm font-semibold text-content-primary">Month Summary</h5>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Total Logs:</span>
            <span className="font-medium text-content-primary">
              {days.filter(d => d.log).length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Period Days:</span>
            <span className="font-medium text-content-primary">
              {days.filter(d => getCycleDayClassification(d.cycleDay) === 'period').length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Fertile Days:</span>
            <span className="font-medium text-content-primary">
              {days.filter(d => getCycleDayClassification(d.cycleDay) === 'fertile' || getCycleDayClassification(d.cycleDay) === 'high-risk').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Week View Component
const WeekView: React.FC<{ 
  cycle: CycleState; 
  getCycleDayClassification: (day: number) => string;
  getCycleDayBackground: (day: number) => string;
}> = ({ cycle, getCycleDayClassification, getCycleDayBackground }) => {
  const weekDays = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day + (day === 0 ? -6 : 1)); // Start on Monday
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + i);
      
      days.push({
        date: currentDay,
        cycleDay: Math.floor((currentDay.getTime() - (cycle.last_period_date || 0)) / (1000 * 60 * 60 * 24)) % cycle.cycle_length || cycle.cycle_length,
        isToday: currentDay.toDateString() === new Date().toDateString(),
      });
    }
    
    return days;
  }, [cycle]);
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1">
        {['M', 'T', 'W', 'Th', 'F', 'S', 'S'].map((day, idx) => (
          <div key={idx} className="text-center text-xs font-medium text-content-dim uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, idx) => (
          <div
            key={idx}
            className={`aspect-square rounded-2xl p-2 flex flex-col items-center justify-center transition-all ${
              day.isToday ? 'ring-2 ring-neon-rose' : ''
            } ${getCycleDayBackground(day.cycleDay)}`}
          >
            <div className="text-lg font-bold text-content-primary">
              {day.date.getDate()}
            </div>
            <div className="text-xs text-content-secondary">
              {day.cycleDay}
            </div>
          </div>
        ))}
      </div>
      
      <div className="surface-strong rounded-2xl p-4 space-y-3">
        <h5 className="text-sm font-semibold text-content-primary">Week Summary</h5>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Period Days:</span>
            <span className="font-medium text-content-primary">
              {weekDays.filter(d => getCycleDayClassification(d.cycleDay) === 'period').length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Fertile Days:</span>
            <span className="font-medium text-content-primary">
              {weekDays.filter(d => getCycleDayClassification(d.cycleDay) === 'fertile' || getCycleDayClassification(d.cycleDay) === 'high-risk').length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Safe Days:</span>
            <span className="font-medium text-content-primary">
              {weekDays.filter(d => getCycleDayClassification(d.cycleDay) === 'safe').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Day View Component
const DayView: React.FC<{ cycle: CycleState; isPartnerMode: boolean }> = ({ cycle, isPartnerMode }) => {
  const today = new Date();
  const dayLogs = cycle.logs.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate.toDateString() === today.toDateString();
  });
  
  const cycleDay = cycle.last_period_date 
    ? Math.floor((today.getTime() - cycle.last_period_date) / (1000 * 60 * 60 * 24)) % cycle.cycle_length || cycle.cycle_length
    : 0;
  
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h4 className="text-2xl font-bold text-content-primary">
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h4>
        <p className="text-sm text-content-secondary">
          Cycle Day {cycleDay} of {cycle.cycle_length}
        </p>
        {isPartnerMode && (
          <p className="text-xs text-content-dim">
            {cycle.partner_name}'s day
          </p>
        )}
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        <div className="surface-strong rounded-2xl p-4 space-y-3">
          <h5 className="text-sm font-semibold text-content-primary">Today's Log</h5>
          {dayLogs.length > 0 ? (
            <div className="space-y-2">
              {dayLogs.map((log, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Droplets size={16} className="text-pink-500" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-content-primary">
                      {log.flow || 'No flow'}
                    </p>
                    {log.symptoms.length > 0 && (
                      <p className="text-xs text-content-secondary">
                        {log.symptoms.slice(0, 2).join(', ')}
                        {log.symptoms.length > 2 && '...'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-content-dim italic">No logs for today</p>
          )}
        </div>
        
        <div className="surface-strong rounded-2xl p-4 space-y-3">
          <h5 className="text-sm font-semibold text-content-primary">Recommendations</h5>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-current mt-1.5 opacity-40" />
              <p className="text-xs text-content-secondary">
                {cycleDay === 1 ? "First day of cycle - track flow intensity carefully" :
                 cycleDay <= 5 ? "Period days - monitor flow changes" :
                 cycleDay >= 10 && cycleDay <= 17 ? "Fertile window - be extra cautious" :
                 "Safe period - continue normal activities"}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex gap-2">
        <button className="flex-1 py-3 surface-strong rounded-xl text-sm font-medium interactive-tap">
          Log Symptoms
        </button>
        <button className="flex-1 py-3 surface-strong rounded-xl text-sm font-medium interactive-tap">
          View Details
        </button>
      </div>
    </div>
  );
};
