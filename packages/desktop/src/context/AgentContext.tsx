import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AgentSession, AgentStatus, AgentMessage, ToolExecution, Artifact, Citation } from '../types/agent';
import { useNav } from './NavContext';
import type { RuntimeEvent, RuntimeApprovalRequest, RuntimeApprovalDecision, ExecutionProfile, Turn, RuntimeSession as CoreRuntimeSession } from '@medscience/core';

export interface PlanTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  evidenceIds?: string[];
  category?: string;
  resultNote?: string;
}

interface AgentContextType {
  sessions: AgentSession[];
  currentSession: AgentSession;
  activeView: 'home' | 'workspace';
  status: AgentStatus;
  planTasks: PlanTask[];
  submitPrompt: (promptText: string) => Promise<void>;
  resetSession: () => void;
  openSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string) => Promise<string>;
  setActiveView: (view: 'home' | 'workspace') => void;
  activeRunId?: string;
  pendingApprovals: RuntimeApprovalRequest[];
  runtimeError?: string;
  cancelActiveRun: () => Promise<void>;
  respondApproval: (approvalId: string, decision: RuntimeApprovalDecision) => Promise<void>;
  // Prompt-bar "permission" picker: which Execution Profile (API vs local
  // Codex, and for local Codex which sandbox/approval level) runs the NEXT
  // submitted prompt. Defaults to whatever is active in Settings; picking
  // one here overrides it for this session only, without touching Settings.
  runtimeProfiles: ExecutionProfile[];
  selectedExecutionProfileId?: string;
  setSelectedExecutionProfileId: (id: string | undefined) => void;
  // Prompt-bar "prioritize these databases/tools" picker.
  availableTools: { name: string; description: string; category: string }[];
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

function createFreshSession(): AgentSession {
  const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  return {
    id,
    title: 'New Scientific Exploration',
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    messages: [],
  };
}

