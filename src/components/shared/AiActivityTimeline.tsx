import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { AiActivityScope, AiActivityTaskStatus, useAiActivity } from '../../core/services/aiActivity';

interface AiActivityTimelineProps {
  scope: AiActivityScope;
  className?: string;
  maxTasks?: number;
  showCompletedWithinMs?: number;
}

const TASK_STATUS_LABEL: Record<AiActivityTaskStatus, string> = {
  active: 'Running',
  success: 'Done',
  error: 'Issue',
};

const getBadgeClass = (status: AiActivityTaskStatus): string => {
  if (status === 'error') return 'ai-progress-badge ai-progress-badge-error';
  if (status === 'success') return 'ai-progress-badge ai-progress-badge-success';
  return 'ai-progress-badge ai-progress-badge-active';
};

const getNodeDotClass = (status: string): string => {
  if (status === 'success') return 'ai-progress-dot ai-progress-dot-success';
  if (status === 'error') return 'ai-progress-dot ai-progress-dot-error';
  if (status === 'skipped') return 'ai-progress-dot ai-progress-dot-skipped';
  if (status === 'active') return 'ai-progress-dot ai-progress-dot-active';
  return 'ai-progress-dot ai-progress-dot-pending';
};

const AUTO_COLLAPSE_DELAY_MS = 1200;

export const AiActivityTimeline: React.FC<AiActivityTimelineProps> = ({
  scope,
  className,
  maxTasks = 2,
  showCompletedWithinMs = 18000,
}) => {
  const taskFeed = useAiActivity(scope, showCompletedWithinMs);
  const tasks = taskFeed.slice(0, Math.max(1, maxTasks));
  const hasActiveTask = tasks.some((task) => task.status === 'active');
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const latestTask = tasks[0];
  const hasExpandedCompleted = tasks.some(
    (task) => task.status !== 'active' && expanded[task.id] === true
  );

  React.useEffect(() => {
    if (hasActiveTask || !latestTask || latestTask.status === 'active') return;
    const timeoutId = window.setTimeout(() => {
      setExpanded((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        return {};
      });
    }, AUTO_COLLAPSE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [hasActiveTask, latestTask, latestTask?.id, latestTask?.status]);

  if (tasks.length === 0) return null;

  if (!hasActiveTask && latestTask && !hasExpandedCompleted) {
    const completed = latestTask.nodes.filter((node) => node.status === 'success').length;
    return (
      <button
        type="button"
        onClick={() => setExpanded((prev) => ({ ...prev, [latestTask.id]: true }))}
        className={`w-full min-w-0 surface-raised rounded-full px-3 h-9 shadow-glass inline-flex items-center justify-between gap-2 interactive-tap ${className || ''}`}
        aria-label="Expand Dr progress details"
      >
        <span className="min-w-0 inline-flex items-center gap-2">
          <CheckCircle2 size={14} className="text-accent-primary shrink-0" />
          <span className="text-[11px] text-content-primary font-semibold truncate">
            Dr completed {latestTask.title}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 shrink-0 text-[10px] text-content-secondary">
          {completed}/{latestTask.nodes.length}
          <ChevronRight size={12} className="text-content-dim" />
        </span>
      </button>
    );
  }

  return (
    <section className={`surface-raised rounded-[22px] p-3 shadow-glass space-y-2 min-w-0 ${className || ''}`}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <p className="text-[11px] text-content-dim uppercase tracking-wide">Dr Progress</p>
        <span className="h-7 px-2.5 rounded-full surface-chip text-[10px] text-content-secondary inline-flex items-center gap-1.5 shrink-0">
          {hasActiveTask && <Loader2 size={11} className="animate-spin text-accent-primary" />}
          {hasActiveTask ? 'Thinking' : 'Complete'}
        </span>
      </div>

      <div className="space-y-2 min-w-0">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="surface-strong rounded-2xl p-2.5 space-y-1.5 min-w-0"
            >
              {(() => {
                const completed = task.nodes.filter((node) => node.status === 'success').length;
                const failed = task.nodes.filter((node) => node.status === 'error').length;
                const total = task.nodes.length;
                const isActive = task.status === 'active';
                const isExpanded = isActive || expanded[task.id] === true;
                const canExpand = !isActive && total > 0;

                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canExpand) return;
                        setExpanded((prev) => ({ ...prev, [task.id]: !isExpanded }));
                      }}
                      className={`w-full min-w-0 inline-flex items-center justify-between gap-2 ${
                        canExpand ? 'interactive-tap tap-compact' : ''
                      }`}
                      aria-label={canExpand ? `${isExpanded ? 'Collapse' : 'Expand'} Dr progress details` : undefined}
                    >
                      <div className="min-w-0 inline-flex items-center gap-2">
                        {!isActive && task.status === 'success' ? (
                          <CheckCircle2 size={14} className="text-accent-primary shrink-0" />
                        ) : (
                          <span className={getNodeDotClass(isActive ? 'active' : task.status)} />
                        )}
                        <p className="text-xs text-content-primary font-semibold truncate">{task.title}</p>
                      </div>
                      <div className="inline-flex items-center gap-1.5 shrink-0">
                        <span className={getBadgeClass(task.status)}>{TASK_STATUS_LABEL[task.status]}</span>
                        {canExpand &&
                          (isExpanded ? (
                            <ChevronDown size={12} className="text-content-dim" />
                          ) : (
                            <ChevronRight size={12} className="text-content-dim" />
                          ))}
                      </div>
                    </button>

                    {!isExpanded && !isActive ? (
                      <div className="min-w-0 inline-flex items-center gap-2">
                        <p className="text-[11px] text-content-secondary truncate">
                          {completed}/{total} steps complete
                          {failed > 0 ? ` • ${failed} issue${failed > 1 ? 's' : ''}` : ''}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 min-w-0">
                        {task.nodes.map((node) => (
                          <div key={`${task.id}-${node.id}`} className="flex items-center gap-2 min-w-0">
                            <span className={getNodeDotClass(node.status)} />
                            <p className="text-[11px] text-content-secondary truncate">{node.label}</p>
                            {node.detail && (
                              <p className="text-[10px] text-content-dim truncate min-w-0">{node.detail}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
};
