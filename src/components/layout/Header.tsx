import React from 'react';
import { Bell } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { resolveProfileAvatarWithFallback } from '../../core/storage/avatarStore';

export const Header: React.FC = () => {
  const { state, dispatch } = useClinical();
  const avatarSrc = resolveProfileAvatarWithFallback(
    state.profile.avatar_url,
    state.profile.display_name || 'Patient'
  );
  const notificationsEnabled = state.settings.notifications_enabled;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const unreadCount = state.settings.notifications_enabled
    ? state.notifications.filter((notification) => !notification.read).length
    : 0;
  const isConsultView = state.view === 'consult';
  const viewLabelMap: Record<typeof state.view, string> = {
    consult: 'Consulting Room',
    history: 'Records',
    drug: 'Pharmacy',
    scan: 'Scan',
    about: 'System',
  };
  const viewLabel = viewLabelMap[state.view];

  return (
    <header className="fixed top-0 max-w-[440px] w-full z-30 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pointer-events-none">
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SHEET', payload: 'profile' })}
          className="h-11 w-11 rounded-full surface-raised shadow-glass overflow-hidden flex items-center justify-center focus-glow interactive-tap interactive-soft pointer-events-auto"
          aria-label="Open profile"
        >
          <img src={avatarSrc} alt="Profile avatar" className="h-full w-full object-cover" />
        </button>

        <div
          className={`flex-1 min-w-0 surface-raised rounded-2xl px-4 pointer-events-auto ${
            isConsultView ? 'h-11 flex items-center' : 'h-12 flex flex-col justify-center'
          }`}
        >
          {!isConsultView && <p className="text-[11px] text-content-dim leading-none">{todayLabel}</p>}
          <p className="text-sm font-semibold text-content-primary leading-tight truncate">
            {isConsultView ? `${viewLabel} · ${todayLabel}` : viewLabel}
          </p>
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

