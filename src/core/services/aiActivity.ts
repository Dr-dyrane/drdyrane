import { useMemo, useSyncExternalStore } from 'react';

export type AiActivityScope = 'consult' | 'scan' | 'global';
export type AiActivityNodeStatus = 'pending' | 'active' | 'success' | 'error' | 'skipped';
export type AiActivityTaskStatus = 'active' | 'success' | 'error';

export interface AiActivityNode {
  id: string;
  label: string;
  status: AiActivityNodeStatus;
  detail?: string;
  started_at?: number;
  finished_at?: number;
}

export interface AiActivityTask {
  id: string;
  scope: AiActivityScope;
  title: string;
  status: AiActivityTaskStatus;
  detail?: string;
  created_at: number;
  updated_at: number;
  finished_at?: number;
  nodes: AiActivityNode[];
}

interface AiTaskConfig {
  scope: AiActivityScope;
  title: string;
  nodes: Array<{ id: string; label: string }>;
}

interface AiTaskHandle {
  id: string;
  start: (nodeId: string, detail?: string) => void;
  succeed: (nodeId: string, detail?: string) => void;
  fail: (nodeId: string, detail?: string) => void;
  skip: (nodeId: string, detail?: string) => void;
  finishSuccess: (detail?: string) => void;
  finishError: (detail?: string) => void;
}

const MAX_TASKS = 28;
const RETAIN_MS = 1000 * 60 * 4;
const listeners = new Set<() => void>();

let tasks: AiActivityTask[] = [];
let snapshot: ReadonlyArray<AiActivityTask> = [];

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): ReadonlyArray<AiActivityTask> => snapshot;

const cloneTask = (task: AiActivityTask): AiActivityTask => ({
  ...task,
  nodes: task.nodes.map((node) => ({ ...node })),
});

const emit = () => {
  const now = Date.now();
  const cutoff = now - RETAIN_MS;
  tasks = tasks
    .filter((task) => task.status === 'active' || task.updated_at >= cutoff)
    .slice(0, MAX_TASKS);
  snapshot = tasks.map(cloneTask);
  listeners.forEach((listener) => listener());
};

const updateTask = (taskId: string, mutate: (task: AiActivityTask) => void): void => {
  const nextTasks = tasks.map((task) => {
    if (task.id !== taskId) return task;
    const cloned = cloneTask(task);
    mutate(cloned);
    cloned.updated_at = Date.now();
    return cloned;
  });
  tasks = nextTasks;
  emit();
};

const updateNode = (
  task: AiActivityTask,
  nodeId: string,
  status: AiActivityNodeStatus,
  detail?: string
) => {
  const now = Date.now();
  const node = task.nodes.find((entry) => entry.id === nodeId);
  if (!node) return;
  if (status === 'active') {
    node.started_at = node.started_at || now;
    node.finished_at = undefined;
  } else if (status === 'success' || status === 'error' || status === 'skipped') {
    node.started_at = node.started_at || now;
    node.finished_at = now;
  }
  node.status = status;
  node.detail = detail || node.detail;
};

const normalizeTaskStatus = (task: AiActivityTask): AiActivityTaskStatus => {
  if (task.status === 'error') return 'error';
  if (task.nodes.some((node) => node.status === 'error')) return 'error';
  if (task.nodes.some((node) => node.status === 'active')) return 'active';
  if (task.nodes.some((node) => node.status === 'pending')) return 'active';
  return 'success';
};

export const beginAiTask = (config: AiTaskConfig): AiTaskHandle => {
  const now = Date.now();
  const id = `ai-task-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const task: AiActivityTask = {
    id,
    scope: config.scope,
    title: config.title,
    status: 'active',
    created_at: now,
    updated_at: now,
    nodes: config.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      status: 'pending',
    })),
  };
  tasks = [task, ...tasks];
  emit();

  return {
    id,
    start: (nodeId: string, detail?: string) => {
      updateTask(id, (target) => {
        updateNode(target, nodeId, 'active', detail);
        target.status = normalizeTaskStatus(target);
      });
    },
    succeed: (nodeId: string, detail?: string) => {
      updateTask(id, (target) => {
        updateNode(target, nodeId, 'success', detail);
        target.status = normalizeTaskStatus(target);
      });
    },
    fail: (nodeId: string, detail?: string) => {
      updateTask(id, (target) => {
        updateNode(target, nodeId, 'error', detail);
        target.status = 'error';
        target.finished_at = Date.now();
      });
    },
    skip: (nodeId: string, detail?: string) => {
      updateTask(id, (target) => {
        updateNode(target, nodeId, 'skipped', detail);
        target.status = normalizeTaskStatus(target);
      });
    },
    finishSuccess: (detail?: string) => {
      updateTask(id, (target) => {
        target.status = 'success';
        target.detail = detail || target.detail;
        target.finished_at = Date.now();
      });
    },
    finishError: (detail?: string) => {
      updateTask(id, (target) => {
        target.status = 'error';
        target.detail = detail || target.detail;
        target.finished_at = Date.now();
      });
    },
  };
};

export const useAiActivity = (
  scope?: AiActivityScope,
  showCompletedWithinMs: number = 18000
): AiActivityTask[] => {
  const allTasks = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(() => {
    const now = Date.now();
    return allTasks.filter((task) => {
      if (scope && task.scope !== scope && task.scope !== 'global') return false;
      if (task.status === 'active') return true;
      return now - task.updated_at <= showCompletedWithinMs;
    });
  }, [allTasks, scope, showCompletedWithinMs]);
};

