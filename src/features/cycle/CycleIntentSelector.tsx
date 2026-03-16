import React from 'react';
import { ArrowLeft, Heart, ShieldCheck, Sparkles, Activity, CheckCircle2 } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';

interface CycleIntentSelectorProps {
  onBack: () => void;
  isMale?: boolean;
}

export const CycleIntentSelector: React.FC<CycleIntentSelectorProps> = ({ onBack, isMale }) => {
  const { state, dispatch } = useClinical();
  const { cycle } = state;
  const trackingGoal = cycle.tracking_goal || 'general';

  const intents = [
    { 
      id: 'conception', 
      title: 'Fertility Planning', 
      desc: 'Prioritize ovulation and fertile windows.', 
      icon: Heart, 
      tone: 'text-neon-rose' 
    },
    { 
      id: 'avoidance', 
      title: 'Pregnancy Avoidance', 
      desc: 'Highlight risk windows and FAM safety.', 
      icon: ShieldCheck, 
      tone: 'text-cyan-400' 
    },
    { 
      id: 'mood', 
      title: 'Wellbeing & Mood', 
      desc: 'Track energy, sleep, and luteal support.', 
      icon: Sparkles, 
      tone: 'text-amber-400' 
    },
    { 
      id: 'medical', 
      title: 'Medical Monitoring', 
      desc: 'Audit irregularities and flow heavy-days.', 
      icon: Activity, 
      tone: 'text-white' 
    },
  ];

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handleSelect = (goal: any) => {
    dispatch({ type: 'UPDATE_CYCLE_SETTINGS', payload: { tracking_goal: goal } });
    onBack();
  };

  return (
    <div className="flex-1 w-full min-w-0 py-8 space-y-6 animate-emergence">
      <div className="flex items-center gap-4 mb-2">
        <button 
          onClick={onBack}
          className="p-2 rounded-full surface-strong interactive-tap"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-bold display-type">Sync Focus</h2>
      </div>
      
      <p className="text-sm text-content-secondary px-2">
        How should I prioritize {isMale ? `${cycle.partner_name}'s` : 'your'} health insights?
      </p>
      
      <div className="grid grid-cols-1 gap-3">
        {intents.map((goal) => (
          <button
            key={goal.id}
            onClick={() => handleSelect(goal.id)}
            className={`p-5 rounded-[28px] surface-strong text-left flex items-center gap-4 interactive-tap transition-all ${
              trackingGoal === goal.id ? 'ring-2 ring-neon-rose' : ''
            }`}
          >
            <div className={`p-3 rounded-2xl bg-white/5 ${goal.tone}`}>
              <goal.icon size={24} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-content-primary">{goal.title}</p>
              <p className="text-[10px] text-content-dim uppercase tracking-tight">{goal.desc}</p>
            </div>
            {trackingGoal === goal.id && <CheckCircle2 size={18} className="text-neon-rose" />}
          </button>
        ))}
      </div>
    </div>
  );
};
