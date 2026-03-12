import React, { useRef, useState } from 'react';
import {
  Bell,
  History,
  Info,
  Monitor,
  Moon,
  Sparkles,
  Stethoscope,
  Sun,
  Trash2,
  Upload,
  User,
  Vibrate,
  Volume2,
  X,
} from 'lucide-react';
import { SideSheet } from '../../components/shared/SideSheet';
import { useClinical } from '../../core/context/ClinicalContext';
import { ToggleSwitch } from '../../components/shared/ToggleSwitch';
import { signalFeedback } from '../../core/services/feedback';
import {
  fileToDataUrl,
  MAX_AVATAR_FILE_BYTES,
  removeProfileAvatar,
  resolveProfileAvatarUrl,
  saveProfileAvatarData,
} from '../../core/storage/avatarStore';
import { AvatarCropModal } from './AvatarCropModal';

interface ProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileSheet: React.FC<ProfileSheetProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useClinical();
  const { profile, settings } = state;
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [pendingAvatarDataUrl, setPendingAvatarDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarSrc = resolveProfileAvatarUrl(profile.avatar_url);
  const profileInitial = (profile.display_name || 'Patient').charAt(0).toUpperCase();

  const feedback = (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
    signalFeedback(kind, {
      hapticsEnabled: settings.haptics_enabled,
      audioEnabled: settings.audio_enabled,
    });

  const setViewAndClose = (view: 'consult' | 'history' | 'about') => {
    feedback('select');
    dispatch({ type: 'SET_VIEW', payload: view });
    dispatch({ type: 'CLOSE_SHEETS' });
  };

  const toggleSetting = (payload: Partial<typeof settings>) => {
    feedback('select');
    dispatch({ type: 'UPDATE_SETTINGS', payload });
  };

  const closeSheet = () => {
    feedback('select');
    onClose();
  };

  const openFilePicker = () => {
    feedback('select');
    fileInputRef.current?.click();
  };

  const handleAvatarSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file.');
      }
      if (file.size > MAX_AVATAR_FILE_BYTES) {
        throw new Error('Image is too large. Use a file smaller than 6MB.');
      }
      const dataUrl = await fileToDataUrl(file);
      setPendingAvatarDataUrl(dataUrl);
    } catch (error) {
      console.error('Avatar upload failed:', error);
      signalFeedback('error', {
        hapticsEnabled: settings.haptics_enabled,
        audioEnabled: settings.audio_enabled,
      });
      window.alert(error instanceof Error ? error.message : 'Unable to upload image.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const persistAvatar = (dataUrl: string) => {
    const uri = saveProfileAvatarData(profile.id, dataUrl);
    dispatch({ type: 'UPDATE_PROFILE', payload: { avatar_url: uri } });
    setPendingAvatarDataUrl(null);
    feedback('submit');
  };

  const clearAvatar = () => {
    removeProfileAvatar(profile.id);
    dispatch({ type: 'UPDATE_PROFILE', payload: { avatar_url: '' } });
    feedback('select');
  };

  return (
    <SideSheet isOpen={isOpen} side="left" onClose={closeSheet}>
      <div className="h-full flex flex-col">
        <div className="px-5 pt-2 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-content-dim font-medium">Settings</p>
              <h2 className="display-type text-[2rem] leading-none text-content-primary mt-1">Profile</h2>
            </div>
            <button
              onClick={closeSheet}
              className="h-10 w-10 rounded-full surface-raised flex items-center justify-center focus-glow interactive-tap interactive-soft"
              aria-label="Close profile sheet"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4">
          <section className="surface-raised rounded-[24px] p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-full surface-strong overflow-hidden flex items-center justify-center text-xl font-semibold">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Profile avatar" className="h-full w-full object-cover" />
                ) : (
                  profileInitial
                )}
              </div>
              <div>
                <p className="text-xl font-semibold text-content-primary leading-none">
                  {profile.display_name || 'Patient'}
                </p>
                <p className="text-sm text-content-secondary mt-1">Local profile only</p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelected}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={openFilePicker}
                disabled={isUploadingAvatar}
                className="h-11 rounded-xl surface-strong text-sm font-medium disabled:opacity-50 interactive-tap interactive-soft"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Upload size={14} />
                  {avatarSrc ? 'Replace photo' : 'Upload photo'}
                </span>
              </button>
              <button
                onClick={clearAvatar}
                disabled={!avatarSrc || isUploadingAvatar}
                className="h-11 rounded-xl surface-strong text-sm font-medium disabled:opacity-50 interactive-tap interactive-soft"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 size={14} />
                  Remove
                </span>
              </button>
            </div>
          </section>

          <section className="surface-raised rounded-[24px] p-2">
            <div className="px-3 py-2 text-xs font-semibold text-content-dim uppercase tracking-wide inline-flex items-center gap-1.5">
              <User size={13} />
              Patient Details
            </div>
            <div className="surface-strong rounded-[18px] px-3 py-2">
              <label className="text-xs text-content-dim">Display name</label>
              <input
                value={profile.display_name}
                onChange={(e) => dispatch({ type: 'UPDATE_PROFILE', payload: { display_name: e.target.value } })}
                className="w-full h-10 text-sm text-content-primary"
                placeholder="Patient"
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="surface-strong rounded-[18px] px-3 py-2">
                <label className="text-xs text-content-dim">Age</label>
                <input
                  value={profile.age ?? ''}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_PROFILE',
                      payload: { age: e.target.value ? Number(e.target.value) : undefined },
                    })
                  }
                  type="number"
                  min={0}
                  max={125}
                  className="w-full h-10 text-sm text-content-primary"
                  placeholder="Age"
                />
              </div>
              <div className="surface-strong rounded-[18px] px-3 py-2">
                <label className="text-xs text-content-dim">Sex</label>
                <select
                  value={profile.sex || ''}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_PROFILE',
                      payload: { sex: (e.target.value || undefined) as typeof profile.sex },
                    })
                  }
                  className="w-full h-10 text-sm text-content-primary"
                >
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="intersex">Intersex</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </section>

          <section className="surface-raised rounded-[24px] p-3 space-y-3">
            <div className="text-xs font-semibold text-content-dim uppercase tracking-wide inline-flex items-center gap-1.5">
              <Sparkles size={13} />
              Appearance
            </div>

            <div className="surface-strong rounded-[18px] p-1.5 grid grid-cols-3 gap-1.5">
              {[
                { id: 'system' as const, icon: Monitor, label: 'Auto' },
                { id: 'dark' as const, icon: Moon, label: 'Dark' },
                { id: 'light' as const, icon: Sun, label: 'Light' },
              ].map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => {
                    feedback('select');
                    dispatch({ type: 'SET_THEME', payload: theme.id });
                  }}
                  className={`h-10 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap ${
                    state.theme === theme.id ? 'bg-surface-active text-content-active' : 'surface-chip'
                  }`}
                >
                  <theme.icon size={14} />
                  {theme.label}
                </button>
              ))}
            </div>

            <div className="surface-strong rounded-[18px] p-1.5 grid grid-cols-3 gap-1.5">
              {(['sm', 'md', 'lg'] as const).map((scale) => (
                <button
                  key={scale}
                  onClick={() => toggleSetting({ text_scale: scale })}
                  className={`h-10 rounded-xl text-xs font-semibold uppercase tracking-wide interactive-tap ${
                    settings.text_scale === scale ? 'bg-surface-active text-content-active' : 'surface-chip'
                  }`}
                >
                  {scale}
                </button>
              ))}
            </div>
          </section>

          <section className="surface-raised rounded-[24px] p-3 space-y-2">
            <div className="text-xs font-semibold text-content-dim uppercase tracking-wide">Feedback</div>

            <div className="surface-strong rounded-[18px] px-3 py-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm">
                <Vibrate size={14} />
                Haptics
              </span>
              <ToggleSwitch
                checked={settings.haptics_enabled}
                onToggle={() => toggleSetting({ haptics_enabled: !settings.haptics_enabled })}
                ariaLabel="Toggle haptics"
              />
            </div>

            <div className="surface-strong rounded-[18px] px-3 py-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm">
                <Volume2 size={14} />
                Audio cues
              </span>
              <ToggleSwitch
                checked={settings.audio_enabled}
                onToggle={() => toggleSetting({ audio_enabled: !settings.audio_enabled })}
                ariaLabel="Toggle audio cues"
              />
            </div>

            <div className="surface-strong rounded-[18px] px-3 py-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm">
                <Bell size={14} />
                Notifications
              </span>
              <ToggleSwitch
                checked={settings.notifications_enabled}
                onToggle={() => toggleSetting({ notifications_enabled: !settings.notifications_enabled })}
                ariaLabel="Toggle notifications"
              />
            </div>
          </section>

          <section className="surface-raised rounded-[24px] p-2 pb-3">
            <div className="px-3 py-2 text-xs font-semibold text-content-dim uppercase tracking-wide">Quick Navigation</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setViewAndClose('consult')}
                className="h-[60px] rounded-[18px] surface-strong inline-flex flex-col items-center justify-center gap-1.5 text-xs font-medium interactive-tap interactive-soft"
              >
                <Stethoscope size={15} />
                Consult
              </button>
              <button
                onClick={() => setViewAndClose('history')}
                className="h-[60px] rounded-[18px] surface-strong inline-flex flex-col items-center justify-center gap-1.5 text-xs font-medium interactive-tap interactive-soft"
              >
                <History size={15} />
                History
              </button>
              <button
                onClick={() => setViewAndClose('about')}
                className="h-[60px] rounded-[18px] surface-strong inline-flex flex-col items-center justify-center gap-1.5 text-xs font-medium interactive-tap interactive-soft"
              >
                <Info size={15} />
                About
              </button>
            </div>
          </section>
        </div>
      </div>

      <AvatarCropModal
        isOpen={!!pendingAvatarDataUrl}
        imageDataUrl={pendingAvatarDataUrl}
        onClose={() => setPendingAvatarDataUrl(null)}
        onSkipCrop={() => {
          if (pendingAvatarDataUrl) {
            persistAvatar(pendingAvatarDataUrl);
          }
        }}
        onConfirmCrop={persistAvatar}
      />
    </SideSheet>
  );
};
