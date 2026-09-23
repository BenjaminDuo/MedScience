import { AgentId } from '../types/runtime.js';
import { AgentConfig, builtInAgents } from './BaseAgent.js';
import { resolveAgentPersona } from './agentPersona.js';
import { globalSkillRegistry } from '../skills/SkillRegistry.js';
import { globalToolRegistry } from '../tools/ToolRegistry.js';
import { ToolDefinition } from '../types/tools.js';

export class AgentRegistry {
  private agents: Map<AgentId, AgentConfig> = new Map();

  constructor() {
    builtInAgents.forEach((agent) => this.agents.set(agent.id, agent));
  }

  public get(id: AgentId): AgentConfig | undefined {
    return this.agents.get(id);
  }

  public list(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Tools this agent may use. `agentId` is a plain string because a session
   * can be held with any member of the team roster, not just the legacy
   * AgentId union -- resolveAgentPersona covers both.
   */
  public getScopedTools(agentId: string): ToolDefinition[] {
    const persona = resolveAgentPersona(agentId) || resolveAgentPersona('research')!;
    return globalToolRegistry.list().filter((tool) => persona.allowedToolCategories.includes(tool.category));
  }

  public assembleSystemPrompt(agentId: string, userQuery: string): string {
    const persona = resolveAgentPersona(agentId) || resolveAgentPersona('research')!;

    // Discover relevant skills for query
    const relevantSkills = globalSkillRegistry.discover(userQuery, 3);

    let prompt = `${persona.systemPrompt}\n\n`;

    if (relevantSkills.length > 0) {
      prompt += `### Active Scientific Skills:\n`;
      relevantSkills.forEach((skill) => {
        prompt += `\n**[Skill: ${skill.displayName}]**\n${skill.instructions}\n`;
      });
    }

    return prompt;
  }
}

export const globalAgentRegistry = new AgentRegistry();
