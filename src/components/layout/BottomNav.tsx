import React from 'react';
import { useClinical } from '../../core/context/ClinicalContext';
import { AppView } from '../../core/types/clinical';
import { Stethoscope, History, Info } from 'lucide-react';
import { motion } from 'framer-motion';

export const BottomNav: React.FC = () => {
  const { state, dispatch } = useClinical();

  const setView = (view: AppView) => {
    dispatch({ type: 'SET_VIEW', payload: view });
  };

  const navItems = [
    { id: 'consult' as AppView, label: 'Consult', icon: Stethoscope },
    { id: 'history' as AppView, label: 'History', icon: History },
    { id: 'about' as AppView, label: 'About', icon: Info },
  ];

  return (
    <nav className="fixed bottom-0 max-w-[440px] w-full z-50 px-6 pb-8 pointer-events-none">
      <div className="glass-panel flex items-center justify-around py-3 px-2 rounded-[32px] pointer-events-auto">
        {navItems.map((item) => {
          const isActive = state.view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex flex-col items-center gap-1 p-2 min-w-[70px] transition-all border-none outline-none ${
                isActive ? 'text-neon-cyan' : 'text-[var(--text-dim)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <item.icon size={20} className={isActive ? 'drop-shadow-[0_0_8px_var(--accent-glow)]' : ''} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
              {isActive && (
                <motion.div 
                  layoutId="nav-dot"
                  className="w-1 h-1 rounded-full bg-neon-cyan mt-0.5 shadow-[0_0_5px_var(--accent-glow)]" 
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
