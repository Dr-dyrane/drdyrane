import { playCelebrationFromSettings } from './celebration';

type FeedbackKind = 'select' | 'submit' | 'question' | 'error' | 'complete';
type MotionStyle = 'subtle' | 'balanced' | 'expressive';
interface FeedbackPreferences {
  hapticsEnabled?: boolean;
  audioEnabled?: boolean;
  reducedMotion?: boolean;
  motionStyle?: MotionStyle;
  gratificationEnabled?: boolean;
  celebrationX?: number;
  celebrationY?: number;
}

const VIBRATION_PATTERN: Record<FeedbackKind, number | number[]> = {
  select: 8,
  submit: [10, 20, 12],
  question: [6, 12, 6],
  error: [18, 30, 18],
  complete: [12, 30, 12, 30, 12],
};

const AUDIO_SEQUENCES: Record<FeedbackKind, number[]> = {
  // Fibonacci-adjacent intervals for a restrained "mathematical" tone identity.
  select: [377],
  submit: [377, 610],
  question: [233.08, 377],
  error: [220, 196],
  complete: [233.08, 377, 610],
};

const LOADING_PHASE_NOTES = [233.08, 317.81, 377];

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;

  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext ?? w.webkitAudioContext;
  if (!AudioContextConstructor) return null;

  if (!audioContext) {
    audioContext = new AudioContextConstructor();
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => undefined);
  }

  return audioContext;
};

const scheduleTone = (
  context: AudioContext,
  frequency: number,
  startOffsetSeconds: number,
  durationSeconds: number,
  peakGain: number
) => {
  const startTime = context.currentTime + startOffsetSeconds;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds + 0.03);
};

const safeVibrate = (pattern: number | number[], enabled: boolean) => {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(pattern);
};

const resolveMotionStyle = (value?: string | null): MotionStyle => {
  if (value === 'subtle' || value === 'expressive' || value === 'balanced') return value;
  return 'balanced';
};

const resolveRuntimeInteractionPrefs = (
  prefs: FeedbackPreferences
): { reducedMotion: boolean; motionStyle: MotionStyle; gratificationEnabled: boolean } => {
  if (typeof document === 'undefined') {
    return {
      reducedMotion: prefs.reducedMotion ?? false,
      motionStyle: resolveMotionStyle(prefs.motionStyle),
      gratificationEnabled: prefs.gratificationEnabled ?? false,
    };
  }

  const root = document.documentElement;
  const reducedMotionFromDom = root.getAttribute('data-reduced-motion') === 'true';
  const motionStyleFromDom = resolveMotionStyle(root.getAttribute('data-motion-style'));
  const gratificationFromDom = root.getAttribute('data-gratification-enabled') !== 'false';

  return {
    reducedMotion: prefs.reducedMotion ?? reducedMotionFromDom,
    motionStyle: prefs.motionStyle ?? motionStyleFromDom,
    gratificationEnabled: prefs.gratificationEnabled ?? gratificationFromDom,
  };
};

const FEEDBACK_BURST_INTENSITY: Record<Exclude<FeedbackKind, 'error'>, 'soft' | 'medium' | 'strong'> = {
  select: 'soft',
  submit: 'medium',
  question: 'soft',
  complete: 'strong',
};

export const signalFeedback = (kind: FeedbackKind, prefs: FeedbackPreferences = {}): void => {
  const hapticsEnabled = prefs.hapticsEnabled ?? true;
  const audioEnabled = prefs.audioEnabled ?? true;
  const interactionPrefs = resolveRuntimeInteractionPrefs(prefs);

  if (kind !== 'error' && interactionPrefs.gratificationEnabled) {
    playCelebrationFromSettings(
      {
        reduced_motion: interactionPrefs.reducedMotion,
        motion_style: interactionPrefs.motionStyle,
        gratification_enabled: interactionPrefs.gratificationEnabled,
      },
      {
        intensity: FEEDBACK_BURST_INTENSITY[kind],
        x: prefs.celebrationX,
        y: prefs.celebrationY,
      }
    );
  }

  safeVibrate(VIBRATION_PATTERN[kind], hapticsEnabled);

  if (!audioEnabled) return;
  const context = getAudioContext();
  if (!context) return;

  const notes = AUDIO_SEQUENCES[kind];
  notes.forEach((frequency, index) => {
    scheduleTone(context, frequency, index * 0.06, 0.08, 0.022);
  });
};

export const playLoadingPhaseCue = (phaseIndex: number, prefs: FeedbackPreferences = {}): void => {
  const audioEnabled = prefs.audioEnabled ?? true;
  if (!audioEnabled) return;

  const context = getAudioContext();
  if (!context) return;

  const frequency = LOADING_PHASE_NOTES[phaseIndex % LOADING_PHASE_NOTES.length];
  scheduleTone(context, frequency, 0, 0.07, 0.012);
};
