import React from 'react';
import { Bell } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { resolveProfileAvatarUrl } from '../../core/storage/avatarStore';

export const Header: React.FC = () => {
  const { state, dispatch } = useClinical();
  const avatarSrc = resolveProfileAvatarUrl(state.profile.avatar_url);
  const unreadCount = state.settings.notifications_enabled
    ? state.notifications.filter((notification) => !notification.read).length
    : 0;

  return (
    <header className="fixed top-0 max-w-[440px] w-full z-40 px-6 pt-7 flex items-center justify-between pointer-events-none">
      <div className="pointer-events-auto">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SHEET', payload: 'profile' })}
          className="h-11 w-11 rounded-full surface-raised shadow-glass overflow-hidden flex items-center justify-center focus-glow"
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
      </div>

      <div className="pointer-events-auto">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SHEET', payload: 'notifications' })}
          className="relative h-11 w-11 rounded-full surface-raised shadow-glass flex items-center justify-center text-content-dim hover:text-content-primary focus-glow disabled:opacity-60"
          aria-label="Open notifications"
          disabled={!state.settings.notifications_enabled}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full bg-neon-cyan text-black text-[9px] font-bold leading-4 text-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
