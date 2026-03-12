import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Core
import { ClinicalProvider, useClinical } from './core/context/ClinicalContext';

// Layout
import { BottomNav } from './components/layout/BottomNav';

// Features
import { StepRenderer } from './features/consultation/StepRenderer';
import { TheLens } from './features/consultation/TheLens';
import { PillarCard } from './features/resolution/PillarCard';
import { EmergencyOverlay } from './features/emergency/EmergencyOverlay';

import { TheHx } from './features/consultation/TheHx';

import { Header } from './components/layout/Header';
import { DepthLayer } from './components/layout/DepthLayer';
import { resolveTheme, watchSystemTheme } from './core/theme/resolveTheme';
import { isProfileOnboardingComplete } from './core/profile/onboarding';
import {
  markOnboardingPrompted,
  syncOnboardingCompletion,
} from './core/storage/onboardingStore';
import {
  ONBOARDING_NOTIFICATION_BODY,
  ONBOARDING_NOTIFICATION_TITLE,
  isOnboardingNotification,
} from './core/notifications/onboardingNotification';

const HistoryView = lazy(() =>
  import('./features/history/HistoryView').then((module) => ({ default: module.HistoryView }))
);
const DrugProtocolsView = lazy(() =>
  import('./features/drug/DrugProtocolsView').then((module) => ({ default: module.DrugProtocolsView }))
);
const ScanReviewView = lazy(() =>
  import('./features/diagnostics/ScanReviewView').then((module) => ({ default: module.ScanReviewView }))
);
const AboutView = lazy(() =>
  import('./features/about/AboutView').then((module) => ({ default: module.AboutView }))
);
const ProfileSheet = lazy(() =>
  import('./features/profile/ProfileSheet').then((module) => ({ default: module.ProfileSheet }))
);
const NotificationsSheet = lazy(() =>
  import('./features/notifications/NotificationsSheet').then((module) => ({ default: module.NotificationsSheet }))
);
const ConsultOnboardingModal = lazy(() =>
  import('./features/onboarding/ConsultOnboardingModal').then((module) => ({
    default: module.ConsultOnboardingModal,
  }))
);

const RouteFallback: React.FC = () => (
  <div className="flex-1 px-2 py-4">
    <div className="surface-raised rounded-[24px] p-4 text-sm text-content-secondary">Loading...</div>
  </div>
);

const MainApp: React.FC = () => {
  const { state, dispatch } = useClinical();
  const launchPresentedRef = useRef(false);
  const onboardingComplete = isProfileOnboardingComplete(state.profile);

  useEffect(() => {
    const applyTheme = () => {
      const resolvedTheme = resolveTheme(state.theme);
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.documentElement.setAttribute('data-theme-choice', state.theme);
      document.documentElement.style.colorScheme = resolvedTheme;
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        const surfaceColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-surface-primary')
          .trim();
        themeColorMeta.setAttribute('content', surfaceColor || (resolvedTheme === 'dark' ? '#000000' : '#ffffff'));
      }
    };

    applyTheme();
    document.documentElement.setAttribute('data-text-scale', state.settings.text_scale);
    document.documentElement.setAttribute(
      'data-reduced-motion',
      state.settings.reduced_motion ? 'true' : 'false'
    );
    document.documentElement.setAttribute('data-motion-style', state.settings.motion_style);
    document.documentElement.setAttribute(
      'data-gratification-enabled',
      state.settings.gratification_enabled ? 'true' : 'false'
    );

    if (state.theme !== 'system') return;
    return watchSystemTheme(applyTheme);
  }, [
    state.theme,
    state.settings.gratification_enabled,
    state.settings.motion_style,
    state.settings.reduced_motion,
    state.settings.text_scale,
  ]);

  useEffect(() => {
    if (launchPresentedRef.current) return;

    const canPresentLaunchSheet =
      state.view === 'consult' &&
      state.status === 'idle' &&
      state.conversation.length === 0 &&
      state.settings.notifications_enabled;

    if (!canPresentLaunchSheet) {
      launchPresentedRef.current = true;
      return;
    }

    if (state.active_sheet !== 'notifications') {
      dispatch({ type: 'TOGGLE_SHEET', payload: 'notifications' });
    }

    launchPresentedRef.current = true;
  }, [
    dispatch,
    state.active_sheet,
    state.conversation.length,
    state.settings.notifications_enabled,
    state.status,
    state.view,
  ]);

  useEffect(() => {
    const persisted = syncOnboardingCompletion(onboardingComplete);
    if (onboardingComplete) return;

    const hasOnboardingNotification = state.notifications.some((notification) =>
      isOnboardingNotification(notification)
    );
    if (hasOnboardingNotification) return;

    const now = Date.now();
    const shouldPrompt =
      !persisted.last_prompted_at || now - persisted.last_prompted_at > 1000 * 60 * 60 * 12;
    if (!shouldPrompt) return;

    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        title: ONBOARDING_NOTIFICATION_TITLE,
        body: ONBOARDING_NOTIFICATION_BODY,
      },
    });
    markOnboardingPrompted();
  }, [dispatch, onboardingComplete, state.notifications]);

  return (
    <div className="min-h-screen bg-surface-primary text-content-primary flex justify-center px-0 sm:px-4 sm:py-4 transition-colors duration-500 overflow-hidden">
      <div className="w-full max-w-[440px] min-h-screen sm:min-h-[94dvh] relative isolate flex flex-col overflow-hidden app-phone-shell sm:rounded-[34px] shadow-float">
        <DepthLayer />
        <Header />

        {/* Global Overlays */}
        <EmergencyOverlay />
        <TheLens />
        <TheHx isOpen={state.isHxOpen} onClose={() => dispatch({ type: 'TOGGLE_HX' })} />
        <Suspense fallback={null}>
          <ProfileSheet
            isOpen={state.active_sheet === 'profile'}
            onClose={() => dispatch({ type: 'CLOSE_SHEETS' })}
          />
          <NotificationsSheet
            isOpen={state.active_sheet === 'notifications'}
            onClose={() => dispatch({ type: 'CLOSE_SHEETS' })}
          />
          <ConsultOnboardingModal
            isOpen={state.active_sheet === 'onboarding'}
            forceRequired={!onboardingComplete && state.status === 'idle' && state.conversation.length === 0}
            onClose={() => dispatch({ type: 'CLOSE_SHEETS' })}
          />
        </Suspense>

        {/* Main Routing Context */}
        <main className="relative z-10 flex-1 flex flex-col px-3 pt-[calc(env(safe-area-inset-top)+4.35rem)] pb-[calc(env(safe-area-inset-bottom)+7.25rem)] min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar">
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
                className="flex flex-1 min-w-0"
              >
                <Suspense fallback={<RouteFallback />}>
                  <HistoryView />
                </Suspense>
              </motion.div>
            )}

            {state.view === 'drug' && (
              <motion.div
                key="drug"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="flex flex-1 min-w-0"
              >
                <Suspense fallback={<RouteFallback />}>
                  <DrugProtocolsView />
                </Suspense>
              </motion.div>
            )}

            {state.view === 'scan' && (
              <motion.div
                key="scan"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="flex flex-1 min-w-0"
              >
                <Suspense fallback={<RouteFallback />}>
                  <ScanReviewView />
                </Suspense>
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
                <Suspense fallback={<RouteFallback />}>
                  <AboutView />
                </Suspense>
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
