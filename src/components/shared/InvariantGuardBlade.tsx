import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, X } from 'lucide-react';

interface InvariantGuardBladeProps {
  status: 'enforced' | 'failed';
  summary: string;
  details?: string;
  onDismiss?: () => void;
}

export const InvariantGuardBlade: React.FC<InvariantGuardBladeProps> = ({
  status,
  summary,
  details,
  onDismiss,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(details && details.trim());

  useEffect(() => {
    setExpanded(false);
  }, [summary, details, status]);

  return (
    <div className="space-y-2" data-testid="consult-guard-blade">
      <div className="surface-raised rounded-full h-11 px-3 shadow-glass flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!hasDetails) return;
            setExpanded((prev) => !prev);
          }}
          className={`flex-1 min-w-0 inline-flex items-center gap-2 ${
            hasDetails ? 'interactive-tap' : ''
          }`}
          aria-label={hasDetails ? 'Toggle Dr guard details' : undefined}
        >
          {status === 'failed' ? (
            <ShieldAlert size={14} className="text-danger-primary shrink-0" />
          ) : (
            <ShieldCheck size={14} className="text-accent-primary shrink-0" />
          )}
          <span className="text-[11px] text-content-secondary truncate">{summary}</span>
          {hasDetails &&
            (expanded ? (
              <ChevronUp size={12} className="text-content-dim shrink-0" />
            ) : (
              <ChevronDown size={12} className="text-content-dim shrink-0" />
            ))}
        </button>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="h-7 w-7 rounded-full surface-strong inline-flex items-center justify-center text-content-dim interactive-tap"
            aria-label="Dismiss Dr guard notice"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="surface-strong rounded-2xl px-3 py-2.5 overflow-hidden"
          >
            <p className="text-[11px] text-content-dim leading-relaxed break-words">{details}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

