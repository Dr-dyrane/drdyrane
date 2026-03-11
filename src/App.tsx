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
import { ProfileSheet } from './features/profile/ProfileSheet';
import { NotificationsSheet } from './features/notifications/NotificationsSheet';

import { TheHx } from './features/consultation/TheHx';

import { Header } from './components/layout/Header';
import { DepthLayer } from './components/layout/DepthLayer';

const MainApp: React.FC = () => {
  const { state, dispatch } = useClinical();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.setAttribute('data-text-scale', state.settings.text_scale);
  }, [state.theme, state.settings.text_scale]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-surface-primary text-content-primary selection:bg-neon-cyan selection:text-content-active flex justify-center transition-colors duration-500 overflow-hidden">
      {/* Mobile Frame Container */}
      <div className="w-full max-w-[440px] min-h-screen min-h-[100dvh] overflow-y-auto relative isolate flex flex-col no-scrollbar">
        <DepthLayer />
        <Header />

        {/* Global Overlays */}
        <EmergencyOverlay />
        <TheLens />
        <TheHx isOpen={state.isHxOpen} onClose={() => dispatch({ type: 'TOGGLE_HX' })} />
        <ProfileSheet
          isOpen={state.active_sheet === 'profile'}
          onClose={() => dispatch({ type: 'CLOSE_SHEETS' })}
        />
        <NotificationsSheet
          isOpen={state.active_sheet === 'notifications'}
          onClose={() => dispatch({ type: 'CLOSE_SHEETS' })}
        />

        {/* Main Routing Context */}
        <main className="relative z-10 flex-1 flex flex-col px-2 pt-20 pb-32 min-h-full">
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
        {state.status !== 'emergency' && state.status !== 'lens' && <BottomNav />}
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
