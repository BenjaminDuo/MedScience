import type { ScientificHandoff, TeamRun, TeamRunRecord, TeamTask } from '@medscience/core';

/**
 * Turns a team's runs into a group-chat transcript.
 *
 * This is the one place that knows how orchestrator state maps to chat
 * messages: the chat components consume `GroupMessage[]` and nothing else,
 * so when the transport behind it changes (today: an event wakes the view
 * and it re-reads the run record) the UI does not.
 *
 * It deliberately never invents dialogue. Every agent line here is text the
 * orchestrator actually produced -- a handoff summary, its unresolved
 * questions, its recommended next actions, or a quality-gate issue. The
 * only thing this file adds is who it was addressed to: a handoff's
 * recommended next actions are written for whoever picks the work up, so
 * they are rendered as an @-mention of the dependent task's assignee.
 */
export type MessageTone = 'info' | 'warn' | 'error';

export type GroupMessage =
  | { kind: 'divider'; id: string; at: string; runId: string; inquiry: string; status: string }
  | { kind: 'user'; id: string; at: string; text: string }
  | { kind: 'agent'; id: string; at: string; agentId: string; role?: string; text: string; mentions: string[] }
  | { kind: 'system'; id: string; at: string; tone: MessageTone; text: string }
  | { kind: 'typing'; id: string; at: string; agentId: string; hint: string }
  | {
      kind: 'plan';
      id: string;
      at: string;
      runId: string;
      leaderAgentId: string;
      tasks: TeamTask[];
      approvable: boolean;
    }
  | { kind: 'handoff'; id: string; at: string; agentId: string; handoff: ScientificHandoff; taskTitle?: string }
  | { kind: 'report'; id: string; at: string; run: TeamRun; leaderAgentId: string };

export type Translate = (en: string, zh: string) => string;

const SETTLED = new Set(['completed', 'failed', 'cancelled']);

/** Orders messages by time, keeping insertion order for identical timestamps. */
function chronological(messages: GroupMessage[]): GroupMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const diff = Date.parse(a.message.at) - Date.parse(b.message.at);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.message);
}

function taskTime(task: TeamTask): string {
  return task.completedAt || task.startedAt || task.createdAt;
}

