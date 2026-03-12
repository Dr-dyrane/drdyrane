import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ResponseOptions } from '../../../core/types/clinical';

interface ResponseOptionsPanelProps {
  responseOptions: ResponseOptions | null;
  selectedOptionIds: string[];
  onSelect: (optionId: string, event?: React.MouseEvent<HTMLButtonElement>) => void;
  onSubmitSingle: () => void;
  onSubmitMultiple: () => void;
  loading?: boolean;
}

const getGridByVariant = (variant: ResponseOptions['ui_variant'], count: number): string => {
  if (variant === 'binary' || variant === 'segmented') return count >= 3 ? 'grid-cols-3' : 'grid-cols-2';
  if (variant === 'grid') return count > 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1';
  if (variant === 'chips') return 'grid-cols-2';
  return 'grid-cols-1';
};

const isSeverityOptionSet = (options: ResponseOptions['options']): boolean => {
  const normalized = options.map((option) => option.text.toLowerCase());
  return normalized.some((value) => value.includes('mild')) && normalized.some((value) => value.includes('severe'));
};

const getVariant = (responseOptions: ResponseOptions): NonNullable<ResponseOptions['ui_variant']> => {
  if (responseOptions.ui_variant) return responseOptions.ui_variant;
  if (responseOptions.options.length <= 3 && responseOptions.mode === 'single') return 'segmented';
  if (responseOptions.options.length >= 6) return 'grid';
  if (isSeverityOptionSet(responseOptions.options)) return 'ladder';
  return 'stack';
};

const getOptionClass = (variant: NonNullable<ResponseOptions['ui_variant']>): string => {
  const base =
    'option-button option-live option-live-smooth option-live-bounce relative overflow-hidden transition-all duration-300 text-center group focus-glow disabled:opacity-50 disabled:cursor-not-allowed';

  if (variant === 'binary' || variant === 'segmented') return `${base} min-h-12 rounded-[16px] px-3 py-3`;
  if (variant === 'chips') return `${base} min-h-12 rounded-full px-4 py-3 surface-raised shadow-glass`;
  if (variant === 'grid') return `${base} min-h-20 rounded-3xl px-4 py-6 surface-raised shadow-glass`;
  if (variant === 'ladder') return `${base} min-h-14 rounded-2xl px-4 py-4 text-left surface-raised shadow-glass`;
  return `${base} min-h-16 rounded-2xl px-4 py-5 surface-raised shadow-glass`;
};

const getToneClass = (index: number): string => {
  const tones = ['option-tone-cyan', 'option-tone-mint', 'option-tone-amber', 'option-tone-rose'];
  return tones[index % tones.length];
};

const getOptionMarker = (index: number): string => {
  const markers = ['*', '+', '^', '~', 'o', '>'];
  return markers[index % markers.length];
};

const getSelectedSingleOption = (
  responseOptions: ResponseOptions,
  selectedOptionIds: string[]
): ResponseOptions['options'][number] | null => {
  const id = selectedOptionIds[0];
  if (!id) return null;
  return responseOptions.options.find((option) => option.id === id) || null;
};

const SPRING_CONFIG = { type: 'spring' as const, stiffness: 320, damping: 28 };

const getHintToneClass = (variant: NonNullable<ResponseOptions['ui_variant']>): string => {
  if (variant === 'chips' || variant === 'grid') return 'option-hint-energetic';
  if (variant === 'scale' || variant === 'ladder') return 'option-hint-analytical';
  return 'option-hint-soft';
};

