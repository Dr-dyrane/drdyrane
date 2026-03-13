import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';

interface InlineErrorBladeProps {
  message: string;
  details?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
}

export const InlineErrorBlade: React.FC<InlineErrorBladeProps> = ({
  message,
  details,
  onDismiss,
  onRetry,
  retryLabel = 'Retry',
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(details && details.trim());

  useEffect(() => {
    setExpanded(false);
  }, [message, details]);

  return (
    <div className="surface-raised rounded-2xl px-4 py-3 shadow-glass">
      <div className="flex items-start gap-2">
        <TriangleAlert size={14} className="mt-0.5 text-danger-primary shrink-0" />
        <p className="text-[12px] leading-relaxed text-content-secondary">{message}</p>
      </div>

      {hasDetails && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="h-8 px-2 rounded-xl surface-strong text-content-dim text-[11px] font-semibold inline-flex items-center gap-1.5 interactive-tap"
          >
            {expanded ? 'Hide details' : 'Show details'}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.pre
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 surface-strong rounded-xl px-3 py-2 text-[11px] leading-relaxed text-content-dim whitespace-pre-wrap break-words overflow-hidden"
              >
                {details}
              </motion.pre>
            )}
          </AnimatePresence>
        </div>
      )}

      {(onDismiss || onRetry) && (
        <div className="mt-2 flex items-center justify-end gap-2">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="h-9 px-3 rounded-xl surface-strong text-content-secondary text-xs font-semibold interactive-tap"
            >
              Dismiss
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="h-9 px-3 rounded-xl cta-live text-xs font-semibold interactive-tap"
            >
              {retryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
