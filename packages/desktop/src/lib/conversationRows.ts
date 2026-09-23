import { AgentSession } from '../types/agent';
import { GroupSummary } from '../hooks/useTeamGroups';

/**
 * One row of the conversation list.
 *
 * The list is deliberately **bounded**: a row is a member you have talked to
 * or a team you have built, never an individual conversation. Rows-per-
 * conversation is what made teams impossible to find -- you create dozens of
 * conversations a week and only a handful of teams, so any recency sort
 * eventually buries the teams. With one row per member, the list can only
 * grow to (members you use + teams you built), and each member's
 * conversations become 课题 (topics) inside that member's thread, separated
 * the same way a team's runs already are.
 */
export const GENERAL_EXPERT_ID = 'general-expert';

export interface MemberRow {
  kind: 'member';
  agentId: string;
  /** This member's conversations in this workspace, oldest first (the thread order). */
  sessions: AgentSession[];
  latestAt?: string;
  topicCount: number;
  pinned: boolean;
}

export interface TeamRow {
  kind: 'team';
  group: GroupSummary;
  latestAt?: string;
  pinned: boolean;
}

export type ConversationRow = MemberRow | TeamRow;

/** Team runs get their own session records; they belong to the team's thread, not a member's. */
export function isUserConversation(session: AgentSession): boolean {
  return (session.origin || 'user') !== 'team';
}

export function buildMemberRows(sessions: AgentSession[], workspaceId: string): MemberRow[] {
  const byAgent = new Map<string, AgentSession[]>();
  for (const session of sessions) {
    if (!isUserConversation(session)) continue;
    if ((session.workspaceId || '') !== workspaceId) continue;
    // A conversation with no messages is a draft the user never sent; it
    // should not occupy the list.
    if (session.messages.length === 0) continue;
    const agentId = session.agentId || GENERAL_EXPERT_ID;
    byAgent.set(agentId, [...(byAgent.get(agentId) || []), session]);
  }

  // The general expert is always present, even before its first message --
  // it is the default entry point for a new conversation.
  if (!byAgent.has(GENERAL_EXPERT_ID)) byAgent.set(GENERAL_EXPERT_ID, []);

  return Array.from(byAgent.entries()).map(([agentId, list]) => {
    const ordered = [...list].sort(
      (a, b) => Date.parse(a.createdAt || a.updatedAt) - Date.parse(b.createdAt || b.updatedAt)
    );
    const newest = ordered[ordered.length - 1];
    return {
      kind: 'member',
      agentId,
      sessions: ordered,
      latestAt: newest?.updatedAt || newest?.createdAt,
      topicCount: ordered.length,
      pinned: agentId === GENERAL_EXPERT_ID,
    };
  });
}

/** Pinned first, then most recent activity; rows with no activity sink to the bottom. */
export function sortRows(rows: ConversationRow[]): ConversationRow[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return Date.parse(b.latestAt || '0') - Date.parse(a.latestAt || '0');
  });
}

export function lastMessageOf(session: AgentSession | undefined): string {
  if (!session) return '';
  const last = [...session.messages].reverse().find((message) => message.content?.trim());
  if (!last) return '';
  const text = last.content.replace(/\s+/g, ' ').trim();
  return last.role === 'user' ? text : text.slice(0, 80);
}