export const ResponseOptionsPanel: React.FC<ResponseOptionsPanelProps> = ({
  responseOptions,
  selectedOptionIds,
  onSelect,
  onSubmitSingle,
  onSubmitMultiple,
  loading = false,
}) => {
  if (!responseOptions || responseOptions.options.length === 0) return null;

  const variant = getVariant(responseOptions);
  const isMultiple = responseOptions.mode === 'multiple';
  const isSingle = responseOptions.mode === 'single' || responseOptions.mode === 'confirm';
  const isScale = variant === 'scale';
  const isSegmentedLike = variant === 'segmented' || variant === 'binary';
  const showMultipleSubmit = isMultiple && selectedOptionIds.length > 0;
  const showSingleSubmit = isSingle && (isScale || variant === 'ladder') && selectedOptionIds.length > 0;

  const selectedScaleOption = getSelectedSingleOption(responseOptions, selectedOptionIds);
  const selectedScaleIndex = selectedScaleOption
    ? responseOptions.options.findIndex((option) => option.id === selectedScaleOption.id)
    : 0;
  const sliderValue = Math.max(1, selectedScaleIndex + 1);

  return (
    <div className="space-y-4">
      {responseOptions.context_hint && (
        <motion.div
          key={responseOptions.context_hint}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`option-hint-chip ${getHintToneClass(variant)}`}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-content-primary text-center">
            {responseOptions.context_hint}
          </p>
        </motion.div>
      )}

      {isScale ? (
        <motion.div
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_CONFIG}
          className="space-y-4 surface-raised rounded-[24px] p-4 shadow-glass"
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">
              {responseOptions.scale?.low_label || 'Low'}
            </span>
            <span className="h-8 min-w-[48px] px-2 rounded-full bg-surface-active text-content-active text-xs font-semibold inline-flex items-center justify-center">
              {selectedScaleOption?.text || sliderValue}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">
              {responseOptions.scale?.high_label || 'High'}
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={responseOptions.options.length}
            step={1}
            value={sliderValue}
            disabled={loading}
            onChange={(event) => {
              const index = Number(event.target.value) - 1;
              const option = responseOptions.options[index];
              if (option) onSelect(option.id);
            }}
            className="w-full range-accent"
            aria-label="Severity slider"
          />

          <div className="grid grid-cols-5 gap-2">
            {responseOptions.options.map((option, index) => {
              const isSelected = selectedOptionIds.includes(option.id);
              const depth = index + 1;
              return (
                <motion.button
                  layout
                  key={option.id}
                  onClick={(event) => onSelect(option.id, event)}
                  disabled={loading}
                  aria-pressed={isSelected}
                  transition={SPRING_CONFIG}
                  style={!isSelected ? { opacity: Math.max(0.45, depth * 0.1) } : undefined}
                  className={`h-11 rounded-xl transition-all text-sm font-semibold option-live option-live-smooth ${
                    isSelected
                      ? 'option-live-selected text-content-active selected-elevation'
                      : `surface-strong text-content-primary ${getToneClass(index)}`
                  }`}
                >
                  {option.text}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <motion.div
          layout
          initial="hidden"
          animate="show"
          transition={SPRING_CONFIG}
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.03 } },
          }}
          className={`${
            isSegmentedLike
              ? `surface-raised segment-live-shell option-shell-live rounded-[22px] p-1.5 grid gap-1.5 ${getGridByVariant(
                  variant,
                  responseOptions.options.length
                )}`
              : `grid gap-3 ${getGridByVariant(variant, responseOptions.options.length)}`
          }`}
        >
          {responseOptions.options.map((option, index) => {
            const isSelected = selectedOptionIds.includes(option.id);
            const isBinary = variant === 'binary' || variant === 'segmented';
            const isChip = variant === 'chips';
            const isLadder = variant === 'ladder';

            return (
              <motion.button
                layout
                key={option.id}
                onClick={(event) => onSelect(option.id, event)}
                disabled={loading}
                aria-pressed={isSelected}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                transition={SPRING_CONFIG}
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.97 }}
                className={`${getOptionClass(variant)} ${
                  isSegmentedLike
                    ? isSelected
                      ? 'option-live-selected text-content-active selected-elevation'
                      : 'text-content-secondary bg-transparent'
                    : isSelected
                      ? 'scale-[1.01] option-live-selected text-content-active selected-elevation'
                      : 'text-content-primary'
                } ${isSelected ? '' : getToneClass(index)}`}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      layoutId={isSingle ? 'active-pill' : undefined}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-surface-active"
                      transition={{ type: 'spring', bounce: 0, duration: 0.28 }}
                    />
                  )}
                </AnimatePresence>

                <span
                  className={`relative z-10 block ${
                    isBinary
                      ? 'text-[10px] uppercase tracking-[0.22em] font-semibold'
                      : isChip
                        ? 'text-[10px] uppercase tracking-[0.2em] font-semibold'
                        : isLadder
                          ? 'text-sm tracking-[0.04em] font-semibold text-left'
                          : 'text-[11px] uppercase tracking-[0.2em] font-semibold'
                  } ${isSelected ? 'text-content-active' : 'group-hover:text-content-primary'}`}
                >
                  {option.text}
                </span>

                {isLadder && (
                  <span
                    className={`absolute right-0 top-0 h-full rounded-r-2xl transition-all ${
                      isSelected ? 'w-4 option-ladder-bar-active' : 'w-2 option-ladder-bar'
                    } ${index >= Math.floor(responseOptions.options.length * 0.6) ? 'opacity-90' : 'opacity-50'}`}
                  />
                )}

                {isSelected && !isLadder && !isSegmentedLike && (
                  <span className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full option-selected-badge text-[12px]">
                    {getOptionMarker(index)}
                  </span>
                )}

                {isSelected && isSegmentedLike && (
                  <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 text-[10px]">*</span>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {showSingleSubmit && (
        <motion.button
          layout
          onClick={onSubmitSingle}
          disabled={loading}
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-5 cta-live font-bold text-[10px] uppercase tracking-[0.35em] transition-all rounded-2xl focus-glow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue ({selectedScaleOption?.text || 'Selected'})
        </motion.button>
      )}

      {showMultipleSubmit && (
        <motion.button
          layout
          onClick={onSubmitMultiple}
          disabled={loading}
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-5 cta-live font-bold text-[10px] uppercase tracking-[0.4em] transition-all rounded-2xl focus-glow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue ({selectedOptionIds.length})
        </motion.button>
      )}
    </div>
  );
};
