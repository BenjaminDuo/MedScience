import type { RuntimeSession } from '@medscience/core';
import { AgentMessage, AgentSession, AgentStatus, Artifact, Citation, ToolExecution } from '../types/agent';
import { DEFAULT_WORKSPACE_ID } from '../context/WorkspaceContext';
import { canonicalAgentId } from './agentAliases';

/**
 * Core's session record -> the renderer's chat-shaped session.
 *
 * Core stores turns (one user input + one agent answer + its tool calls);
 * the UI renders a flat message list. This is the one place that conversion
 * happens, so the session list, a reopened conversation and a live turn all
 * agree on what a conversation looks like.
 *
 * Core is the source of truth: localStorage is only a cache that lets the
 * list paint before the first `session:list` call returns.
 */
export function toAgentSession(session: RuntimeSession): AgentSession {
  const messages: AgentMessage[] = (session.turns || []).flatMap((turn, index) => [
    {
      id: `msg-${session.id}-${index}-user`,
      role: 'user' as const,
      content: turn.userInput,
      timestamp: new Date(turn.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
    {
      id: `msg-${session.id}-${index}-agent`,
      role: 'agent' as const,
      status: turn.status as AgentStatus,
      content: turn.agentResponse,
      timestamp: new Date(turn.completedAt || turn.startedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      toolExecutions: ((turn.toolResults || []).map((result) => result.execution) || []) as ToolExecution[],
      // Artifacts and citations are recorded per session in core, so they
      // hang off the last answer rather than being split across turns.
      // Core's Artifact/Citation records are structurally looser than the
      // renderer's (optional doi, etc.); the UI renders what is present.
      artifacts: index === (session.turns?.length || 1) - 1 ? ((session.artifacts || []) as unknown as Artifact[]) : [],
      citations: index === (session.turns?.length || 1) - 1 ? ((session.citations || []) as unknown as Citation[]) : [],
    },
  ]);

  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status as AgentStatus,
    sessionType: session.sessionType || 'research',
    workspaceId: session.workspaceId || DEFAULT_WORKSPACE_ID,
    researchProfileId: session.researchProfileId || 'general',
    // Legacy sessions carry the old fixed agent ids; canonicalAgentId maps
    // them onto the member that plays that role today, so an old
    // conversation lands in the right member's thread.
    agentId: canonicalAgentId(session.activeAgent),
    origin: session.origin || 'user',
    teamRunId: session.teamRunId,
    messages,
  };
}

/** Newest first, which is the order every conversation list wants. */
export function toAgentSessions(sessions: RuntimeSession[]): AgentSession[] {
  return sessions
    .map(toAgentSession)
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
}
