import type { Dispatch, SetStateAction } from 'react';
import type { RuntimeApprovalRequest, RuntimeEvent } from '@medscience/core';
import { AgentSession, AgentStatus, Artifact, Citation, ToolExecution } from '../types/agent';

export interface PlanTask {
  id: string;
  title: string;
  titleZh?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  evidenceIds?: string[];
  category?: string;
  resultNote?: string;
}

/**
 * The state AgentContext hands this reducer. Extracting the event switch out
 * of the provider keeps AgentContext to wiring and actions: the switch is
 * ~220 lines of pure "event in, setState out" that never needed to sit
 * inside the component, and on its own it can be read (and later tested)
 * without mounting the whole app.
 */
export interface RuntimeEventTargets {
  setStatus: Dispatch<SetStateAction<AgentStatus>>;
  setCurrentSession: Dispatch<SetStateAction<AgentSession>>;
  setSessions: Dispatch<SetStateAction<AgentSession[]>>;
  setPlanTasks: Dispatch<SetStateAction<PlanTask[]>>;
  setPendingApprovals: Dispatch<SetStateAction<RuntimeApprovalRequest[]>>;
  setRuntimeError: Dispatch<SetStateAction<string | undefined>>;
  setActiveRunId: Dispatch<SetStateAction<string | undefined>>;
}

