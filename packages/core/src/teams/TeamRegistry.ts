import { AgentDefinition, TeamAgentId } from './types.js';
import { builtInTeamAgents } from './BuiltInAgents.js';

/**
 * Read-only registry over the built-in, team-scoped agent roles.
 *
 * Phase 1 deliberately does not support user-authored custom agents (design
 * doc section 18, "第一期不建议实现" item 7: no arbitrary user-written
 * system-level agent prompts yet) -- so, unlike TeamProfileManager, this
 * registry has no persistence layer. It exists mainly so
 * ResearchTeamDefinition.members can be validated against a real set of
 * known agent ids, and so the UI has a single place to resolve an agent id
 * to its display info.
 */
export class TeamAgentRegistry {
  private agents: Map<TeamAgentId, AgentDefinition> = new Map();

  constructor() {
    builtInTeamAgents.forEach((agent) => this.agents.set(agent.id, agent));
  }

  public get(id: TeamAgentId): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  public has(id: TeamAgentId): boolean {
    return this.agents.has(id);
  }

  public list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }
}

export const globalTeamAgentRegistry = new TeamAgentRegistry();
