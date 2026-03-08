import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, ClipboardList } from 'lucide-react';

// Core
import { ClinicalProvider, useClinical } from './core/context/ClinicalContext';

// Layout
import { BottomNav } from './components/layout/BottomNav';

// Features
import { Orb } from './features/consultation/Orb';
import { StepRenderer } from './features/consultation/StepRenderer';
import { TheLens } from './features/consultation/TheLens';
import { PillarCard } from './features/resolution/PillarCard';
import { HistoryView } from './features/history/HistoryView';
import { AboutView } from './features/about/AboutView';
import { EmergencyOverlay } from './features/emergency/EmergencyOverlay';

import { TheHx } from './features/consultation/TheHx';

const MainApp: React.FC = () => {
  const { state, dispatch } = useClinical();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  const toggleTheme = () => dispatch({ type: 'TOGGLE_THEME' });
  const toggleHx = () => dispatch({ type: 'TOGGLE_HX' });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] selection:bg-neon-cyan selection:text-black flex justify-center transition-colors duration-500 overflow-hidden">
      {/* Mobile Frame Container */}
      <div className="w-full max-w-[440px] h-screen overflow-y-auto relative flex flex-col no-scrollbar">
        {/* Background Depth layer */}
        <div className="fixed inset-0 bg-gradient-radial from-white/[0.02] to-transparent pointer-events-none" />

        {/* Dynamic Header */}
        <header className="fixed top-0 max-w-[440px] w-full z-40 px-6 pt-8 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
             <img 
               src={state.theme === 'dark' ? "/logo.png" : "/logo_light.png"} 
               alt="Dr. Dyrane" 
               className="w-5 h-5 object-contain opacity-60 drop-shadow-[0_0_8px_var(--accent-glow)]" 
             />
             <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-[var(--text-primary)]/40">Dr. Dyrane</span>
          </div>
          <div className="flex items-center gap-2 pointer-events-auto">
            {state.status !== 'idle' && (
              <button 
                onClick={toggleHx}
                className="p-3 glass-panel rounded-2xl active:scale-90 transition-all text-[var(--text-primary)]/40 hover:text-neon-cyan border-none outline-none bg-transparent"
              >
                <ClipboardList size={18} />
              </button>
            )}
            <button 
              onClick={toggleTheme}
              className="p-3 glass-panel rounded-2xl active:scale-90 transition-all text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] border-none outline-none bg-transparent"
            >
              {state.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {/* Global Overlays */}
        <EmergencyOverlay />
        <TheLens />
        <TheHx isOpen={state.isHxOpen} onClose={toggleHx} />

        {/* Main Routing Context */}
        <main className="relative z-10 flex-1 flex flex-col px-4 pt-24 pb-32 min-h-full">
          <AnimatePresence mode="wait">
            {state.view === 'consult' && (
              <motion.div
                key="consult"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col flex-1"
              >
                <Orb />
                <StepRenderer />
                <PillarCard />
              </motion.div>
            )}

            {state.view === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-1"
              >
                <HistoryView />
              </motion.div>
            )}

            {state.view === 'about' && (
              <motion.div
                key="about"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="flex flex-1"
              >
                <AboutView />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        
        {/* Universal Navigation */}
        <AnimatePresence>
          {(state.status === 'idle' || state.status === 'complete') && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 max-w-[440px] w-full z-50 pointer-events-none"
            >
              <BottomNav />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ClinicalProvider>
      <MainApp />
    </ClinicalProvider>
  );
}
