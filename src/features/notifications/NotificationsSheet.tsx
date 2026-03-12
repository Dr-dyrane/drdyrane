import React from 'react';
import { Bell, CheckCheck, ChevronRight, X } from 'lucide-react';
import { SideSheet } from '../../components/shared/SideSheet';
import { useClinical } from '../../core/context/ClinicalContext';
import { signalFeedback } from '../../core/services/feedback';
import { isProfileOnboardingComplete } from '../../core/profile/onboarding';
import { isOnboardingNotification } from '../../core/notifications/onboardingNotification';

interface NotificationsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useClinical();
  const notifications = state.notifications;
  const onboardingComplete = isProfileOnboardingComplete(state.profile);
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const feedback = (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
    signalFeedback(kind, {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });

  const markAllRead = () => {
    dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' });
    feedback('submit');
  };

  const closeSheet = () => {
    feedback('select');
    onClose();
  };

  const markRead = (id: string) => {
    const target = notifications.find((notification) => notification.id === id);
    dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id });
    if (target && isOnboardingNotification(target) && !onboardingComplete) {
      dispatch({ type: 'TOGGLE_SHEET', payload: 'onboarding' });
      feedback('submit');
      return;
    }
    feedback('select');
  };

  return (
    <SideSheet isOpen={isOpen} side="right" onClose={closeSheet}>
      <div className="h-full flex flex-col">
        <div className="px-5 pt-2 pb-4">
          <p className="text-xs text-content-dim font-medium">{todayLabel}</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="display-type text-[2rem] leading-none text-content-primary">Notifications</h2>
              <p className="text-sm text-content-secondary mt-1">
                {unreadCount > 0 ? `${unreadCount} unread alerts` : 'Everything is read'}
              </p>
            </div>
            <button
              onClick={closeSheet}
              aria-label="Close notifications sheet"
              className="h-10 w-10 rounded-full surface-raised flex items-center justify-center focus-glow interactive-tap interactive-soft"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 surface-raised rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-sm text-content-secondary">
              <span className="h-8 w-8 rounded-full surface-strong flex items-center justify-center">
                <Bell size={14} className="text-accent-primary" />
              </span>
              Notification Center
            </div>
            <button
              onClick={markAllRead}
              disabled={unreadCount === 0}
              aria-label="Mark all notifications as read"
              className="h-9 px-3 rounded-xl surface-strong text-xs font-semibold tracking-wide disabled:opacity-50 focus-glow interactive-tap interactive-soft"
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCheck size={14} />
                Mark all
              </span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
          {!onboardingComplete && (
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SHEET', payload: 'onboarding' })}
              className="w-full text-left rounded-2xl p-4 surface-strong shadow-float interactive-tap"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-content-primary">Finish Intake Onboarding</p>
                  <p className="text-sm text-content-secondary mt-1">
                    Complete name, age, and sex before consultation.
                  </p>
                </div>
                <ChevronRight size={14} className="text-content-dim shrink-0" />
              </div>
            </button>
          )}

          {notifications.length === 0 ? (
            <div className="surface-raised rounded-2xl p-5 text-center text-content-dim text-sm">
              No notifications yet.
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => markRead(notification.id)}
                className={`w-full text-left rounded-2xl p-4 transition-all interactive-tap ${
                  notification.read
                    ? 'surface-raised opacity-80'
                    : 'surface-strong shadow-float'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full surface-raised flex items-center justify-center mt-0.5">
                    <Bell size={14} className={notification.read ? 'text-content-dim' : 'text-accent-primary'} />
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-content-primary truncate">{notification.title}</p>
                      {!notification.read && (
                        <span className="h-2 w-2 rounded-full text-accent-primary bg-current inline-block" aria-hidden="true" />
                      )}
                    </div>
                    <p className="text-sm text-content-secondary leading-relaxed">{notification.body}</p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-xs text-content-dim">
                        {new Date(notification.created_at).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      <ChevronRight size={14} className="text-content-dim" />
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+0.85rem)]">
          <button
            onClick={closeSheet}
            className="w-full h-12 rounded-2xl cta-live font-semibold tracking-wide focus-glow interactive-tap"
          >
            Continue to App
          </button>
        </div>
      </div>
    </SideSheet>
  );
};
