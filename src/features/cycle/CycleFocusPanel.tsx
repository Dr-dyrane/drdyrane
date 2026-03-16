import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Heart,
  Sparkles,
  Activity,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react';
import { CycleState, CycleFlow } from '../../core/types/clinical';

interface CycleFocusPanelProps {
  cycle: CycleState;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const CycleFocusPanel: React.FC<CycleFocusPanelProps> = ({ 
  cycle, 
  isExpanded = false, 
  onToggle 
}) => {
  const trackingGoal = cycle.tracking_goal || 'general';
  const lastPeriodDate = cycle.last_period_date;
  
  // Calculate cycle day
  const getDayOfCycle = (): number => {
    if (!lastPeriodDate) return 0;
    const daysSince = Math.floor((Date.now() - lastPeriodDate) / (1000 * 60 * 60 * 24));
    return daysSince % cycle.cycle_length || cycle.cycle_length;
  };
  
  const dayOfCycle = getDayOfCycle();
  
  // Calculate fertile window (typically days 10-17)
  const isInFertileWindow = dayOfCycle >= 10 && dayOfCycle <= 17;
  const isHighRiskWindow = isInFertileWindow && trackingGoal === 'avoidance';
  const isOptimalWindow = isInFertileWindow && trackingGoal === 'conception';
  
  // Get most recent log with flow
  const getRecentFlow = (): CycleFlow | null => {
    const flowLogs = cycle.logs.filter(log => log.flow && log.flow !== 'none');
    return flowLogs.length > 0 ? flowLogs[0].flow || null : null;
  };
  
  const recentFlow = getRecentFlow();
  
  // Focus-specific content
  const getFocusContent = () => {
    switch (trackingGoal) {
      case 'conception':
        return {
          title: 'Fertility Planning',
          icon: Heart,
          color: 'text-pink-500',
          bgColor: 'bg-pink-500/10',
          borderColor: 'border-pink-500/20',
          recommendations: isOptimalWindow ? [
            'Optimal fertility window - days 10-17',
            'Consider basal temperature tracking',
            'Monitor cervical mucus changes',
            'Plan intimacy for peak conception days'
          ] : [
            'Track cycle regularity',
            'Maintain healthy lifestyle',
            'Consider prenatal vitamins',
            'Prepare for fertile window'
          ],
          warnings: []
        };
        
      case 'avoidance':
        return {
          title: 'Pregnancy Avoidance',
          icon: ShieldCheck,
          color: 'text-cyan-500',
          bgColor: 'bg-cyan-500/10',
          borderColor: 'border-cyan-500/20',
          recommendations: isHighRiskWindow ? [
            'HIGH RISK: Use protection or abstain',
            'Consider backup contraception method',
            'Emergency contraception available if needed',
            'Monitor for any contraceptive failure'
          ] : [
            'Track fertile window carefully',
            'Have contraception ready',
            'Know emergency contraception options',
            'Consider calendar method + backup'
          ],
          warnings: isHighRiskWindow ? [
            'High pregnancy risk - days 10-17',
            'Sperm can survive 5 days in reproductive tract'
          ] : []
        };
        
      case 'mood':
        return {
          title: 'Wellbeing & Mood',
          icon: Sparkles,
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/20',
          recommendations: dayOfCycle > 20 ? [
            'Luteal phase - mood support important',
            'Consider magnesium and B vitamins',
            'Prioritize sleep and stress management',
            'Light exercise can help mood'
          ] : [
            'Track energy levels daily',
            'Monitor sleep patterns',
            'Note any mood changes',
            'Consider cycle-related anxiety'
          ],
          warnings: []
        };
        
      case 'medical':
        return {
          title: 'Medical Monitoring',
          icon: Activity,
          color: 'text-purple-500',
          bgColor: 'bg-purple-500/10',
          borderColor: 'border-purple-500/20',
          recommendations: [
            'Track flow intensity and duration',
            'Monitor for irregular patterns',
            'Note any concerning symptoms',
            'Keep detailed medical records'
          ],
          warnings: recentFlow === 'heavy' ? [
            'Heavy flow - monitor for anemia',
            'Consider iron supplementation',
            'Consult provider if excessive'
          ] : []
        };
        
      default:
        return {
          title: 'General Tracking',
          icon: Calendar,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
          recommendations: [
            'Maintain consistent logging',
            'Track symptoms and flow',
            'Note any cycle changes',
            'Stay aware of your body'
          ],
          warnings: []
        };
    }
  };
  
  const focusContent = getFocusContent();
  const Icon = focusContent.icon;
  
  const panelVariants = {
    collapsed: {
      height: 'auto',
      transition: { duration: 0.3, ease: 'easeInOut' as const }
    },
    expanded: {
      height: 'auto',
      transition: { duration: 0.3, ease: 'easeInOut' as const }
    }
  };
  
  return (
    <motion.div
      variants={panelVariants}
      initial="collapsed"
      animate={isExpanded ? "expanded" : "collapsed"}
      className={`${focusContent.bgColor} ${focusContent.borderColor} border rounded-2xl p-4 space-y-3`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${focusContent.bgColor} flex items-center justify-center`}>
            <Icon size={18} className={focusContent.color} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content-primary">{focusContent.title}</h3>
            <p className="text-xs text-content-secondary">
              {lastPeriodDate ? `Day ${dayOfCycle} of ${cycle.cycle_length}` : 'No period data'}
            </p>
          </div>
        </div>
        
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-full surface-strong flex items-center justify-center interactive-tap"
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {/* Status Indicator */}
            {(isOptimalWindow || isHighRiskWindow) && (
              <div className={`p-3 rounded-xl ${
                isHighRiskWindow 
                  ? 'bg-red-500/10 border border-red-500/20' 
                  : 'bg-green-500/10 border border-green-500/20'
              }`}>
                <div className="flex items-start gap-2">
                  {isHighRiskWindow ? (
                    <AlertTriangle size={16} className="text-red-500 mt-0.5" />
                  ) : (
                    <Heart size={16} className="text-green-500 mt-0.5" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${
                      isHighRiskWindow ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'
                    }`}>
                      {isHighRiskWindow ? 'High Risk Window' : 'Optimal Fertility Window'}
                    </p>
                    <p className={`text-xs ${
                      isHighRiskWindow ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                      Days {dayOfCycle} of {cycle.cycle_length} • {isHighRiskWindow ? 'Use protection' : 'Peak conception days'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings */}
            {focusContent.warnings.length > 0 && (
              <div className="space-y-2">
                {focusContent.warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertTriangle size={14} className="text-amber-500 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-content-primary uppercase tracking-wide">Recommendations</h4>
              <div className="space-y-1">
                {focusContent.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-current mt-1.5 opacity-40" />
                    <p className="text-xs text-content-secondary leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Partner Mode (if applicable) */}
            {cycle.partner_name && (trackingGoal === 'conception' || trackingGoal === 'avoidance') && (
              <div className="p-3 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-content-dim" />
                  <p className="text-xs font-medium text-content-primary">Partner: {cycle.partner_name}</p>
                </div>
                <p className="text-xs text-content-secondary">
                  {trackingGoal === 'conception' 
                    ? 'Consider planning intimacy during optimal window'
                    : 'Ensure partner understands high-risk periods'
                  }
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2">
              <button className="flex-1 py-2 surface-strong rounded-lg text-xs font-medium interactive-tap">
                Log Symptoms
              </button>
              <button className="flex-1 py-2 surface-strong rounded-lg text-xs font-medium interactive-tap">
                View Calendar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
