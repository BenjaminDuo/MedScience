import { TeamTask } from './types.js';

/**
 * Pure scheduling logic (design doc section 6.3): a task is only "ready"
 * when every dependency has completed, its assigned agent is not already
 * running another task, and the team's concurrency budget has room. No
 * randomness, no side effects -- easy to unit test and reason about.
 */
export function computeReadyTasks(
  tasks: TeamTask[],
  busyAgentIds: Set<string>,
  runningCount: number,
  maxConcurrency: number
): TeamTask[] {
  const completedIds = new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.id));
  let slotsLeft = Math.max(0, maxConcurrency - runningCount);
  if (slotsLeft === 0) return [];

  const ready: TeamTask[] = [];
  const claimedThisPass = new Set<string>();

  for (const task of tasks) {
    if (slotsLeft <= 0) break;
    if (task.status !== 'proposed' && task.status !== 'blocked' && task.status !== 'revision-requested') continue;
    if (busyAgentIds.has(task.assignedAgentId) || claimedThisPass.has(task.assignedAgentId)) continue;
    const depsSatisfied = task.dependencyTaskIds.every((depId) => completedIds.has(depId));
    if (!depsSatisfied) continue;
    ready.push(task);
    claimedThisPass.add(task.assignedAgentId);
    slotsLeft--;
  }

  return ready;
}

/** True once every task has reached a terminal state (completed/failed/cancelled). */
export function isTaskGraphSettled(tasks: TeamTask[]): boolean {
  return tasks.every((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');
}

/** True when at least one task can never become ready again (a hard dependency failed/cancelled). */
export function hasDeadlockedTasks(tasks: TeamTask[]): TeamTask[] {
  const badIds = new Set(tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled').map((t) => t.id));
  if (badIds.size === 0) return [];
  return tasks.filter(
    (t) =>
      (t.status === 'proposed' || t.status === 'blocked' || t.status === 'revision-requested') &&
      t.dependencyTaskIds.some((depId) => badIds.has(depId))
  );
}
