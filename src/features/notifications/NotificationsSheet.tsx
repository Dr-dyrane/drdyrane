import React from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { SideSheet } from '../../components/shared/SideSheet';
import { useClinical } from '../../core/context/ClinicalContext';

interface NotificationsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useClinical();
  const notifications = state.notifications;

  return (
    <SideSheet isOpen={isOpen} side="right" onClose={onClose}>
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-5">
          <span className="text-[10px] uppercase tracking-[0.24em] text-content-dim font-semibold">Notifications</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })}
              className="h-9 w-9 rounded-full surface-raised flex items-center justify-center focus-glow"
            >
              <CheckCheck size={15} />
            </button>
            <button onClick={onClose} className="h-9 w-9 rounded-full surface-raised flex items-center justify-center focus-glow">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="surface-raised rounded-[22px] p-5 text-center text-content-dim text-sm">
              No notifications.
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notification.id })}
                className={`w-full text-left rounded-[22px] p-4 transition-all ${
                  notification.read ? 'surface-raised opacity-80' : 'surface-strong shadow-glass'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full surface-raised flex items-center justify-center mt-0.5">
                    <Bell size={14} className={notification.read ? 'text-content-dim' : 'text-neon-cyan'} />
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-sm font-semibold text-content-primary">{notification.title}</p>
                    <p className="text-xs text-content-secondary leading-relaxed">{notification.body}</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-content-dim">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </SideSheet>
  );
};
