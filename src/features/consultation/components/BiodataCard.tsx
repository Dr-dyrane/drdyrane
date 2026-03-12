import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, SkipForward, X } from 'lucide-react';
import { ClinicalState } from '../../../core/types/clinical';

type BiodataStep = 'name' | 'age' | 'sex' | null;
type ProfileSex = NonNullable<ClinicalState['profile']['sex']>;

interface BiodataCardProps {
  visible: boolean;
  step: BiodataStep;
  value: string;
  canSubmit: boolean;
  selectedSex?: ClinicalState['profile']['sex'];
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onSelectSex: (sex: ProfileSex) => void;
  onSkip: () => void;
}

export const BiodataCard: React.FC<BiodataCardProps> = ({
  visible,
  step,
  value,
  canSubmit,
  selectedSex,
  onValueChange,
  onSubmit,
  onSelectSex,
  onSkip,
}) => (
  <AnimatePresence>
    {visible && step && (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="w-full surface-raised rounded-[24px] p-4 mb-4 space-y-3 shadow-glass"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-content-dim font-medium">
            Optional details
          </p>
          <button
            onClick={onSkip}
            className="h-8 w-8 rounded-full surface-strong flex items-center justify-center interactive-tap"
            aria-label="Skip biodata"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-sm text-content-secondary">
          {step === 'name' && 'What should I call you in this consultation?'}
          {step === 'age' && 'How old are you?'}
          {step === 'sex' && 'Select your sex to improve diagnostic relevance.'}
        </p>

        {step === 'name' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                className="flex-1 h-11 px-3 rounded-xl surface-strong text-sm focus-glow"
                placeholder="Your name"
              />
              <button
                onClick={onSkip}
                className="h-11 w-11 rounded-xl surface-strong flex items-center justify-center text-content-dim interactive-tap"
                aria-label="Skip biodata for now"
              >
                <SkipForward size={14} />
              </button>
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                className="h-11 w-11 rounded-xl cta-live-icon flex items-center justify-center disabled:opacity-45 interactive-tap"
                aria-label="Save name"
              >
                <ArrowDownToLine size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 'age' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                type="number"
                min={0}
                max={125}
                className="flex-1 h-11 px-3 rounded-xl surface-strong text-sm focus-glow"
                placeholder="Age"
              />
              <button
                onClick={onSkip}
                className="h-11 w-11 rounded-xl surface-strong flex items-center justify-center text-content-dim interactive-tap"
                aria-label="Skip biodata for now"
              >
                <SkipForward size={14} />
              </button>
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                className="h-11 w-11 rounded-xl cta-live-icon flex items-center justify-center disabled:opacity-45 interactive-tap"
                aria-label="Save age"
              >
                <ArrowDownToLine size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 'sex' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'female', label: 'Female' },
                { id: 'male', label: 'Male' },
                { id: 'intersex', label: 'Intersex' },
                { id: 'prefer_not_to_say', label: 'Prefer Not' },
              ].map((option) => {
                const isSelected = selectedSex === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => onSelectSex(option.id as ProfileSex)}
                    className={`h-10 rounded-xl text-sm font-medium transition-all interactive-tap ${
                      isSelected
                        ? 'bg-surface-active text-content-active shadow-glass'
                        : 'surface-strong text-content-primary'
                    }`}
                    aria-pressed={isSelected}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                onClick={onSkip}
                className="h-10 w-10 rounded-xl surface-strong flex items-center justify-center text-content-dim interactive-tap"
                aria-label="Skip biodata for now"
              >
                <SkipForward size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    )}
  </AnimatePresence>
);

