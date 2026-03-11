import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { ResponseOptions } from '../../../core/types/clinical';

interface ResponseOptionsPanelProps {
  responseOptions: ResponseOptions | null;
  selectedOptionIds: string[];
  onSelect: (optionId: string) => void;
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
    'option-button relative overflow-hidden transition-all duration-300 text-center group surface-raised shadow-glass focus-glow disabled:opacity-50 disabled:cursor-not-allowed';

  if (variant === 'binary' || variant === 'segmented') return `${base} min-h-14 rounded-full px-3 py-4`;
  if (variant === 'chips') return `${base} min-h-12 rounded-full px-4 py-3`;
  if (variant === 'grid') return `${base} min-h-20 rounded-3xl px-4 py-6`;
  if (variant === 'ladder') return `${base} min-h-14 rounded-2xl px-4 py-4 text-left`;
  return `${base} min-h-16 rounded-2xl px-4 py-5`;
};

const getSelectedSingleOption = (
  responseOptions: ResponseOptions,
  selectedOptionIds: string[]
): ResponseOptions['options'][number] | null => {
  const id = selectedOptionIds[0];
  if (!id) return null;
  return responseOptions.options.find((option) => option.id === id) || null;
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
        <motion.p
          key={responseOptions.context_hint}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-[10px] uppercase tracking-[0.2em] text-content-dim text-center"
        >
          {responseOptions.context_hint}
        </motion.p>
      )}

      {isScale ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 surface-raised rounded-[24px] p-4 shadow-glass"
        >
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
            className="w-full accent-white"
            aria-label="Severity slider"
          />

          <div className="grid grid-cols-5 gap-2">
            {responseOptions.options.map((option, index) => {
              const isSelected = selectedOptionIds.includes(option.id);
              const depth = index + 1;
              return (
                <button
                  key={option.id}
                  onClick={() => onSelect(option.id)}
                  disabled={loading}
                  aria-pressed={isSelected}
                  style={!isSelected ? { opacity: Math.max(0.45, depth * 0.1) } : undefined}
                  className={`h-11 rounded-xl transition-all text-sm font-semibold ${
                    isSelected
                      ? 'bg-surface-active text-content-active shadow-[0_14px_28px_rgba(255,255,255,0.18)]'
                      : 'surface-strong text-content-primary'
                  }`}
                >
                  {option.text}
                </button>
              );
            })}
          </div>

          {responseOptions.scale && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">
                {responseOptions.scale.low_label || 'Low'}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-content-dim">
                {responseOptions.scale.high_label || 'High'}
              </span>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.03 } },
          }}
          className={`grid gap-3 ${getGridByVariant(variant, responseOptions.options.length)}`}
        >
          {responseOptions.options.map((option, index) => {
            const isSelected = selectedOptionIds.includes(option.id);
            const isBinary = variant === 'binary' || variant === 'segmented';
            const isChip = variant === 'chips';
            const isLadder = variant === 'ladder';

            return (
              <motion.button
                key={option.id}
                onClick={() => onSelect(option.id)}
                disabled={loading}
                aria-pressed={isSelected}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.97 }}
                className={`${getOptionClass(variant)} ${
                  isSelected
                    ? 'scale-[1.01] bg-surface-active text-content-active shadow-[0_18px_40px_rgba(255,255,255,0.2)]'
                    : 'text-content-primary'
                }`}
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
                      ? 'text-[10px] uppercase tracking-[0.3em] font-semibold'
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
                      isSelected ? 'w-4 bg-black/20' : 'w-2 bg-white/10'
                    } ${index >= Math.floor(responseOptions.options.length * 0.6) ? 'opacity-90' : 'opacity-50'}`}
                  />
                )}

                {isSelected && !isLadder && (
                  <span className="absolute right-3 top-3 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/20">
                    <Check size={12} className="text-content-active" />
                  </span>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {showSingleSubmit && (
        <motion.button
          onClick={onSubmitSingle}
          disabled={loading}
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-5 bg-neon-cyan text-black font-bold text-[10px] uppercase tracking-[0.35em] transition-all shadow-[0_20px_40px_rgba(0,245,255,0.28)] rounded-2xl focus-glow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue ({selectedScaleOption?.text || 'Selected'})
        </motion.button>
      )}

      {showMultipleSubmit && (
        <motion.button
          onClick={onSubmitMultiple}
          disabled={loading}
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-5 bg-neon-cyan text-black font-bold text-[10px] uppercase tracking-[0.4em] transition-all shadow-[0_20px_40px_rgba(0,245,255,0.28)] rounded-2xl focus-glow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue ({selectedOptionIds.length})
        </motion.button>
      )}
    </div>
  );
};
