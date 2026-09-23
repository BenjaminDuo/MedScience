import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AgentSession, AgentStatus, AgentMessage, ToolExecution, Artifact, Citation } from '../types/agent';
import { useNav } from './NavContext';
import { DEFAULT_WORKSPACE_ID } from './WorkspaceContext';
import { useLanguage } from './LanguageContext';
import type { RuntimeEvent, RuntimeApprovalRequest, RuntimeApprovalDecision, ExecutionProfile, Turn, RuntimeSession as CoreRuntimeSession } from '@medscience/core';

import { createRuntimeEventHandler, PlanTask } from '../lib/runtimeEventHandler';
import { toAgentSessions } from '../lib/sessionAdapter';

/** Keep in sync with DEFAULT_AGENT_ID in @medscience/core (agents/agentPersona.ts). */
export const DEFAULT_AGENT_ID = 'general-expert';

export type { PlanTask };

interface AgentContextType {
  sessions: AgentSession[];
  currentSession: AgentSession;
  activeView: 'home' | 'workspace';
  status: AgentStatus;
  planTasks: PlanTask[];
  submitPrompt: (promptText: string) => Promise<void>;
  resetSession: (
    sessionType?: 'chat' | 'research',
    workspaceId?: string,
    researchProfileId?: string,
    /** Who the new conversation is with; defaults to the general expert. */
    agentId?: string
  ) => void;
  /** Re-reads the session list from core (after a rename/delete, or when a team run creates one). */
  refreshSessions: () => Promise<void>;
  /** Flips the not-yet-started current session between chat/research. No-op once it has any turns -- see RuntimeSession.sessionType for why this is locked after creation. */
  setSessionType: (sessionType: 'chat' | 'research') => void;
  /** Picks the research workflow (see ResearchProfiles.ts in @medscience/core) for the not-yet-started current session. No-op once it has any turns, same lock as setSessionType. */
  setResearchProfile: (researchProfileId: string) => void;
  /** Picks which workspace the not-yet-started current session belongs to (composer picker, research-only). No-op once it has any turns, same lock as setSessionType/setResearchProfile. */
  setSessionWorkspace: (workspaceId: string) => void;
  /** QuickActions (home page): atomically starts a brand-new session with a specific sessionType/workspace/researchProfile and submits the first prompt into it in one go. See startQuickSession impl for why this bypasses setSessionType-then-submitPrompt. */
  startQuickSession: (
    promptText: string,
    sessionType?: 'chat' | 'research',
    researchProfileId?: string,
    workspaceId?: string
  ) => Promise<void>;
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

function createFreshSession(
  sessionType: 'chat' | 'research' = 'research',
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  researchProfileId: string = 'general',
  agentId: string = DEFAULT_AGENT_ID
): AgentSession {
  const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  return {
    id,
    title: sessionType === 'chat' ? 'New Chat' : 'New Scientific Exploration',
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    messages: [],
    sessionType,
    workspaceId,
    researchProfileId,
    agentId,
    origin: 'user',
  };
}

const LOCAL_STORAGE_SESSIONS_KEY = 'medscience_desktop_sessions_v1';

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { registerNewChatCallback } = useNav();
  const { language } = useLanguage();

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
    return createFreshSession('research', DEFAULT_WORKSPACE_ID);
  });

  const [activeView, setActiveView] = useState<'home' | 'workspace'>('home');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [pendingApprovals, setPendingApprovals] = useState<RuntimeApprovalRequest[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | undefined>(undefined);
  const [runtimeProfiles, setRuntimeProfiles] = useState<ExecutionProfile[]>([]);
  const [selectedExecutionProfileId, setSelectedExecutionProfileIdState] = useState<string | undefined>(undefined);

  /**
   * Picking a runtime (API vs local CLI) applies everywhere, not just to
   * the next message: it writes through to the globally active Execution
   * Profile. Before this, the choice lived only in this React state, so it
   * silently reverted for every other conversation and after a restart --
   * while the sandbox/approval level it implies is exactly the kind of
   * setting a user expects to stay put.
   */
  const setSelectedExecutionProfileId = useCallback((id: string | undefined) => {
    setSelectedExecutionProfileIdState(id);
    if (id) {
      window.medscience?.runtime
        ?.setActiveProfile(id)
        .catch((err) => console.error('[MedScience] runtime.setActiveProfile() failed:', err));
    }
  }, []);
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
    if (!window.medscience) {
      console.error('[MedScience] window.medscience is not defined -- the runtime bridge (Electron preload or webApi.ts) never installed itself. The prompt bar\'s runtime/tool pickers cannot load.');
      return;
    }
    if (!window.medscience.runtime) {
      console.error('[MedScience] window.medscience.runtime is missing from the bridge API -- the execution-profile picker cannot load its list.');
    }
    window.medscience.runtime
      ?.listProfiles()
      .then((profiles) => {
        console.log('[MedScience] runtime.listProfiles() ->', profiles);
        setRuntimeProfiles(profiles || []);
      })
      .catch((err) => console.error('[MedScience] runtime.listProfiles() failed:', err));
    window.medscience.runtime
      ?.getActiveProfile()
      .then((active) => setSelectedExecutionProfileIdState((prev) => prev ?? active?.id))
      .catch((err) => console.error('[MedScience] runtime.getActiveProfile() failed:', err));
    window.medscience.agent
      ?.listTools?.()
      .then((tools) => setAvailableTools(tools || []))
      .catch((err) => console.error('[MedScience] agent.listTools() failed:', err));
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

  // Core (~/.medscience/sessions) is the source of truth for the session
  // list; the localStorage copy above is just what paints before this
  // returns. Team-run sessions come back here too, tagged origin: 'team',
  // so the conversation list can keep them in their team's thread.
  const refreshSessions = useCallback(async () => {
    if (!window.medscience?.session) return;
    try {
      const list = await window.medscience.session.list();
      setSessions(toAgentSessions(list || []));
    } catch {
      // Offline/bridge missing: keep whatever the cache gave us.
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

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

  const handleRuntimeEvent = createRuntimeEventHandler({
    setStatus,
    setCurrentSession,
    setSessions,
    setPlanTasks,
    setPendingApprovals,
    setRuntimeError,
    setActiveRunId,
  });

  const resetSession = (
    sessionType: 'chat' | 'research' = 'research',
    workspaceId?: string,
    researchProfileId?: string,
    agentId?: string
  ) => {
    // A brand-new conversation is NOT bound to whichever workspace happens
    // to be expanded in the sidebar tree -- that would make opening a
    // workspace to browse it silently change where the next "新对话" goes.
    // It defaults to 未分类 (DEFAULT_WORKSPACE_ID) unless the caller passes
    // an explicit workspaceId, which is exactly what setSessionWorkspace
    // (the composer's workspace picker, research-only) does once the user
    // actually picks one for this not-yet-started session.
    const fresh = createFreshSession(
      sessionType,
      workspaceId || DEFAULT_WORKSPACE_ID,
      researchProfileId || 'general',
      agentId || DEFAULT_AGENT_ID
    );
    setCurrentSession(fresh);
    setStatus('idle');
    setPlanTasks([]);
    setActiveView('home');
    setActiveRunId(undefined);
    setPendingApprovals([]);
    setRuntimeError(undefined);
  };

  const setSessionType = (sessionType: 'chat' | 'research') => {
    setCurrentSession((prev) => {
      if (prev.messages.length > 0) return prev; // locked once the conversation has actually started
      return {
        ...prev,
        sessionType,
        title: sessionType === 'chat' ? 'New Chat' : 'New Scientific Exploration',
      };
    });
  };

  const setResearchProfile = (researchProfileId: string) => {
    setCurrentSession((prev) => {
      if (prev.messages.length > 0) return prev; // locked once the conversation has actually started
      return { ...prev, researchProfileId };
    });
  };

  // Composer's workspace picker (research-only, see WorkspacePicker.tsx):
  // lets the user explicitly assign this not-yet-started conversation to a
  // workspace. Left untouched, it stays at 未分类 (DEFAULT_WORKSPACE_ID),
  // same lock-once-started rule as setSessionType/setResearchProfile.
  const setSessionWorkspace = (workspaceId: string) => {
    setCurrentSession((prev) => {
      if (prev.messages.length > 0) return prev;
      return { ...prev, workspaceId };
    });
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

  // Shared by submitPrompt (uses whatever is currently the live session) and
  // startQuickSession (QuickActions on the home page: builds a brand-new
  // session with a specific sessionType/workspace/researchProfile and
  // submits into THAT one, not whatever currentSession happened to close
  // over at render time -- setSessionType/setResearchProfile/etc followed
  // immediately by submitPrompt in the same handler would race React's
  // state update, since submitPrompt's closure still sees the pre-update
  // currentSession. Taking the base session explicitly sidesteps that.
  const submitPromptOn = async (baseSession: AgentSession, promptText: string) => {
    if (!promptText.trim()) return;

    const trimmed = promptText.trim();
    const isFirstInquiry = baseSession.messages.length === 0;
    const sessionTitle = isFirstInquiry ? trimmed.slice(0, 50) : baseSession.title;

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
      ...baseSession,
      title: sessionTitle,
      status: 'thinking',
      updatedAt: new Date().toISOString(),
      messages: [...baseSession.messages, userMessage, initialAgentMessage],
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
        const result = await window.medscience.agent.submitPrompt(
          trimmed,
          baseSession.id,
          selectedExecutionProfileId,
          baseSession.sessionType,
          baseSession.workspaceId,
          baseSession.researchProfileId,
          language,
          baseSession.agentId
        );
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

  const submitPrompt = (promptText: string) => submitPromptOn(currentSession, promptText);

  // QuickActions (home page): atomically starts a brand-new session with a
  // specific sessionType/workspace/researchProfile and submits the first
  // prompt into it in one go, bypassing the setSessionType-then-submitPrompt
  // race described on submitPromptOn above.
  const startQuickSession = async (
    promptText: string,
    sessionType: 'chat' | 'research' = 'research',
    researchProfileId: string = 'general',
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ) => {
    const fresh = createFreshSession(sessionType, workspaceId, researchProfileId);
    setCurrentSession(fresh);
    setStatus('idle');
    setPlanTasks([]);
    setActiveView('home');
    setActiveRunId(undefined);
    setPendingApprovals([]);
    setRuntimeError(undefined);
    await submitPromptOn(fresh, promptText);
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
        refreshSessions,
        setSessionType,
        setResearchProfile,
        setSessionWorkspace,
        startQuickSession,
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
