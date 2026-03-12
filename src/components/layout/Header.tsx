import React from 'react';
import { Bell } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { resolveProfileAvatarUrl } from '../../core/storage/avatarStore';

export const Header: React.FC = () => {
  const { state, dispatch } = useClinical();
  const avatarSrc = resolveProfileAvatarUrl(state.profile.avatar_url);
  const notificationsEnabled = state.settings.notifications_enabled;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const unreadCount = state.settings.notifications_enabled
    ? state.notifications.filter((notification) => !notification.read).length
    : 0;

  return (
    <header className="fixed top-0 max-w-[440px] w-full z-30 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pointer-events-none">
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SHEET', payload: 'profile' })}
          className="h-11 w-11 rounded-full surface-raised shadow-glass overflow-hidden flex items-center justify-center focus-glow interactive-tap interactive-soft pointer-events-auto"
          aria-label="Open profile"
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="Profile avatar" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-content-primary">
              {(state.profile.display_name || 'P').charAt(0)}
            </span>
          )}
        </button>

        <div className="flex-1 min-w-0 h-12 surface-raised rounded-2xl px-4 flex flex-col justify-center pointer-events-auto">
          <p className="text-[11px] text-content-dim leading-none">{todayLabel}</p>
          <p className="text-sm font-semibold text-content-primary leading-tight truncate">Dr Dyrane Consulting Room</p>
        </div>

        <button
          onClick={() => dispatch({ type: 'TOGGLE_SHEET', payload: 'notifications' })}
          className={`relative h-11 w-11 rounded-full surface-raised shadow-glass flex items-center justify-center focus-glow interactive-tap interactive-soft pointer-events-auto ${
            notificationsEnabled ? 'text-content-dim hover:text-content-primary' : 'text-content-dim opacity-80'
          }`}
          aria-label="Open notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full badge-accent text-[11px] font-bold leading-4 text-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