export function buildGroupMessages(records: TeamRunRecord[], t: Translate): GroupMessage[] {
  const messages: GroupMessage[] = [];

  // Oldest run first: a chat reads top-to-bottom, while the store lists
  // newest first.
  const ordered = [...records].sort((a, b) => Date.parse(a.run.startedAt) - Date.parse(b.run.startedAt));

  for (const record of ordered) {
    const { run, tasks, handoffs } = record;
    const handoffByTask = new Map<string, ScientificHandoff>();
    handoffs.forEach((handoff) => handoffByTask.set(handoff.taskId, handoff));
    const taskById = new Map<string, TeamTask>();
    tasks.forEach((task) => taskById.set(task.id, task));

    messages.push({
      kind: 'divider',
      id: `divider-${run.id}`,
      at: run.startedAt,
      runId: run.id,
      inquiry: run.inquiry,
      status: run.status,
    });
    messages.push({ kind: 'user', id: `inquiry-${run.id}`, at: run.startedAt, text: run.inquiry });
    messages.push({
      kind: 'system',
      id: `took-over-${run.id}`,
      at: run.startedAt,
      tone: 'info',
      text: t('The team leader picked up this inquiry and is planning the task graph.', '队长已接管该课题，正在拆解任务图。'),
    });

    if (run.status === 'planning') {
      messages.push({
        kind: 'typing',
        id: `typing-plan-${run.id}`,
        at: run.startedAt,
        agentId: run.leaderAgentId,
        hint: t('is drafting the plan…', '正在拟定研究计划…'),
      });
    }

    if (tasks.length > 0) {
      const planAt = tasks.reduce((earliest, task) => (task.createdAt < earliest ? task.createdAt : earliest), tasks[0].createdAt);
      messages.push({
        kind: 'plan',
        id: `plan-${run.id}`,
        at: planAt,
        runId: run.id,
        leaderAgentId: run.leaderAgentId,
        tasks,
        approvable: run.status === 'awaiting-plan-approval',
      });
      if (run.status !== 'awaiting-plan-approval' && run.status !== 'planning') {
        messages.push({
          kind: 'system',
          id: `plan-approved-${run.id}`,
          at: planAt,
          tone: 'info',
          text: t(
            `Plan accepted · up to ${run.budget.maxConcurrency} members working at once`,
            `计划已生效 · 最多 ${run.budget.maxConcurrency} 名成员同时工作`
          ),
        });
      }
    }

    for (const task of tasks) {
      const at = taskTime(task);
      const handoff = handoffByTask.get(task.id);

      if (handoff) {
        if (handoff.summary?.trim()) {
          messages.push({
            kind: 'agent',
            id: `say-${handoff.id}`,
            at: handoff.createdAt,
            agentId: handoff.agentId,
            role: task.title,
            text: handoff.summary.trim(),
            mentions: [],
          });
        }
        messages.push({
          kind: 'handoff',
          id: `handoff-${handoff.id}`,
          at: handoff.createdAt,
          agentId: handoff.agentId,
          handoff,
          taskTitle: task.title,
        });

        // Anything the handoff leaves for someone else becomes a message
        // addressed to the member who actually picks that work up.
        const followUps = [...handoff.recommendedNextActions, ...handoff.unresolvedQuestions].filter((line) =>
          line?.trim()
        );
        if (followUps.length > 0) {
          const dependents = tasks.filter(
            (candidate) => candidate.dependencyTaskIds.includes(task.id) && candidate.assignedAgentId !== task.assignedAgentId
          );
          const mentions = Array.from(new Set(dependents.map((d) => d.assignedAgentId)));
          messages.push({
            kind: 'agent',
            id: `followup-${handoff.id}`,
            at: handoff.createdAt,
            agentId: handoff.agentId,
            text: followUps.join('\n'),
            mentions,
          });
        }
      }

      if (task.status === 'running') {
        messages.push({
          kind: 'typing',
          id: `typing-${task.id}`,
          at,
          agentId: task.assignedAgentId,
          hint: t(`is working on ${task.title}…`, `正在处理「${task.title}」…`),
        });
      }
      if (task.status === 'revision-requested') {
        messages.push({
          kind: 'system',
          id: `revision-${task.id}`,
          at,
          tone: 'warn',
          text: t(
            `Revision requested on "${task.title}" (attempt ${task.attempt}).`,
            `「${task.title}」被要求修订（第 ${task.attempt} 次尝试）。`
          ),
        });
      }
      if (task.status === 'failed') {
        messages.push({
          kind: 'system',
          id: `failed-${task.id}`,
          at,
          tone: 'error',
          text: t(`Task "${task.title}" failed.`, `任务「${task.title}」失败。`),
        });
      }
    }

    if (run.qualityGate) {
      const gate = run.qualityGate;
      const at = run.completedAt || run.startedAt;
      if (gate.verdict === 'passed') {
        messages.push({
          kind: 'system',
          id: `gate-${run.id}`,
          at,
          tone: 'info',
          text: t('Quality gate passed.', '质量门已通过。'),
        });
      } else {
        messages.push({
          kind: 'system',
          id: `gate-${run.id}`,
          at,
          tone: 'warn',
          text: t(`Quality gate: ${gate.verdict} — ${gate.summary}`, `质量门：${gate.verdict} — ${gate.summary}`),
        });
        if (gate.issues.length > 0) {
          // The critic is whoever the gate came from; fall back to the leader
          // when a team has no dedicated critic member.
          const criticTask = [...tasks].reverse().find((task) => task.assignedAgentId === 'scientific-critic');
          messages.push({
            kind: 'agent',
            id: `gate-issues-${run.id}`,
            at,
            agentId: criticTask?.assignedAgentId || 'scientific-critic',
            text: gate.issues.join('\n'),
            mentions: Array.from(
              new Set(
                tasks
                  .filter((task) => task.status === 'revision-requested' || task.status === 'awaiting-review')
                  .map((task) => task.assignedAgentId)
              )
            ),
          });
        }
      }
    }

    if (run.status === 'completed' && run.report) {
      messages.push({
        kind: 'report',
        id: `report-${run.id}`,
        at: run.completedAt || run.startedAt,
        run,
        leaderAgentId: run.leaderAgentId,
      });
    }
    if (run.status === 'failed') {
      messages.push({
        kind: 'system',
        id: `run-failed-${run.id}`,
        at: run.completedAt || run.startedAt,
        tone: 'error',
        // A tool/permission failure is reported as exactly that -- never as a
        // scientific negative result (see StructuredRunError.cause).
        text: run.failure
          ? t(`Run stopped: ${run.failure.message}`, `课题中止：${run.failure.message}`)
          : t('Run stopped.', '课题已中止。'),
      });
    }
    if (run.status === 'cancelled') {
      messages.push({
        kind: 'system',
        id: `run-cancelled-${run.id}`,
        at: run.completedAt || run.startedAt,
        tone: 'info',
        text: t('You cancelled this inquiry.', '你已取消该课题。'),
      });
    }
    if (run.status === 'reviewing') {
      messages.push({
        kind: 'typing',
        id: `typing-review-${run.id}`,
        at: new Date().toISOString(),
        agentId: 'scientific-critic',
        hint: t('is reviewing the findings…', '正在审阅结论…'),
      });
    }
    if (run.status === 'synthesizing') {
      messages.push({
        kind: 'typing',
        id: `typing-synth-${run.id}`,
        at: new Date().toISOString(),
        agentId: run.leaderAgentId,
        hint: t('is writing the final report…', '正在综合最终报告…'),
      });
    }
  }

  return chronological(messages);
}

/** One-line preview for the group list, in the "name: text" shape a chat list uses. */
export function lastMessagePreview(messages: GroupMessage[], nameOf: (agentId: string) => string, t: Translate): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    switch (message.kind) {
      case 'agent':
        return `${nameOf(message.agentId)}: ${message.text.replace(/\s+/g, ' ').slice(0, 60)}`;
      case 'handoff':
        return `${nameOf(message.agentId)}: ${t('submitted a handoff', '提交了任务交接')}`;
      case 'report':
        return `${nameOf(message.leaderAgentId)}: ${t('delivered the final report', '给出了最终报告')}`;
      case 'plan':
        return `${nameOf(message.leaderAgentId)}: ${t('proposed a task plan', '提出了任务计划')}`;
      case 'system':
        return message.text;
      case 'user':
        return `${t('You', '你')}: ${message.text.replace(/\s+/g, ' ').slice(0, 60)}`;
      default:
        break;
    }
  }
  return '';
}

export function isRunSettled(status: string): boolean {
  return SETTLED.has(status);
}

/** The newest message timestamp, used as the read marker for unread counts. */
export function latestMessageAt(messages: GroupMessage[]): string | undefined {
  return messages.length > 0 ? messages[messages.length - 1].at : undefined;
}

export function unreadCount(messages: GroupMessage[], lastReadAt?: string): number {
  if (!lastReadAt) return 0;
  const cutoff = Date.parse(lastReadAt);
  return messages.filter((message) => message.kind !== 'divider' && Date.parse(message.at) > cutoff).length;
}
