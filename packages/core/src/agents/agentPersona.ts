import { AgentConfig, builtInAgents } from './BaseAgent.js';
import { globalTeamAgentRegistry } from '../teams/TeamRegistry.js';
import { AgentDefinition } from '../teams/types.js';

/**
 * One way to answer "who am I talking to", for every conversation in the app.
 *
 * MedScience grew two separate agent rosters: the fixed AgentId union in
 * agents/BaseAgent.ts (used by the single-conversation path) and the team
 * member registry in teams/BuiltInAgents.ts (used by Research Teams). The
 * UI now offers exactly one roster -- the members -- because a 1:1 chat IS
 * "talk to a member", so the member registry is the primary source here and
 * the legacy configs are the fallback for sessions created before that.
 *
 * Merging the two records themselves is a separate migration; this resolver
 * is what lets the product behave as if they were already one.
 */
export interface AgentPersona {
  id: string;
  name: string;
  title: string;
  /** The agent's own prompt, plus the user's standing instructions for it. */
  systemPrompt: string;
  allowedToolCategories: string[];
  defaultSkillIds: string[];
  source: 'member' | 'legacy';
}

/** The member every new conversation starts with unless the user picks someone else. */
export const DEFAULT_AGENT_ID = 'general-expert';

/**
 * The legacy single-conversation agent ids, mapped onto the member that now
 * plays that role. Sessions created before the two rosters were unified
 * carry these ids; without the map they would each become their own,
 * nameless row in the conversation list and would not pick up the member's
 * standing instructions.
 */
export const LEGACY_AGENT_ALIASES: Record<string, string> = {
  research: 'general-expert',
  biology: 'biology-specialist',
  chemistry: 'chemistry-specialist',
  ml: 'ml-specialist',
  critic: 'scientific-critic',
  plan: 'research-planner',
  // 'literature-reviewer' exists under the same id in both rosters.
};

/** Resolves an id from either roster to the member id the app uses today. */
export function canonicalAgentId(agentId?: string): string {
  if (!agentId) return DEFAULT_AGENT_ID;
  return LEGACY_AGENT_ALIASES[agentId] || agentId;
}

function fromMember(agent: AgentDefinition): AgentPersona {
  const instructions = agent.userInstructions?.trim();
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title,
    systemPrompt: instructions
      ? `${agent.systemPrompt}\n\nStanding instructions from the user (always apply):\n${instructions}`
      : agent.systemPrompt,
    allowedToolCategories: agent.allowedToolCategories as string[],
    defaultSkillIds: agent.defaultSkillIds,
    source: 'member',
  };
}

function fromLegacy(config: AgentConfig): AgentPersona {
  return {
    id: config.id,
    name: config.name,
    title: config.title,
    systemPrompt: config.systemPrompt,
    allowedToolCategories: config.allowedToolCategories,
    defaultSkillIds: config.defaultSkills,
    source: 'legacy',
  };
}

export function resolveAgentPersona(agentId?: string): AgentPersona | undefined {
  if (!agentId) return undefined;
  const member = globalTeamAgentRegistry.get(canonicalAgentId(agentId));
  if (member) return fromMember(member);
  const legacy = builtInAgents.find((agent) => agent.id === agentId);
  return legacy ? fromLegacy(legacy) : undefined;
}

/**
 * The persona block appended to an engine's own system prompt.
 *
 * The engine's protocol (evidence gates, tool discipline) always stays in
 * charge -- a member's prompt shapes HOW it works within that protocol, it
 * does not replace it. Returns '' for an unknown agent so a stale id can
 * never blank out an engine prompt.
 */
export function personaPromptBlock(agentId?: string): string {
  const persona = resolveAgentPersona(agentId);
  if (!persona) return '';
  return `\n\n--- You are acting as: ${persona.name} (${persona.title}) ---\n${persona.systemPrompt}`;
}
