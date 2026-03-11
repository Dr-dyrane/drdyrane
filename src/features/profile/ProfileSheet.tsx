import React, { useRef, useState } from 'react';
import { User, Settings2, Info, History, Stethoscope, Upload, Trash2, X } from 'lucide-react';
import { SideSheet } from '../../components/shared/SideSheet';
import { useClinical } from '../../core/context/ClinicalContext';
import { ToggleSwitch } from '../../components/shared/ToggleSwitch';
import { signalFeedback } from '../../core/services/feedback';
import {
  fileToDataUrl,
  MAX_AVATAR_FILE_BYTES,
  resolveProfileAvatarUrl,
  saveProfileAvatarData,
  removeProfileAvatar,
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
  const feedback = () =>
    signalFeedback('select', {
      hapticsEnabled: settings.haptics_enabled,
      audioEnabled: settings.audio_enabled,
    });

  const setViewAndClose = (view: 'consult' | 'history' | 'about') => {
    feedback();
    dispatch({ type: 'SET_VIEW', payload: view });
    dispatch({ type: 'CLOSE_SHEETS' });
  };

  const toggleSetting = (payload: Partial<typeof settings>) => {
    feedback();
    dispatch({ type: 'UPDATE_SETTINGS', payload });
  };

  const openFilePicker = () => {
    feedback();
    fileInputRef.current?.click();
  };

  const closeSheet = () => {
    feedback();
    onClose();
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
    feedback();
  };

  const clearAvatar = () => {
    removeProfileAvatar(profile.id);
    dispatch({ type: 'UPDATE_PROFILE', payload: { avatar_url: '' } });
    feedback();
  };

  return (
    <SideSheet isOpen={isOpen} side="left" onClose={closeSheet}>
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-5">
          <span className="text-[10px] uppercase tracking-[0.24em] text-content-dim font-semibold">Profile</span>
          <button onClick={closeSheet} className="h-9 w-9 rounded-full surface-raised flex items-center justify-center focus-glow interactive-tap interactive-soft">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-5 space-y-5">
          <section className="surface-raised rounded-[24px] p-4 shadow-glass">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full surface-strong overflow-hidden flex items-center justify-center">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Profile avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{profile.display_name?.charAt(0) || 'P'}</span>
                )}
              </div>
              <div className="space-y-1">
                <p className="display-type text-xl">{profile.display_name || 'Patient'}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Dr Dyrane Memory Profile</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <User size={14} className="text-neon-cyan/80" />
              <span className="text-[10px] uppercase tracking-[0.22em] text-content-dim font-semibold">Patient Details</span>
            </div>
            <div className="surface-raised rounded-[24px] p-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Display name</span>
                <input
                  value={profile.display_name}
                  onChange={(e) => dispatch({ type: 'UPDATE_PROFILE', payload: { display_name: e.target.value } })}
                  className="w-full px-3 py-2 rounded-xl surface-strong text-sm"
                />
              </label>
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Profile photo</span>
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
                    className="h-10 rounded-xl surface-strong text-[10px] uppercase tracking-[0.2em] text-content-primary disabled:opacity-50 interactive-tap interactive-soft"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Upload size={12} /> {avatarSrc ? 'Replace' : 'Upload'}
                    </span>
                  </button>
                  <button
                    onClick={clearAvatar}
                    disabled={!avatarSrc || isUploadingAvatar}
                    className="h-10 rounded-xl surface-strong text-[10px] uppercase tracking-[0.2em] text-content-primary disabled:opacity-45 interactive-tap interactive-soft"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Trash2 size={12} /> Remove
                    </span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Age</span>
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
                    className="w-full px-3 py-2 rounded-xl surface-strong text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">Sex</span>
                  <select
                    value={profile.sex || ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_PROFILE',
                        payload: {
                          sex: (e.target.value || undefined) as typeof profile.sex,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl surface-strong text-sm"
                  >
                    <option value="">Select</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="intersex">Intersex</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Settings2 size={14} className="text-neon-cyan/80" />
              <span className="text-[10px] uppercase tracking-[0.22em] text-content-dim font-semibold">Settings</span>
            </div>
            <div className="surface-raised rounded-[24px] p-4 space-y-3">
              <button
                onClick={() => {
                  feedback();
                  dispatch({ type: 'TOGGLE_THEME' });
                }}
                className="w-full flex items-center justify-between px-3 py-3 rounded-xl surface-strong text-sm focus-glow interactive-tap interactive-soft"
              >
                <span>Theme</span>
                <span>{state.theme === 'dark' ? 'Dark' : 'Light'}</span>
              </button>
              <div className="flex items-center justify-between px-3 py-3 rounded-xl surface-strong text-sm">
                <span>Haptics</span>
                <ToggleSwitch
                  checked={settings.haptics_enabled}
                  onToggle={() => toggleSetting({ haptics_enabled: !settings.haptics_enabled })}
                  ariaLabel="Toggle haptics"
                />
              </div>
              <div className="flex items-center justify-between px-3 py-3 rounded-xl surface-strong text-sm">
                <span>Audio cues</span>
                <ToggleSwitch
                  checked={settings.audio_enabled}
                  onToggle={() => toggleSetting({ audio_enabled: !settings.audio_enabled })}
                  ariaLabel="Toggle audio cues"
                />
              </div>
              <div className="flex items-center justify-between px-3 py-3 rounded-xl surface-strong text-sm">
                <span>Reduced motion</span>
                <ToggleSwitch
                  checked={settings.reduced_motion}
                  onToggle={() => toggleSetting({ reduced_motion: !settings.reduced_motion })}
                  ariaLabel="Toggle reduced motion"
                />
              </div>
              <div className="flex items-center justify-between px-3 py-3 rounded-xl surface-strong text-sm">
                <span>Notifications</span>
                <ToggleSwitch
                  checked={settings.notifications_enabled}
                  onToggle={() => toggleSetting({ notifications_enabled: !settings.notifications_enabled })}
                  ariaLabel="Toggle notifications"
                />
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl surface-strong text-sm">
                <span>Text scale</span>
                <div className="flex gap-1">
                  {(['sm', 'md', 'lg'] as const).map((scale) => (
                    <button
                      key={scale}
                      onClick={() => toggleSetting({ text_scale: scale })}
                      className={`h-7 px-2 rounded-lg text-[10px] uppercase tracking-[0.18em] interactive-tap ${
                        settings.text_scale === scale ? 'bg-surface-active text-content-active' : 'surface-raised'
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 pb-6">
            <div className="flex items-center gap-2 px-1">
              <Info size={14} className="text-neon-cyan/80" />
              <span className="text-[10px] uppercase tracking-[0.22em] text-content-dim font-semibold">Helper Pages</span>
            </div>
            <div className="surface-raised rounded-[24px] p-4 space-y-2">
              <button onClick={() => setViewAndClose('consult')} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl surface-strong text-sm interactive-tap interactive-soft">
                <Stethoscope size={14} /> Consult
              </button>
              <button onClick={() => setViewAndClose('history')} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl surface-strong text-sm interactive-tap interactive-soft">
                <History size={14} /> History
              </button>
              <button onClick={() => setViewAndClose('about')} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl surface-strong text-sm interactive-tap interactive-soft">
                <Info size={14} /> About
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
