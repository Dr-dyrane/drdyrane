import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Droplets,
  Activity,
} from 'lucide-react';
import { CycleState } from '../../core/types/clinical';

type ViewMode = 'day' | 'week' | 'month';
type CalendarView = 'calendar' | 'timeline' | 'insights';

// Helper function to get cycle day classification
const getCycleDayClassification = (cycleDay: number, trackingGoal: string): 'period' | 'fertile' | 'high-risk' | 'safe' | 'unknown' => {
  if (cycleDay <= 5) return 'period';
  if (cycleDay >= 10 && cycleDay <= 17) {
    return trackingGoal === 'conception' ? 'fertile' : 'high-risk';
  }
  if (cycleDay > 17 || cycleDay < 1) return 'safe';
  return 'unknown';
};

// Helper function to get cycle day color
const getCycleDayColor = (cycleDay: number, trackingGoal: string): string => {
  const classification = getCycleDayClassification(cycleDay, trackingGoal);
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

// Helper function to get cycle day background
const getCycleDayBackground = (cycleDay: number, trackingGoal: string): string => {
  const classification = getCycleDayClassification(cycleDay, trackingGoal);
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

interface CycleCalendarProps {
  cycle: CycleState;
  isPartnerMode?: boolean;
}

export const CycleCalendar: React.FC<CycleCalendarProps> = ({ cycle, isPartnerMode = false }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [calendarView, setCalendarView] = useState<CalendarView>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
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
    
    // Calculate next period
    const nextPeriod = new Date(cycleStart);
    nextPeriod.setDate(nextPeriod.getDate() + cycleLength);
    
    // Calculate ovulation (typically day 14)
    const ovulationDay = new Date(cycleStart);
    ovulationDay.setDate(ovulationDay.getDate() + 13);
    
    // Calculate period end
    const periodEnd = new Date(cycleStart);
    periodEnd.setDate(cycleStart.getDate() + periodLength - 1);
    
    return {
      cycleStart,
      nextPeriod,
      ovulationDay,
      fertileWindowStart,
      fertileWindowEnd,
      periodStart: cycleStart,
      periodEnd,
      dayOfCycle,
      daysUntilNextPeriod: Math.max(0, Math.ceil((nextPeriod.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))),
      isInFertileWindow: today >= fertileWindowStart && today <= fertileWindowEnd,
      isOvulationDay: today.toDateString() === ovulationDay.toDateString(),
      isInPeriod: today >= cycleStart && today <= periodEnd,
      cycleLength,
      periodLength,
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
  
  // Generate week days
  const generateWeekDays = (date: Date) => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day + (day === 0 ? -6 : 1)); // Start on Monday
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + i);
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
  
  const calendarDays = generateCalendarDays(selectedDate);
  const weekDays = generateWeekDays(selectedDate);
  
  // View mode handlers
  const navigateCalendar = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    }
    setSelectedDate(newDate);
  };
  
  const getViewTitle = () => {
    if (viewMode === 'day') {
      return selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    } else if (viewMode === 'week') {
      const weekStart = new Date(selectedDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1)); // Start on Monday
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else {
      return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
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
      
      {/* Calendar View Type Selector */}
      {viewMode === 'month' && (
        <div className="flex gap-2">
          {(['calendar', 'timeline', 'insights'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setCalendarView(view)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                calendarView === view
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-content-dim hover:text-content-primary'
              }`}
            >
              {view === 'calendar' ? 'Calendar' : view === 'timeline' ? 'Timeline' : 'Insights'}
            </button>
          ))}
        </div>
      )}
      
      {/* Calendar Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${viewMode}-${calendarView}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="relative"
        >
          {viewMode === 'day' && calendarView === 'calendar' && (
            <DayView
              date={selectedDate}
              cycle={cycle}
              isPartnerMode={isPartnerMode}
            />
          )}
          
          {viewMode === 'week' && calendarView === 'calendar' && (
            <WeekView
              weekDays={weekDays}
              cycle={cycle}
              isPartnerMode={isPartnerMode}
            />
          )}
          
          {viewMode === 'month' && calendarView === 'calendar' && (
            <MonthView
              days={calendarDays}
              cycle={cycle}
              isPartnerMode={isPartnerMode}
              onDateSelect={setSelectedDate}
            />
          )}
          
          {viewMode === 'month' && calendarView === 'timeline' && (
            <TimelineView
              cycle={cycle}
              isPartnerMode={isPartnerMode}
            />
          )}
          
          {viewMode === 'month' && calendarView === 'insights' && (
            <InsightsView
              cycle={cycle}
              isPartnerMode={isPartnerMode}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// Day View Component
const DayView: React.FC<{ date: Date; cycle: CycleState; isPartnerMode: boolean }> = ({ date, cycle, isPartnerMode }) => {
  const dayLogs = cycle.logs.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate.toDateString() === date.toDateString();
  });
  
  const cycleDay = cycle.last_period_date 
    ? Math.floor((date.getTime() - cycle.last_period_date) / (1000 * 60 * 60 * 24)) % cycle.cycle_length || cycle.cycle_length
    : 0;
  
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h4 className="text-2xl font-bold text-content-primary">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
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

// Week View Component
const WeekView: React.FC<{ weekDays: any[]; cycle: CycleState; isPartnerMode: boolean }> = ({ weekDays, cycle }) => {
  const trackingGoal = cycle.tracking_goal || 'general';
  const weekDaysWithClassification = weekDays.map(day => ({
    ...day,
    classification: getCycleDayClassification(day.cycleDay, trackingGoal),
  }));
  
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
        {weekDaysWithClassification.map((day, idx) => (
          <div
            key={idx}
            className={`aspect-square rounded-2xl p-2 flex flex-col items-center justify-center transition-all ${
              day.isToday ? 'ring-2 ring-neon-rose' : ''
            } ${getCycleDayBackground(day.cycleDay, trackingGoal)} ${day.isPast ? 'opacity-60' : ''} ${day.isFuture ? 'opacity-40' : ''}`}
          >
            <div className="text-lg font-bold text-content-primary">
              {day.date.getDate()}
            </div>
            <div className="text-xs text-content-secondary">
              {day.cycleDay}
            </div>
            {day.log && (
              <div className="flex items-center gap-1 mt-1">
                <Droplets size={12} className={getCycleDayColor(day.cycleDay, trackingGoal)} />
                <span className="text-xs">{day.log.flow || 'No flow'}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="surface-strong rounded-2xl p-4 space-y-3">
        <h5 className="text-sm font-semibold text-content-primary">Week Summary</h5>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Period Days:</span>
            <span className="font-medium text-content-primary">
              {weekDaysWithClassification.filter(d => d.classification === 'period').length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Fertile Days:</span>
            <span className="font-medium text-content-primary">
              {weekDaysWithClassification.filter(d => d.classification === 'fertile' || d.classification === 'high-risk').length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Safe Days:</span>
            <span className="font-medium text-content-primary">
              {weekDaysWithClassification.filter(d => d.classification === 'safe').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Month View Component
const MonthView: React.FC<{ days: any[]; cycle: CycleState; isPartnerMode: boolean; onDateSelect: (date: Date) => void }> = ({ 
  days, 
  cycle, 
  isPartnerMode, 
  onDateSelect 
}) => {
  const trackingGoal = cycle.tracking_goal || 'general';
  const firstDay = days[0]?.date;
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const getEmptyDays = (): number => {
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
            } ${getCycleDayBackground(day.cycleDay, trackingGoal)} ${day.isPast ? 'opacity-60' : ''} ${day.isFuture ? 'opacity-40' : ''}`}
          >
            <div className="text-sm font-bold text-content-primary">
              {day.date.getDate()}
            </div>
            <div className="text-xs text-content-secondary">
              {day.cycleDay}
            </div>
            {day.log && (
              <div className="flex items-center gap-1 mt-1">
                <Droplets size={10} className={getCycleDayColor(day.cycleDay, trackingGoal)} />
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
              {days.filter(d => getCycleDayClassification(d.cycleDay, trackingGoal) === 'period').length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-secondary">Fertile Days:</span>
            <span className="font-medium text-content-primary">
              {days.filter(d => getCycleDayClassification(d.cycleDay, trackingGoal) === 'fertile' || getCycleDayClassification(d.cycleDay, trackingGoal) === 'high-risk').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Timeline View Component
const TimelineView: React.FC<{ cycle: CycleState; isPartnerMode: boolean }> = ({ cycle, isPartnerMode }) => {
  const timelineData = useMemo(() => {
    if (!cycle.last_period_date) return [];
    
    const timeline = [];
    const cycleLength = cycle.cycle_length;
    const periodLength = cycle.period_length;
    const cycleStart = new Date(cycle.last_period_date);
    
    // Add cycle events to timeline
    for (let cycleNum = 0; cycleNum < 3; cycleNum++) {
      const cycleStartDate = new Date(cycleStart);
      cycleStartDate.setDate(cycleStartDate.getDate() + (cycleNum * cycleLength));
      
      // Period
      const periodStart = new Date(cycleStartDate);
      const periodEnd = new Date(cycleStartDate);
      periodEnd.setDate(periodStart.getDate() + periodLength - 1);
      
      timeline.push({
        type: 'period',
        start: periodStart,
        end: periodEnd,
        title: `Period ${cycleNum + 1}`,
        color: 'bg-red-500',
      });
      
      // Fertile window
      const fertileStart = new Date(cycleStartDate);
      fertileStart.setDate(fertileStart.getDate() + 9);
      const fertileEnd = new Date(fertileStart);
      fertileEnd.setDate(fertileStart.getDate() + 7);
      
      timeline.push({
        type: 'fertile',
        start: fertileStart,
        end: fertileEnd,
        title: 'Fertile Window',
        color: cycle.tracking_goal === 'conception' ? 'bg-green-500' : 'bg-orange-500',
      });
      
      // Ovulation
      const ovulationDay = new Date(cycleStartDate);
      ovulationDay.setDate(ovulationDay.getDate() + 13);
      
      timeline.push({
        type: 'ovulation',
        date: ovulationDay,
        title: 'Ovulation Day',
        color: 'bg-purple-500',
      });
      
      // Safe period
      const safeStart = new Date(fertileEnd);
      safeStart.setDate(safeStart.getDate() + 1);
      const safeEnd = new Date(cycleStartDate);
      safeEnd.setDate(safeEnd.getDate() + cycleLength - 1);
      
      timeline.push({
        type: 'safe',
        start: safeStart,
        end: safeEnd,
        title: 'Safe Period',
        color: 'bg-blue-500',
      });
    }
    
    return timeline;
  }, [cycle]);
  
  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-content-primary">Cycle Timeline</h4>
      <div className="space-y-2">
        {timelineData.map((event, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${event.color}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-content-primary">{event.title}</p>
              <p className="text-xs text-content-secondary">
                {event.date 
                  ? event.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : `${event.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${event.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                }
              </p>
              {isPartnerMode && (
                <p className="text-xs text-content-dim">
                  {event.title.toLowerCase().includes('period') ? `${cycle.partner_name}'s ${event.title}` : event.title}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Insights View Component
const InsightsView: React.FC<{ cycle: CycleState; isPartnerMode: boolean }> = ({ cycle }) => {
  const insights = useMemo(() => {
    if (!cycle.logs.length) return [];
    
    // Analyze cycle patterns
    const flowPattern = cycle.logs.reduce((acc, log) => {
      if (log.flow) {
        acc[log.flow] = (acc[log.flow] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const averageCycleLength = cycle.cycle_length;
    const averagePeriodLength = cycle.period_length;
    const totalLogs = cycle.logs.length;
    
    return [
      {
        title: 'Cycle Regularity',
        value: `${averageCycleLength} days`,
        description: 'Consistent cycle length detected',
        icon: Calendar,
        color: 'text-blue-500',
      },
      {
        title: 'Period Length',
        value: `${averagePeriodLength} days`,
        description: 'Average period duration',
        icon: Clock,
        color: 'text-red-500',
      },
      {
        title: 'Most Common Flow',
        value: Object.entries(flowPattern).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None',
        description: `${Object.entries(flowPattern).sort((a, b) => b[1] - a[1])[0][1]} occurrences`,
        icon: Droplets,
        color: 'text-pink-500',
      },
      {
        title: 'Total Logs',
        value: totalLogs.toString(),
        description: 'Total cycle entries logged',
        icon: Activity,
        color: 'text-purple-500',
      },
    ];
  }, [cycle]);
  
  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold text-content-primary">Cycle Insights</h4>
      <div className="grid grid-cols-1 gap-3">
        {insights.map((insight, idx) => (
          <div key={idx} className="surface-strong rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${insight.color} bg-opacity-20 flex items-center justify-center`}>
                <insight.icon size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-content-primary">{insight.title}</p>
                <p className="text-xs text-content-secondary">{insight.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
