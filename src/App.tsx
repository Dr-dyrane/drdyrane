import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Core
import { ClinicalProvider, useClinical } from './core/context/ClinicalContext';

// Layout
import { BottomNav } from './components/layout/BottomNav';

// Features
import { StepRenderer } from './features/consultation/StepRenderer';
import { TheLens } from './features/consultation/TheLens';
import { PillarCard } from './features/resolution/PillarCard';
import { HistoryView } from './features/history/HistoryView';
import { AboutView } from './features/about/AboutView';
import { EmergencyOverlay } from './features/emergency/EmergencyOverlay';

import { TheHx } from './features/consultation/TheHx';

import { Header } from './components/layout/Header';
import { DepthLayer } from './components/layout/DepthLayer';

const MainApp: React.FC = () => {
  const { state, dispatch } = useClinical();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  const toggleTheme = () => dispatch({ type: 'TOGGLE_THEME' });
  const toggleHx = () => dispatch({ type: 'TOGGLE_HX' });

  return (
    <div className="min-h-screen bg-surface-primary text-content-primary selection:bg-neon-cyan selection:text-black flex justify-center transition-colors duration-500 overflow-hidden">
      {/* Mobile Frame Container */}
      <div className="w-full max-w-[440px] h-screen overflow-y-auto relative flex flex-col no-scrollbar">
        <DepthLayer />
        <Header onToggleTheme={toggleTheme} onToggleHx={toggleHx} />

        {/* Global Overlays */}
        <EmergencyOverlay />
        <TheLens />
        <TheHx isOpen={state.isHxOpen} onClose={toggleHx} />

        {/* Main Routing Context */}
        <main className="relative z-10 flex-1 flex flex-col px-4 pt-20 pb-32 min-h-full">
          <AnimatePresence mode="wait">
            {state.view === 'consult' && (
              <motion.div
                key="consult"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col flex-1"
              >
                {state.status === 'complete' ? (
                  <PillarCard />
                ) : (
                  <StepRenderer />
                )}
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
