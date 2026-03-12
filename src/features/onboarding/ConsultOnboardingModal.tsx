import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronRight, Scale, UserRound, X } from 'lucide-react';
import { OverlayPortal } from '../../components/shared/OverlayPortal';
import { useClinical } from '../../core/context/ClinicalContext';
import { UserProfile } from '../../core/types/clinical';
import {
  getProfileOnboardingProgress,
  isProfileOnboardingComplete,
} from '../../core/profile/onboarding';

type StepId = 'name' | 'age' | 'sex' | 'clinical';

interface ConsultOnboardingModalProps {
  isOpen: boolean;
  forceRequired?: boolean;
  onClose: () => void;
}

const STEP_ORDER: StepId[] = ['name', 'age', 'sex', 'clinical'];

const parseAge = (value: string): number | undefined => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 125) return undefined;
  return parsed;
};

const parseWeight = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 300) return undefined;
  return Math.round(parsed * 10) / 10;
};

const firstMissingStep = (profile: UserProfile): number => {
  const progress = getProfileOnboardingProgress(profile);
  if (progress.missing.includes('name')) return STEP_ORDER.indexOf('name');
  if (progress.missing.includes('age')) return STEP_ORDER.indexOf('age');
  if (progress.missing.includes('sex')) return STEP_ORDER.indexOf('sex');
  return STEP_ORDER.indexOf('clinical');
};

