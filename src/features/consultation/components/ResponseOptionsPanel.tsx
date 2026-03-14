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
  compact?: boolean;
  questionText?: string;
}

const getGridByVariant = (variant: ResponseOptions['ui_variant']): string => {
  if (variant === 'binary' || variant === 'segmented') return 'grid-cols-2';
  if (variant === 'grid') return 'grid-cols-2';
  if (variant === 'stack' || variant === 'ladder' || variant === 'chips') return 'grid-cols-2';
  return 'grid-cols-1';
};

const isSeverityOptionSet = (options: ResponseOptions['options']): boolean => {
  const normalized = options.map((option) => option.text.toLowerCase());
  return normalized.some((value) => value.includes('mild')) && normalized.some((value) => value.includes('severe'));
};

const getVariant = (responseOptions: ResponseOptions): NonNullable<ResponseOptions['ui_variant']> => {
  if (responseOptions.ui_variant) return responseOptions.ui_variant;
  if (responseOptions.options.length <= 3 && responseOptions.mode === 'single') return 'segmented';
  if (responseOptions.options.length >= 4) return 'grid';
  if (isSeverityOptionSet(responseOptions.options)) return 'ladder';
  return 'stack';
};

const getOptionClass = (
  variant: NonNullable<ResponseOptions['ui_variant']>,
  compact: boolean
): string => {
  const base =
    'option-button option-live option-live-smooth option-live-bounce relative overflow-hidden transition-all duration-300 text-center group focus-glow disabled:opacity-50 disabled:cursor-not-allowed';

  if (variant === 'binary' || variant === 'segmented') return `${base} min-h-12 rounded-[14px] px-3 py-3`;
  if (variant === 'chips') return `${base} min-h-12 rounded-full px-4 py-3 surface-raised shadow-glass`;
  if (variant === 'grid') {
    return compact
      ? `${base} min-h-14 rounded-[18px] px-3 py-4 surface-raised shadow-glass`
      : `${base} min-h-20 rounded-[22px] px-4 py-6 surface-raised shadow-glass`;
  }
  if (variant === 'ladder') return `${base} min-h-14 rounded-2xl px-4 py-4 text-left surface-raised shadow-glass`;
  return `${base} min-h-16 rounded-2xl px-4 py-5 surface-raised shadow-glass`;
};

const getToneClass = (index: number): string => {
  const tones = ['option-tone-cyan', 'option-tone-mint', 'option-tone-amber', 'option-tone-rose'];
  return tones[index % tones.length];
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
const HOVER_MOTION = { scale: 1.015, y: -1.5 };
const TAP_MOTION = { scale: 0.97, y: 0 };
const OPTIONS_PAGE_SIZE = 4;

const getHintToneClass = (variant: NonNullable<ResponseOptions['ui_variant']>): string => {
  if (variant === 'chips' || variant === 'grid') return 'option-hint-energetic';
  if (variant === 'scale' || variant === 'ladder') return 'option-hint-analytical';
  return 'option-hint-soft';
};

const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

const isRedundantHint = (
  hint: string,
  questionText?: string,
  compact: boolean = false
): boolean => {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) return true;

  if (
    /(single select|multi select|select one option|select one|choose one option|choose one|choose the nearest count range)/.test(
      normalizedHint
    )
  ) {
    return true;
  }

  const normalizedQuestion = normalizeText(questionText || '');
  if (normalizedQuestion) {
    if (normalizedQuestion.includes(normalizedHint) || normalizedHint.includes(normalizedQuestion)) {
      return true;
    }
  }

  if (
    compact &&
    /(most prominent|associated symptom|yes or no|quick yes\/no|safety check|clarifier)/.test(
      normalizedHint
    )
  ) {
    return true;
  }

  return false;
};