/** Applies one runtime event from the shared event bus to the session state. */
export function createRuntimeEventHandler(targets: RuntimeEventTargets): (event: RuntimeEvent) => void {
  const {
    setStatus,
    setCurrentSession,
    setSessions,
    setPlanTasks,
    setPendingApprovals,
    setRuntimeError,
    setActiveRunId,
  } = targets;

  return (event: RuntimeEvent) => {
    switch (event.type) {
      case 'agent.started':
        setStatus('thinking');
        break;
      case 'agent.thinking':
        setStatus('thinking');
        // Replace the static "Formulating..." placeholder with the agent's
        // actual current step, so the message visibly progresses instead of
        // sitting on the same generic sentence for the whole run.
        if (event.payload.thought) {
          const thought = event.payload.thought;
          setCurrentSession((prev) => {
            const messages = prev.messages.map((m, idx) =>
              idx === prev.messages.length - 1 && m.role === 'agent' ? { ...m, content: thought } : m
            );
            return { ...prev, messages };
          });
        }
        break;
      case 'tool.started':
        setStatus('tool_calling');
        setCurrentSession((prev) => {
          const label = `Calling ${event.payload.toolName}...`;
          const messages = prev.messages.map((m, idx) =>
            idx === prev.messages.length - 1 && m.role === 'agent' ? { ...m, content: label } : m
          );
          return { ...prev, messages };
        });
        break;
      case 'tool.completed':
        setCurrentSession((prev) => {
          const exec = event.payload.execution;
          const messages = prev.messages.map((m, idx) => {
            if (idx === prev.messages.length - 1 && m.role === 'agent') {
              const existingTools = m.toolExecutions || [];
              const updatedTools: ToolExecution[] = [
                ...existingTools.filter((t) => t.id !== exec.id && t.toolName !== exec.toolName),
                {
                  id: exec.id,
                  toolName: exec.toolName,
                  category: exec.category as any,
                  description: exec.description,
                  status: 'completed',
                  duration: exec.duration,
                  resultSummary: exec.resultSummary,
                  logs: exec.logs,
                },
              ];
              return { ...m, toolExecutions: updatedTools };
            }
            return m;
          });
          return { ...prev, messages };
        });
        break;
      case 'artifact.created':
        setCurrentSession((prev) => {
          const art = event.payload.artifact as Artifact;
          const messages = prev.messages.map((m, idx) => {
            if (idx === prev.messages.length - 1 && m.role === 'agent') {
              return {
                ...m,
                artifacts: [...(m.artifacts || []).filter((a) => a.id !== art.id), art],
              };
            }
            return m;
          });
          return { ...prev, messages };
        });
        break;
      case 'citation.created':
        setCurrentSession((prev) => {
          const cit = event.payload.citation as Citation;
          const messages = prev.messages.map((m, idx) => {
            if (idx === prev.messages.length - 1 && m.role === 'agent') {
              return {
                ...m,
                citations: [...(m.citations || []).filter((c) => c.id !== cit.id), cit],
              };
            }
            return m;
          });
          return { ...prev, messages };
        });
        break;
      case 'plan.created':
        setPlanTasks(
          (event.payload.tasks || []).map((task: any) => ({
            id: task.id,
            title: task.title,
            titleZh: task.titleZh,
            status: task.status || 'pending',
            evidenceIds: task.evidenceIds || [],
            category: task.category,
            resultNote: task.resultNote,
          }))
        );
        break;
      case 'plan.task.updated':
      case 'plan.task.completed': {
        const incoming = (event.payload as any).task;
        setPlanTasks((prev) => {
          // plan.task.completed only carries evidenceIds/resultNote (no
          // status/title); merge onto the existing entry instead of
          // requiring a full task object every time.
          if (incoming) {
            return prev.map((t) =>
              t.id === incoming.id
                ? {
                    ...t,
                    title: incoming.title ?? t.title,
                    titleZh: incoming.titleZh ?? t.titleZh,
                    status: incoming.status ?? t.status,
                    evidenceIds: incoming.evidenceIds ?? t.evidenceIds,
                    category: incoming.category ?? t.category,
                    resultNote: incoming.resultNote ?? t.resultNote,
                  }
                : t
            );
          }
          const taskId = (event.payload as any).taskId;
          const evidenceIds = (event.payload as any).evidenceIds;
          const resultNote = (event.payload as any).resultNote;
          return prev.map((t) => (t.id === taskId ? { ...t, evidenceIds: evidenceIds ?? t.evidenceIds, resultNote: resultNote ?? t.resultNote } : t));
        });
        break;
      }
      case 'runtime.turn.started':
        setActiveRunId(event.payload.runId);
        setRuntimeError(undefined);
        break;
      case 'runtime.turn.completed':
        setActiveRunId(undefined);
        if (event.payload.status === 'cancelled') {
          setStatus('cancelled');
        } else if (event.payload.status === 'failed') {
          setStatus('error');
          if (event.payload.error) setRuntimeError(event.payload.error);
        }
        // 'completed' is left to agent.message.completed (below), which also
        // handles persisting the session -- runtime.turn.completed for the
        // local-runtime backend fires alongside it, not instead of it.
        break;
      case 'runtime.approval.requested':
        setStatus('waiting_for_permission');
        setPendingApprovals((prev) => [...prev.filter((a) => a.id !== event.payload.request.id), event.payload.request]);
        break;
      case 'runtime.error':
        setActiveRunId(undefined);
        setStatus('error');
        setRuntimeError(event.payload.message);
        break;
      case 'file.change.started':
        setCurrentSession((prev) => {
          const messages = prev.messages.map((m, idx) => {
            if (idx === prev.messages.length - 1 && m.role === 'agent') {
              const existingTools = m.toolExecutions || [];
              const exec: ToolExecution = {
                id: event.payload.itemId,
                toolName: 'file change',
                category: 'execution',
                description: (event.payload.files || []).join(', ') || 'Editing files',
                status: 'running',
                logs: [],
              };
              return { ...m, toolExecutions: [...existingTools.filter((t) => t.id !== exec.id), exec] };
            }
            return m;
          });
          return { ...prev, messages };
        });
        break;
      case 'file.change.completed':
        setCurrentSession((prev) => {
          const messages = prev.messages.map((m, idx) => {
            if (idx === prev.messages.length - 1 && m.role === 'agent') {
              const existingTools = m.toolExecutions || [];
              const updatedTools = existingTools.map((t) =>
                t.id === event.payload.itemId
                  ? { ...t, status: event.payload.status === 'failed' ? ('failed' as const) : ('completed' as const) }
                  : t
              );
              return { ...m, toolExecutions: updatedTools };
            }
            return m;
          });
          return { ...prev, messages };
        });
        break;
      case 'agent.message.completed':
        setStatus('completed');
        setCurrentSession((prev) => {
          const messages = prev.messages.map((m, idx) => {
            if (idx === prev.messages.length - 1 && m.role === 'agent') {
              return {
                ...m,
                content: event.payload.fullContent,
                status: 'completed' as AgentStatus,
              };
            }
            return m;
          });
          const updated = {
            ...prev,
            status: 'completed' as AgentStatus,
            updatedAt: new Date().toISOString(),
            messages,
          };
          setSessions((prevList) => {
            const exists = prevList.some((s) => s.id === updated.id);
            if (exists) {
              return prevList.map((s) => (s.id === updated.id ? updated : s));
            }
            return [updated, ...prevList];
          });
          return updated;
        });
        break;
    }
  };
}