const LOCAL_STORAGE_SESSIONS_KEY = 'medscience_desktop_sessions_v1';

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { registerNewChatCallback } = useNav();

  const [sessions, setSessions] = useState<AgentSession[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [currentSession, setCurrentSession] = useState<AgentSession>(() => {
    return createFreshSession();
  });

  const [activeView, setActiveView] = useState<'home' | 'workspace'>('home');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [pendingApprovals, setPendingApprovals] = useState<RuntimeApprovalRequest[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | undefined>(undefined);
  const [runtimeProfiles, setRuntimeProfiles] = useState<ExecutionProfile[]>([]);
  const [selectedExecutionProfileId, setSelectedExecutionProfileId] = useState<string | undefined>(undefined);
  const [availableTools, setAvailableTools] = useState<{ name: string; description: string; category: string }[]>([]);

  // Accumulates raw text chunks streamed from the active backend (API model
  // or local Codex CLI -- both push through the same onDelta channel; see
  // ApiResearchBackend/CodexRuntimeBackend) for the turn currently in
  // flight. Reset at the start of every submitPrompt call so a new turn
  // never inherits leftover text from the previous one.
  const streamingContentRef = useRef<string>('');

  // Load the runtime/permission profiles and tool catalog once for the
  // prompt bar's pickers. Defaults the selection to whatever is active in
  // Settings so nothing changes until the user explicitly picks something.
  useEffect(() => {
    if (!window.medscience) return;
    window.medscience.runtime
      ?.listProfiles()
      .then((profiles) => setRuntimeProfiles(profiles || []))
      .catch(() => {});
    window.medscience.runtime
      ?.getActiveProfile()
      .then((active) => setSelectedExecutionProfileId((prev) => prev ?? active?.id))
      .catch(() => {});
    window.medscience.agent
      ?.listTools?.()
      .then((tools) => setAvailableTools(tools || []))
      .catch(() => {});
  }, []);

  // Register ⌘N shortcut handler
  useEffect(() => {
    registerNewChatCallback(() => {
      resetSession();
    });
  }, [registerNewChatCallback]);

  // Save sessions to localStorage whenever sessions list changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
    } catch {}
  }, [sessions]);

  // Load real sessions from Electron IPC on mount if available
  useEffect(() => {
    if (window.medscience?.session) {
      window.medscience.session
        .list()
        .then((list) => {
          if (list && list.length > 0) {
            const converted: AgentSession[] = list.map((rs) => ({
              id: rs.id,
              title: rs.title,
              createdAt: rs.createdAt,
              updatedAt: rs.updatedAt,
              status: rs.status as AgentStatus,
              messages:
                rs.turns?.flatMap((t, idx) => [
                  {
                    id: `msg-${rs.id}-${idx}-user`,
                    role: 'user' as const,
                    content: t.userInput,
                    timestamp: new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                  {
                    id: `msg-${rs.id}-${idx}-agent`,
                    role: 'agent' as const,
                    status: t.status as AgentStatus,
                    content: t.agentResponse,
                    timestamp: new Date(t.completedAt || t.startedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    toolExecutions: (t.toolResults?.map((tr) => tr.execution as any) || []) as ToolExecution[],
                    artifacts: (rs.artifacts as any[] || []) as Artifact[],
                    citations: (rs.citations as any[] || []) as Citation[],
                  },
                ]) || [],
            }));
            setSessions(converted);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Listen to IPC runtime events from Electron Main process
  useEffect(() => {
    if (window.medscience?.agent) {
      const unsub = window.medscience.agent.onEvent((event: RuntimeEvent) => {
        handleRuntimeEvent(event);
      });
      return unsub;
    }
  }, []);

  // Live-stream the response text itself as it's generated. This is the
  // one channel both backends push raw text through uniformly (see
  // ApiResearchBackend.execute / CodexRuntimeBackend.execute's onDelta
  // callbacks) -- API turns also get incremental 'agent.thinking' status
  // labels, but local-runtime (Codex) turns don't emit those at all, so
  // without this the composing message sat frozen on the initial
  // "Formulating..." placeholder for the whole turn in that mode.
  useEffect(() => {
    if (!window.medscience?.agent?.onDelta) return;
    const unsub = window.medscience.agent.onDelta((delta: string) => {
      streamingContentRef.current += delta;
      const streamed = streamingContentRef.current;
      setCurrentSession((prev) => {
        const messages = prev.messages.map((m, idx) =>
          idx === prev.messages.length - 1 && m.role === 'agent' ? { ...m, content: streamed } : m
        );
        return { ...prev, messages };
      });
    });
    return unsub;
  }, []);

  const handleRuntimeEvent = (event: RuntimeEvent) => {
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
                ? { ...t, title: incoming.title ?? t.title, status: incoming.status ?? t.status, evidenceIds: incoming.evidenceIds ?? t.evidenceIds, category: incoming.category ?? t.category, resultNote: incoming.resultNote ?? t.resultNote }
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

  const resetSession = () => {
    const fresh = createFreshSession();
    setCurrentSession(fresh);
    setStatus('idle');
    setPlanTasks([]);
    setActiveView('home');
    setActiveRunId(undefined);
    setPendingApprovals([]);
    setRuntimeError(undefined);
  };

  const cancelActiveRun = async () => {
    if (!activeRunId) return;
    if (window.medscience?.agent?.cancel) {
      try {
        await window.medscience.agent.cancel(activeRunId);
      } catch (err) {
        console.error('Failed to cancel the active run:', err);
      }
    }
    // Optimistically clear locally too -- runtime.turn.completed (status
    // 'cancelled') will confirm this once the backend actually tears the
    // run down, but the Stop button should feel immediate either way.
    setActiveRunId(undefined);
  };

  const respondApproval = async (approvalId: string, decision: RuntimeApprovalDecision) => {
    setPendingApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    if (window.medscience?.runtime?.respondApproval) {
      try {
        await window.medscience.runtime.respondApproval(currentSession.id, approvalId, decision);
      } catch (err) {
        console.error('Failed to respond to approval request:', err);
      }
    }
  };

  const openSession = (sessionId: string) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (target) {
      setCurrentSession(target);
      setStatus(target.status);
      setActiveView('workspace');
    }
  };

  const renameSession = async (sessionId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    if (window.medscience?.session?.rename) {
      try {
        await window.medscience.session.rename(sessionId, trimmed);
      } catch (err) {
        console.error('Failed to rename session over IPC:', err);
      }
    }

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed, updatedAt: new Date().toISOString() } : s))
    );

    setCurrentSession((prev) => (prev.id === sessionId ? { ...prev, title: trimmed } : prev));
  };

  const deleteSession = async (sessionId: string) => {
    if (window.medscience?.session?.delete) {
      try {
        await window.medscience.session.delete(sessionId);
      } catch (err) {
        console.error('Failed to delete session over IPC:', err);
      }
    }

    setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    if (currentSession.id === sessionId) {
      resetSession();
    }
  };

  const exportSession = async (sessionId: string): Promise<string> => {
    if (window.medscience?.session) {
      try {
        const exported = await window.medscience.session.export(sessionId);
        if (exported) return exported;
      } catch {}
    }

    const sess = sessions.find((s) => s.id === sessionId) || (currentSession.id === sessionId ? currentSession : null);
    if (!sess) return '# Session Not Found\n';

    const lines: string[] = [
      `# MedScience Research Report: ${sess.title}`,
      `\n**Session ID**: \`${sess.id}\`  `,
      `**Created At**: ${new Date(sess.createdAt).toLocaleString()}  `,
      `**Status**: \`${sess.status.toUpperCase()}\`\n`,
      `---\n`,
      `## Research Dialogue & Investigation Stream\n`,
    ];

    sess.messages.forEach((msg) => {
      const isAgent = msg.role === 'agent';
      lines.push(`### ${isAgent ? '🔬 MedScience Agent' : '👤 User Inquiry'} (${msg.timestamp})`);
      lines.push(`${msg.content}\n`);

      if (msg.toolExecutions && msg.toolExecutions.length > 0) {
        lines.push(`**Executed Scientific Tools:**`);
        msg.toolExecutions.forEach((t) => {
          lines.push(`- **\`${t.toolName}\`** (${t.status}, ${t.duration || 'N/A'}): ${t.resultSummary || t.description}`);
        });
        lines.push('');
      }

      if (msg.artifacts && msg.artifacts.length > 0) {
        lines.push(`**Generated Research Artifacts:**`);
        msg.artifacts.forEach((art) => {
          lines.push(`- **${art.title}** (\`${art.type}\`): ${art.description}`);
        });
        lines.push('');
      }

      if (msg.citations && msg.citations.length > 0) {
        lines.push(`**Verified Evidence & Citations:**`);
        msg.citations.forEach((cit, cIdx) => {
          lines.push(`[${cIdx + 1}] **${cit.title}** (${cit.journal || 'Journal'}, ${cit.year || 'Year'})`);
          if (cit.pmid) lines.push(`    PMID: [${cit.pmid}](https://pubmed.ncbi.nlm.nih.gov/${cit.pmid}/)`);
          if (cit.doi) lines.push(`    DOI: [${cit.doi}](https://doi.org/${cit.doi})`);
        });
        lines.push('');
      }
    });

    lines.push(`\n---\n*Generated by MedScience Autonomous Research Workstation*`);
    return lines.join('\n');
  };

  // The resolved value of window.medscience.agent.submitPrompt(...) is the
  // authoritative outcome of a turn -- {session, turn} exactly as the
  // backend (API research loop or local Codex) actually finished it.
  // AutonomousResearchEngine (the API-mode backend, used whenever the
  // active Execution Profile is "API" rather than local Codex) only ever
  // emits sparse 'agent.thinking' events over the event bus and NEVER a
  // completion event ('agent.message.completed', 'plan.created', etc. are
  // only emitted by the local-runtime/Codex backend) -- so relying on live
  // events alone left API-mode turns frozen on the initial placeholder
  // forever even though the backend had already produced a real answer.
  // Applying the resolved result directly here closes that gap for both
  // backends, in addition to (not instead of) the live event handling
  // above.
  const applyTurnResult = (turn: Turn, session?: CoreRuntimeSession) => {
    setStatus(turn.status as AgentStatus);
    setCurrentSession((prev) => {
      const messages = prev.messages.map((m, idx) => {
        if (idx === prev.messages.length - 1 && m.role === 'agent') {
          return {
            ...m,
            content: turn.agentResponse,
            status: turn.status as AgentStatus,
            toolExecutions: (turn.toolResults || []).map((tr) => tr.execution as any) as ToolExecution[],
            artifacts: session?.artifacts ? (session.artifacts as any[] as Artifact[]) : m.artifacts,
            citations: session?.citations ? (session.citations as any[] as Citation[]) : m.citations,
          };
        }
        return m;
      });
      const updated = {
        ...prev,
        title: session?.title || prev.title,
        status: turn.status as AgentStatus,
        updatedAt: new Date().toISOString(),
        messages,
      };
      setSessions((prevList) => {
        const exists = prevList.some((s) => s.id === updated.id);
        if (exists) return prevList.map((s) => (s.id === updated.id ? updated : s));
        return [updated, ...prevList];
      });
      return updated;
    });
  };

  const submitPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;

    const trimmed = promptText.trim();
    const isFirstInquiry = currentSession.messages.length === 0;
    const sessionTitle = isFirstInquiry ? trimmed.slice(0, 50) : currentSession.title;

    const userMessage: AgentMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Fresh turn -- clear any streamed text left over from a previous one
    // before the new placeholder message (and any onDelta chunks for this
    // turn) start arriving.
    streamingContentRef.current = '';

    const agentMessageId = `msg-${Date.now()}-agent`;
    const initialAgentMessage: AgentMessage = {
      id: agentMessageId,
      role: 'agent',
      status: 'thinking',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: 'Formulating scientific research hypothesis and searching foundational databases...',
      toolExecutions: [],
      artifacts: [],
      citations: [],
    };

    const activeSession: AgentSession = {
      ...currentSession,
      title: sessionTitle,
      status: 'thinking',
      updatedAt: new Date().toISOString(),
      messages: [...currentSession.messages, userMessage, initialAgentMessage],
    };

    // The real plan (with its real titles/categories) arrives moments later
    // via the 'plan.created' runtime event -- this used to seed a fake,
    // hardcoded 5-task placeholder here that never reflected what the
    // backend actually did. Starting empty and letting the real event
    // populate it keeps the panel honest instead of showing invented steps.
    setPlanTasks([]);

    setCurrentSession(activeSession);
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === activeSession.id);
      if (exists) {
        return prev.map((s) => (s.id === activeSession.id ? activeSession : s));
      }
      return [activeSession, ...prev];
    });

    setStatus('thinking');
    setActiveView('workspace');
    setPendingApprovals([]);
    setRuntimeError(undefined);

    try {
      if (window.medscience?.agent) {
        const result = await window.medscience.agent.submitPrompt(trimmed, currentSession.id, selectedExecutionProfileId);
        if (result?.turn) {
          applyTurnResult(result.turn as Turn, result.session as CoreRuntimeSession | undefined);
        }
      } else {
        // Fallback for browser preview / development environment
        setTimeout(() => {
          setStatus('tool_calling');
          setPlanTasks((prev) =>
            prev.map((t, idx) => {
              if (idx === 0) return { ...t, status: 'completed' };
              if (idx === 1) return { ...t, status: 'in_progress' };
              return t;
            })
          );
        }, 800);

        setTimeout(() => {
          setStatus('completed');
          setPlanTasks((prev) => prev.map((t) => ({ ...t, status: 'completed' })));
          setCurrentSession((prev) => {
            const msgs = prev.messages.map((m, idx) => {
              if (idx === prev.messages.length - 1 && m.role === 'agent') {
                return {
                  ...m,
                  status: 'completed' as AgentStatus,
                  content: `### Scientific Research Synthesis: ${trimmed}\n\n*Note: Running in Web Preview Mode. For production execution, configure your API endpoint in Settings or launch via Desktop Electron.*`,
                };
              }
              return m;
            });
            const completed = {
              ...prev,
              status: 'completed' as AgentStatus,
              updatedAt: new Date().toISOString(),
              messages: msgs,
            };
            setSessions((prevList) => prevList.map((s) => (s.id === completed.id ? completed : s)));
            return completed;
          });
        }, 2000);
      }
    } catch (err) {
      console.error('Agent execution error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setRuntimeError(message);
      setCurrentSession((prev) => {
        const messages = prev.messages.map((m, idx) => {
          if (idx === prev.messages.length - 1 && m.role === 'agent') {
            return { ...m, status: 'error' as AgentStatus, content: `Request failed: ${message}` };
          }
          return m;
        });
        const updated = { ...prev, status: 'error' as AgentStatus, updatedAt: new Date().toISOString(), messages };
        setSessions((prevList) => prevList.map((s) => (s.id === updated.id ? updated : s)));
        return updated;
      });
    }
  };

  return (
    <AgentContext.Provider
      value={{
        sessions,
        currentSession,
        activeView,
        status,
        planTasks,
        submitPrompt,
        resetSession,
        openSession,
        renameSession,
        deleteSession,
        exportSession,
        setActiveView,
        activeRunId,
        pendingApprovals,
        runtimeError,
        cancelActiveRun,
        respondApproval,
        runtimeProfiles,
        selectedExecutionProfileId,
        setSelectedExecutionProfileId,
        availableTools,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
};

export const useAgent = () => {
  const context = useContext(AgentContext);
  if (!context) throw new Error('useAgent must be used within AgentProvider');
  return context;
};