export const ResponseOptionsPanel: React.FC<ResponseOptionsPanelProps> = ({
  responseOptions,
  selectedOptionIds,
  onSelect,
  onSubmitSingle,
  onSubmitMultiple,
  loading = false,
  compact = false,
  questionText,
}) => {
  const [activePage, setActivePage] = React.useState(0);
  React.useEffect(() => {
    setActivePage(0);
  }, [responseOptions?.options.length, responseOptions?.mode, responseOptions?.ui_variant]);
  if (!responseOptions || responseOptions.options.length === 0) return null;

  const baseVariant = getVariant(responseOptions);
  const variant =
    compact &&
    !['scale', 'ladder', 'segmented', 'binary', 'chips'].includes(baseVariant) &&
    responseOptions.options.length <= 8
      ? 'grid'
      : baseVariant;
  const isMultiple = responseOptions.mode === 'multiple';
  const isSingle = responseOptions.mode === 'single' || responseOptions.mode === 'confirm';
  const isScale = variant === 'scale';
  const isSegmentedLike = variant === 'segmented' || variant === 'binary';
  const hasSelection = selectedOptionIds.length > 0;
  const showMultipleSubmit = isMultiple;
  const showSingleSubmit = isSingle && (isScale || variant === 'ladder');
  const showContextHint =
    !compact &&
    !!responseOptions.context_hint &&
    !isRedundantHint(responseOptions.context_hint, questionText, compact);

  const selectedScaleOption = getSelectedSingleOption(responseOptions, selectedOptionIds);
  const selectedScaleIndex = selectedScaleOption
    ? responseOptions.options.findIndex((option) => option.id === selectedScaleOption.id)
    : 0;
  const sliderValue = Math.max(1, selectedScaleIndex + 1);
  const shouldPaginateOptions =
    !isScale &&
    !isSegmentedLike &&
    responseOptions.options.length > OPTIONS_PAGE_SIZE;
  const optionPages = shouldPaginateOptions
    ? Array.from(
        { length: Math.ceil(responseOptions.options.length / OPTIONS_PAGE_SIZE) },
        (_, pageIndex) =>
          responseOptions.options.slice(
            pageIndex * OPTIONS_PAGE_SIZE,
            (pageIndex + 1) * OPTIONS_PAGE_SIZE
          )
      )
    : [responseOptions.options];
  const visibleOptions = optionPages[Math.min(activePage, optionPages.length - 1)] || responseOptions.options;

  return (
    <div className={`${compact ? 'space-y-3' : 'space-y-4'} relative`}>
      <AnimatePresence mode="wait">
        {showContextHint && responseOptions.context_hint && (
          <motion.div
            key={responseOptions.context_hint}
            initial={{ opacity: 0, y: 6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={SPRING_CONFIG}
            className={`option-hint-chip ${getHintToneClass(variant)}`}
          >
            <p className="text-xs tracking-wide text-content-primary text-center font-medium">
              {responseOptions.context_hint}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {isScale ? (
        <motion.div
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_CONFIG}
          className="space-y-4 surface-raised rounded-[22px] p-4 shadow-glass"
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs tracking-wide text-content-dim">
              {responseOptions.scale?.low_label || 'Low'}
            </span>
            <span className="h-8 min-w-[48px] px-2 rounded-full bg-surface-active text-content-active text-xs font-semibold inline-flex items-center justify-center">
              {selectedScaleOption?.text || sliderValue}
            </span>
            <span className="text-xs tracking-wide text-content-dim">
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
              const selectionOrder = selectedOptionIds.indexOf(option.id) + 1;
              return (
                <motion.button
                  layout
                  key={option.id}
                  onClick={(event) => onSelect(option.id, event)}
                  disabled={loading}
                  aria-pressed={isSelected}
                  transition={SPRING_CONFIG}
                  whileHover={HOVER_MOTION}
                  whileTap={TAP_MOTION}
                  style={!isSelected ? { opacity: Math.max(0.45, depth * 0.1) } : undefined}
                  className={`h-11 rounded-xl transition-all text-sm font-semibold option-live option-live-smooth ${
                    isSelected
                      ? 'option-live-selected text-content-active selected-elevation'
                      : `surface-strong text-content-primary ${getToneClass(index)}`
                  }`}
                >
                  {option.text}
                  {isSelected && isMultiple && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-surface-active text-content-active text-[10px] inline-flex items-center justify-center"
                    >
                      {selectionOrder}
                    </motion.span>
                  )}
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
                ? `surface-raised segment-live-shell option-shell-live rounded-[20px] p-2 grid gap-1.5 ${getGridByVariant(
                  variant
                )}`
              : `grid gap-3 ${getGridByVariant(variant)}`
          }`}
        >
          {visibleOptions.map((option, index) => {
            const isSelected = selectedOptionIds.includes(option.id);
            const isBinary = variant === 'binary' || variant === 'segmented';
            const isChip = variant === 'chips';
            const isLadder = variant === 'ladder';
            const selectionOrder = selectedOptionIds.indexOf(option.id) + 1;
            const visualIndex =
              shouldPaginateOptions ? activePage * OPTIONS_PAGE_SIZE + index : index;

            return (
              <motion.button
                layout
                key={option.id}
                onClick={(event) => onSelect(option.id, event)}
                disabled={loading}
                aria-pressed={isSelected}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                transition={SPRING_CONFIG}
                whileHover={HOVER_MOTION}
                whileTap={TAP_MOTION}
                className={`${getOptionClass(variant, compact)} ${
                  isSegmentedLike
                    ? isSelected
                      ? 'option-live-selected text-content-active selected-elevation'
                      : 'text-content-secondary bg-transparent'
                    : isSelected
                      ? 'scale-[1.01] option-live-selected text-content-active selected-elevation'
                      : 'text-content-primary'
                } ${isSelected ? '' : getToneClass(visualIndex)}`}
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
                      ? 'text-sm tracking-wide font-medium'
                      : isChip
                        ? 'text-sm tracking-wide font-medium'
                        : isLadder
                          ? 'text-sm tracking-[0.02em] font-semibold text-left'
                          : 'text-sm tracking-wide font-medium'
                  } ${isSelected ? 'text-content-active' : 'group-hover:text-content-primary'}`}
                >
                  {option.text}
                </span>

                {isSelected && isMultiple && !isSegmentedLike && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-2 right-2 h-5 min-w-[20px] px-1 rounded-full bg-surface-active text-content-active text-[10px] inline-flex items-center justify-center"
                  >
                    {selectionOrder}
                  </motion.span>
                )}

                {isLadder && (
                  <span
                    className={`absolute right-0 top-0 h-full rounded-r-2xl transition-all ${
                      isSelected ? 'w-4 option-ladder-bar-active' : 'w-2 option-ladder-bar'
                    } ${
                      visualIndex >= Math.floor(responseOptions.options.length * 0.6)
                        ? 'opacity-90'
                        : 'opacity-50'
                    }`}
                  />
                )}

                {isSelected && isSegmentedLike && (
                  <motion.span
                    layoutId="segment-indicator"
                    className="absolute bottom-1 left-2 right-2 z-20 h-[3px] rounded-full option-ladder-bar-active"
                  />
                )}
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {shouldPaginateOptions && optionPages.length > 1 && (
        <div className="flex items-center justify-center gap-2" aria-label="Option pages">
          {optionPages.map((_, pageIndex) => (
            <button
              key={`options-page-${pageIndex}`}
              onClick={() => setActivePage(pageIndex)}
              disabled={loading}
              aria-label={`Show option page ${pageIndex + 1}`}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                pageIndex === activePage
                  ? 'bg-surface-active scale-110'
                  : 'surface-chip opacity-75'
              }`}
            />
          ))}
        </div>
      )}

      {showSingleSubmit && (
        <div className={compact ? 'space-y-0' : 'space-y-1.5'}>
          <motion.button
            layout
            onClick={onSubmitSingle}
            disabled={loading || !hasSelection}
            whileHover={HOVER_MOTION}
            whileTap={TAP_MOTION}
            className="w-full py-4 cta-live font-semibold text-sm tracking-wide transition-all rounded-2xl focus-glow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Analyzing...'
              : hasSelection
                ? `Continue (${selectedScaleOption?.text || 'Selected'})`
                : 'Select one option'}
          </motion.button>
          {!compact && !hasSelection && !loading && (
            <p className="text-xs text-content-dim text-center">
              Choose a response before continuing.
            </p>
          )}
        </div>
      )}

      {showMultipleSubmit && (
        <div className={compact ? 'space-y-0' : 'space-y-1.5'}>
          <motion.button
            layout
            onClick={onSubmitMultiple}
            disabled={loading || !hasSelection}
            whileHover={HOVER_MOTION}
            whileTap={TAP_MOTION}
            className="w-full py-4 cta-live font-semibold text-sm tracking-wide transition-all rounded-2xl focus-glow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Analyzing...'
              : hasSelection
                ? `Continue (${selectedOptionIds.length})`
                : 'Select at least one option'}
          </motion.button>
          {!compact && !hasSelection && !loading && (
            <p className="text-xs text-content-dim text-center">
              You can choose more than one response.
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-[24px] overlay-backdrop-soft backdrop-blur-[1px] pointer-events-none"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