export const ConsultOnboardingModal: React.FC<ConsultOnboardingModalProps> = ({
  isOpen,
  forceRequired = false,
  onClose,
}) => {
  const { state, dispatch } = useClinical();
  const profile = state.profile;
  const [stepIndex, setStepIndex] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [ageInput, setAgeInput] = useState('');
  const [sex, setSex] = useState<UserProfile['sex'] | ''>('');
  const [weightInput, setWeightInput] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
  const [medications, setMedications] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(profile.display_name && profile.display_name !== 'Patient' ? profile.display_name : '');
    setAgeInput(profile.age !== undefined ? String(profile.age) : '');
    setSex(profile.sex || '');
    setWeightInput(profile.weight_kg !== undefined ? String(profile.weight_kg) : '');
    setAllergies(profile.allergies || '');
    setChronicConditions(profile.chronic_conditions || '');
    setMedications(profile.medications || '');
    setStepIndex(firstMissingStep(profile));
  }, [isOpen, profile]);

  const requiredProgress = useMemo(
    () =>
      getProfileOnboardingProgress({
        ...profile,
        display_name: displayName.trim() || profile.display_name,
        age: parseAge(ageInput) ?? profile.age,
        sex: (sex || profile.sex) as UserProfile['sex'] | undefined,
      }),
    [ageInput, displayName, profile, sex]
  );

  const step = STEP_ORDER[stepIndex];
  const closeAllowed = !forceRequired || requiredProgress.completed === requiredProgress.total;

  const canContinue = (() => {
    if (step === 'name') return displayName.trim().length > 0;
    if (step === 'age') return parseAge(ageInput) !== undefined;
    if (step === 'sex') return Boolean(sex);
    return true;
  })();

  const persistDraft = () => {
    const patch: Partial<UserProfile> = {
      display_name: displayName.trim() || profile.display_name,
      age: parseAge(ageInput),
      sex: (sex || undefined) as UserProfile['sex'] | undefined,
      weight_kg: parseWeight(weightInput),
      allergies: allergies.trim() || undefined,
      chronic_conditions: chronicConditions.trim() || undefined,
      medications: medications.trim() || undefined,
    };
    dispatch({ type: 'UPDATE_PROFILE', payload: patch });
  };

  const finishOnboarding = () => {
    const beforeComplete = isProfileOnboardingComplete(profile);
    persistDraft();
    const afterComplete = isProfileOnboardingComplete({
      ...profile,
      display_name: displayName.trim() || profile.display_name,
      age: parseAge(ageInput),
      sex: (sex || undefined) as UserProfile['sex'] | undefined,
    });
    if (!beforeComplete && afterComplete) {
      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          title: 'Intake Profile Ready',
          body: 'Your consultation profile is complete and now used to personalize diagnosis and treatment.',
        },
      });
    }
    onClose();
  };

  const goNext = () => {
    if (!canContinue) return;
    persistDraft();
    if (stepIndex >= STEP_ORDER.length - 1) {
      finishOnboarding();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEP_ORDER.length - 1));
  };

  const goBack = () => setStepIndex((current) => Math.max(0, current - 1));

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (closeAllowed) onClose();
              }}
              className="fixed inset-0 z-[180] overlay-backdrop backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="fixed inset-x-0 bottom-0 max-w-[440px] mx-auto z-[190] rounded-t-[30px] ios-sheet-surface shadow-modal pointer-events-auto"
            >
              <div className="flex items-center justify-center pt-2 pb-1">
                <span className="h-1 w-12 rounded-full surface-chip" />
              </div>

              <div className="px-5 py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-content-dim">Consultation Intake</p>
                  <h2 className="display-type text-[1.45rem] leading-tight text-content-primary mt-1">
                    Complete Your Profile
                  </h2>
                  <p className="text-xs text-content-secondary mt-1">
                    {requiredProgress.completed}/{requiredProgress.total} required details complete
                  </p>
                </div>
                {closeAllowed && (
                  <button
                    onClick={onClose}
                    className="h-10 w-10 rounded-full surface-strong inline-flex items-center justify-center interactive-tap interactive-soft"
                    aria-label="Close onboarding"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="px-5">
                <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(requiredProgress.ratio * 100)}%` }}
                    transition={{ type: 'spring', damping: 30, stiffness: 220 }}
                    className="h-full bg-surface-active"
                  />
                </div>
              </div>

              <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
                {step === 'name' && (
                  <div className="surface-raised rounded-[22px] p-4 space-y-3">
                    <p className="text-xs text-content-dim inline-flex items-center gap-1.5">
                      <UserRound size={13} />
                      Required
                    </p>
                    <p className="text-sm text-content-primary">What should the doctor call you?</p>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') goNext();
                      }}
                      autoFocus
                      className="w-full h-12 px-3 rounded-xl surface-strong text-sm text-content-primary focus-glow"
                      placeholder="Your name"
                    />
                  </div>
                )}

                {step === 'age' && (
                  <div className="surface-raised rounded-[22px] p-4 space-y-3">
                    <p className="text-xs text-content-dim inline-flex items-center gap-1.5">
                      <CalendarDays size={13} />
                      Required
                    </p>
                    <p className="text-sm text-content-primary">How old are you?</p>
                    <input
                      value={ageInput}
                      onChange={(event) => setAgeInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') goNext();
                      }}
                      type="number"
                      min={0}
                      max={125}
                      autoFocus
                      className="w-full h-12 px-3 rounded-xl surface-strong text-sm text-content-primary focus-glow"
                      placeholder="Age"
                    />
                  </div>
                )}

                {step === 'sex' && (
                  <div className="surface-raised rounded-[22px] p-4 space-y-3">
                    <p className="text-xs text-content-dim inline-flex items-center gap-1.5">
                      <UserRound size={13} />
                      Required
                    </p>
                    <p className="text-sm text-content-primary">Select sex for clinical relevance.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'female', label: 'Female' },
                        { id: 'male', label: 'Male' },
                        { id: 'intersex', label: 'Intersex' },
                        { id: 'prefer_not_to_say', label: 'Prefer Not To Say' },
                      ].map((option) => {
                        const isSelected = sex === option.id;
                        return (
                          <button
                            key={option.id}
                            onClick={() => setSex(option.id as UserProfile['sex'])}
                            className={`h-11 rounded-xl text-sm font-medium transition-all interactive-tap ${
                              isSelected
                                ? 'bg-surface-active text-content-active'
                                : 'surface-strong text-content-primary'
                            }`}
                            aria-pressed={isSelected}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {step === 'clinical' && (
                  <div className="surface-raised rounded-[22px] p-4 space-y-3">
                    <p className="text-xs text-content-dim inline-flex items-center gap-1.5">
                      <Scale size={13} />
                      Optional but useful
                    </p>
                    <p className="text-sm text-content-primary">
                      Add clinical details for better dosing and recommendations.
                    </p>
                    <div className="space-y-2">
                      <input
                        value={weightInput}
                        onChange={(event) => setWeightInput(event.target.value)}
                        type="number"
                        min={1}
                        max={300}
                        step="0.1"
                        className="w-full h-11 px-3 rounded-xl surface-strong text-sm text-content-primary focus-glow"
                        placeholder="Weight (kg)"
                      />
                      <input
                        value={allergies}
                        onChange={(event) => setAllergies(event.target.value)}
                        className="w-full h-11 px-3 rounded-xl surface-strong text-sm text-content-primary focus-glow"
                        placeholder="Allergies"
                      />
                      <input
                        value={chronicConditions}
                        onChange={(event) => setChronicConditions(event.target.value)}
                        className="w-full h-11 px-3 rounded-xl surface-strong text-sm text-content-primary focus-glow"
                        placeholder="Chronic conditions"
                      />
                      <input
                        value={medications}
                        onChange={(event) => setMedications(event.target.value)}
                        className="w-full h-11 px-3 rounded-xl surface-strong text-sm text-content-primary focus-glow"
                        placeholder="Current medications"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.1rem)] pt-1 flex items-center gap-2">
                <button
                  onClick={goBack}
                  disabled={stepIndex === 0}
                  className="h-11 px-4 rounded-xl surface-strong text-sm text-content-secondary disabled:opacity-45 interactive-tap interactive-soft"
                >
                  Back
                </button>
                <button
                  onClick={goNext}
                  disabled={!canContinue}
                  className="flex-1 h-11 rounded-xl cta-live text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {stepIndex >= STEP_ORDER.length - 1 ? 'Begin Consultation' : 'Continue'}
                  <ChevronRight size={14} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

