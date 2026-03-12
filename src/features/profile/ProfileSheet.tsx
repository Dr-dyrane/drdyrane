import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  History,
  Info,
  Monitor,
  Moon,
  Pill,
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

const panelVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

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

  const setViewAndClose = (view: 'consult' | 'history' | 'drug' | 'about') => {
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
            <motion.button
              onClick={closeSheet}
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.96 }}
              className="h-10 w-10 rounded-full surface-raised flex items-center justify-center focus-glow interactive-tap interactive-soft"
              aria-label="Close profile sheet"
            >
              <X size={16} />
            </motion.button>
          </div>
        </div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={panelVariants}
          className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4"
        >
          <motion.section variants={sectionVariants} className="surface-raised rounded-[24px] p-4 space-y-4">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="h-16 w-16 rounded-full surface-strong overflow-hidden flex items-center justify-center text-xl font-semibold"
              >
                <AnimatePresence mode="wait">
                  {avatarSrc ? (
                    <motion.img
                      key={avatarSrc}
                      initial={{ opacity: 0.4, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      src={avatarSrc}
                      alt="Profile avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <motion.span
                      key="profile-initial"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {profileInitial}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
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
              <motion.button
                onClick={openFilePicker}
                disabled={isUploadingAvatar}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="h-11 rounded-xl surface-strong text-sm font-medium disabled:opacity-50 interactive-tap interactive-soft"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Upload size={14} />
                  {isUploadingAvatar ? 'Preparing image...' : avatarSrc ? 'Replace photo' : 'Upload photo'}
                </span>
              </motion.button>
              <motion.button
                onClick={clearAvatar}
                disabled={!avatarSrc || isUploadingAvatar}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="h-11 rounded-xl surface-strong text-sm font-medium disabled:opacity-50 interactive-tap interactive-soft"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 size={14} />
                  Remove
                </span>
              </motion.button>
            </div>

            <AnimatePresence>
              {isUploadingAvatar && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-content-dim"
                >
                  Processing avatar...
                </motion.p>
              )}
            </AnimatePresence>
          </motion.section>

          <motion.section variants={sectionVariants} className="surface-raised rounded-[24px] p-2">
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
              <div className="surface-strong rounded-[18px] px-3 py-2 col-span-2">
                <label className="text-xs text-content-dim">Weight (kg)</label>
                <input
                  value={profile.weight_kg ?? ''}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_PROFILE',
                      payload: {
                        weight_kg: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                  type="number"
                  min={1}
                  max={300}
                  step="0.1"
                  className="w-full h-10 text-sm text-content-primary"
                  placeholder="Required for pediatric dosing"
                />
              </div>
            </div>
          </motion.section>

          <motion.section variants={sectionVariants} className="surface-raised rounded-[24px] p-3 space-y-3">
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
                <motion.button
                  key={theme.id}
                  onClick={() => {
                    feedback('select');
                    dispatch({ type: 'SET_THEME', payload: theme.id });
                  }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className={`relative h-10 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap ${
                    state.theme === theme.id ? 'text-content-active' : 'text-content-secondary'
                  }`}
                >
                  {state.theme === theme.id && (
                    <motion.span
                      layoutId="theme-option-pill"
                      className="absolute inset-0 rounded-xl bg-surface-active selected-elevation"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {state.theme !== theme.id && <span className="absolute inset-0 rounded-xl surface-chip" />}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <theme.icon size={14} />
                    {theme.label}
                  </span>
                </motion.button>
              ))}
            </div>

            <div className="surface-strong rounded-[18px] p-1.5 grid grid-cols-3 gap-1.5">
              {(['sm', 'md', 'lg'] as const).map((scale) => (
                <motion.button
                  key={scale}
                  onClick={() => toggleSetting({ text_scale: scale })}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className={`relative h-10 rounded-xl text-xs font-semibold uppercase tracking-wide interactive-tap ${
                    settings.text_scale === scale ? 'text-content-active' : 'text-content-secondary'
                  }`}
                >
                  {settings.text_scale === scale && (
                    <motion.span
                      layoutId="text-scale-option-pill"
                      className="absolute inset-0 rounded-xl bg-surface-active selected-elevation"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {settings.text_scale !== scale && <span className="absolute inset-0 rounded-xl surface-chip" />}
                  <span className="relative z-10">{scale}</span>
                </motion.button>
              ))}
            </div>
          </motion.section>

          <motion.section variants={sectionVariants} className="surface-raised rounded-[24px] p-3 space-y-2">
            <div className="text-xs font-semibold text-content-dim uppercase tracking-wide">Feedback</div>

            <motion.div
              whileHover={{ y: -1 }}
              className="surface-strong rounded-[18px] px-3 py-2 flex items-center justify-between"
            >
              <span className="inline-flex items-center gap-2 text-sm">
                <Vibrate size={14} />
                Haptics
              </span>
              <ToggleSwitch
                checked={settings.haptics_enabled}
                onToggle={() => toggleSetting({ haptics_enabled: !settings.haptics_enabled })}
                ariaLabel="Toggle haptics"
              />
            </motion.div>

            <motion.div
              whileHover={{ y: -1 }}
              className="surface-strong rounded-[18px] px-3 py-2 flex items-center justify-between"
            >
              <span className="inline-flex items-center gap-2 text-sm">
                <Volume2 size={14} />
                Audio cues
              </span>
              <ToggleSwitch
                checked={settings.audio_enabled}
                onToggle={() => toggleSetting({ audio_enabled: !settings.audio_enabled })}
                ariaLabel="Toggle audio cues"
              />
            </motion.div>

            <motion.div
              whileHover={{ y: -1 }}
              className="surface-strong rounded-[18px] px-3 py-2 flex items-center justify-between"
            >
              <span className="inline-flex items-center gap-2 text-sm">
                <Bell size={14} />
                Notifications
              </span>
              <ToggleSwitch
                checked={settings.notifications_enabled}
                onToggle={() => toggleSetting({ notifications_enabled: !settings.notifications_enabled })}
                ariaLabel="Toggle notifications"
              />
            </motion.div>
          </motion.section>

          <motion.section variants={sectionVariants} className="surface-raised rounded-[24px] p-2 pb-3">
            <div className="px-3 py-2 text-xs font-semibold text-content-dim uppercase tracking-wide">Quick Navigation</div>
            <div className="grid grid-cols-4 gap-2">
              <motion.button
                onClick={() => setViewAndClose('consult')}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className={`relative h-[60px] rounded-[18px] inline-flex flex-col items-center justify-center gap-1.5 text-xs font-medium interactive-tap interactive-soft ${
                  state.view === 'consult' ? 'text-content-active' : 'text-content-primary'
                }`}
              >
                {state.view === 'consult' ? (
                  <motion.span
                    layoutId="profile-nav-pill"
                    className="absolute inset-0 rounded-[18px] bg-surface-active selected-elevation"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : (
                  <span className="absolute inset-0 rounded-[18px] surface-strong" />
                )}
                <span className="relative z-10 inline-flex flex-col items-center gap-1.5">
                  <Stethoscope size={15} />
                  Consult
                </span>
              </motion.button>

              <motion.button
                onClick={() => setViewAndClose('history')}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className={`relative h-[60px] rounded-[18px] inline-flex flex-col items-center justify-center gap-1.5 text-xs font-medium interactive-tap interactive-soft ${
                  state.view === 'history' ? 'text-content-active' : 'text-content-primary'
                }`}
              >
                {state.view === 'history' ? (
                  <motion.span
                    layoutId="profile-nav-pill"
                    className="absolute inset-0 rounded-[18px] bg-surface-active selected-elevation"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : (
                  <span className="absolute inset-0 rounded-[18px] surface-strong" />
                )}
                <span className="relative z-10 inline-flex flex-col items-center gap-1.5">
                  <History size={15} />
                  History
                </span>
              </motion.button>

              <motion.button
                onClick={() => setViewAndClose('about')}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className={`relative h-[60px] rounded-[18px] inline-flex flex-col items-center justify-center gap-1.5 text-xs font-medium interactive-tap interactive-soft ${
                  state.view === 'about' ? 'text-content-active' : 'text-content-primary'
                }`}
              >
                {state.view === 'about' ? (
                  <motion.span
                    layoutId="profile-nav-pill"
                    className="absolute inset-0 rounded-[18px] bg-surface-active selected-elevation"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : (
                  <span className="absolute inset-0 rounded-[18px] surface-strong" />
                )}
                <span className="relative z-10 inline-flex flex-col items-center gap-1.5">
                  <Info size={15} />
                  About
                </span>
              </motion.button>

              <motion.button
                onClick={() => setViewAndClose('drug')}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className={`relative h-[60px] rounded-[18px] inline-flex flex-col items-center justify-center gap-1.5 text-xs font-medium interactive-tap interactive-soft ${
                  state.view === 'drug' ? 'text-content-active' : 'text-content-primary'
                }`}
              >
                {state.view === 'drug' ? (
                  <motion.span
                    layoutId="profile-nav-pill"
                    className="absolute inset-0 rounded-[18px] bg-surface-active selected-elevation"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : (
                  <span className="absolute inset-0 rounded-[18px] surface-strong" />
                )}
                <span className="relative z-10 inline-flex flex-col items-center gap-1.5">
                  <Pill size={15} />
                  Drug
                </span>
              </motion.button>
            </div>
          </motion.section>
        </motion.div>
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
