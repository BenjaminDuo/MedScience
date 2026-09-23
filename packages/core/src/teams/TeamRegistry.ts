import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentDefinition, TeamAgentId } from './types.js';
import { builtInTeamAgents } from './BuiltInAgents.js';

interface AgentsConfigFile {
  version: string;
  /** Per-agent, user-editable layer over a built-in definition. */
  overrides: Record<string, { userInstructions?: string; enabled?: boolean }>;
  /** Fully user-authored members. */
  custom: AgentDefinition[];
}

const EMPTY_CONFIG: AgentsConfigFile = { version: '1.0.0', overrides: {}, custom: [] };

/**
 * The single roster of research members.
 *
 * Members are account-wide on purpose: a member is a role definition
 * (prompt, tool categories, privacy class), and the same statistician is
 * useful in every workspace. What IS per-workspace is how members are
 * assembled into teams (ResearchTeamDefinition.workspaceId), and what is
 * per-team is a member's extra brief (ResearchTeamMember.memberInstructions).
 *
 * This registry was read-only in Phase 1. It now persists two user-editable
 * things, because the member card is the one place a member is configured:
 * standing instructions on a built-in member, and fully custom members. A
 * built-in's systemPrompt/tool categories stay untouchable -- privacyClass
 * and allowedToolCategories are enforced against that prompt, so a
 * rewritable prompt would make 'sensitive-clinical' meaningless.
 */
export class TeamAgentRegistry {
  private customDir?: string;

  constructor(customDir?: string) {
    this.customDir = customDir;
  }

  private getConfigFile(): string {
    const base = this.customDir || process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
    return path.join(base, 'agents.json');
  }

  private readConfig(): AgentsConfigFile {
    const file = this.getConfigFile();
    if (!fs.existsSync(file)) return { ...EMPTY_CONFIG };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as AgentsConfigFile;
      return {
        version: parsed.version || '1.0.0',
        overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
        custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      };
    } catch {
      // Corrupted config: keep the file aside rather than overwrite it, and
      // fall back to the built-ins so the app still works.
      try {
        fs.copyFileSync(file, `${file}.corrupted-${Date.now()}`);
      } catch {
        // best effort
      }
      return { ...EMPTY_CONFIG };
    }
  }

  private writeConfig(config: AgentsConfigFile): void {
    const file = this.getConfigFile();
    const dir = path.dirname(file);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch {
      // Read-only filesystem: edits simply do not persist this session.
    }
  }

  private compose(): Map<TeamAgentId, AgentDefinition> {
    const config = this.readConfig();
    const map = new Map<TeamAgentId, AgentDefinition>();
    for (const agent of builtInTeamAgents) {
      const override = config.overrides[agent.id];
      map.set(agent.id, override ? { ...agent, ...override } : agent);
    }
    for (const agent of config.custom) {
      map.set(agent.id, { ...agent, builtIn: false });
    }
    return map;
  }

  public get(id: TeamAgentId): AgentDefinition | undefined {
    return this.compose().get(id);
  }

  public has(id: TeamAgentId): boolean {
    return this.compose().has(id);
  }

  public list(): AgentDefinition[] {
    return Array.from(this.compose().values()).filter((agent) => agent.enabled !== false);
  }

  /** The user's standing instructions for a member; '' clears them. */
  public setUserInstructions(id: TeamAgentId, userInstructions: string): { success: boolean; errors?: string[] } {
    if (!this.has(id)) return { success: false, errors: [`Unknown member id "${id}".`] };
    const config = this.readConfig();
    const custom = config.custom.find((agent) => agent.id === id);
    if (custom) {
      custom.userInstructions = userInstructions.trim() || undefined;
    } else {
      const existing = config.overrides[id] || {};
      config.overrides[id] = { ...existing, userInstructions: userInstructions.trim() || undefined };
    }
    this.writeConfig(config);
    return { success: true };
  }

  /**
   * Creates or updates a user-authored member. Built-ins cannot be replaced
   * this way -- they only take the override layer above.
   */
  public saveCustomAgent(
    agent: Omit<AgentDefinition, 'builtIn' | 'version'> & Partial<Pick<AgentDefinition, 'version'>>
  ): { success: boolean; agent?: AgentDefinition; errors?: string[] } {
    const errors: string[] = [];
    if (!agent.name?.trim()) errors.push('A member needs a name.');
    if (!agent.systemPrompt?.trim()) errors.push('A member needs a system prompt.');
    if (builtInTeamAgents.some((builtIn) => builtIn.id === agent.id)) {
      errors.push(`"${agent.id}" is a built-in member and cannot be overwritten.`);
    }
    if (errors.length > 0) return { success: false, errors };

    const config = this.readConfig();
    const id = agent.id || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = config.custom.find((candidate) => candidate.id === id);
    const saved: AgentDefinition = {
      ...(agent as AgentDefinition),
      id,
      builtIn: false,
      enabled: agent.enabled !== false,
      version: existing ? existing.version + 1 : 1,
    };
    config.custom = [...config.custom.filter((candidate) => candidate.id !== id), saved];
    this.writeConfig(config);
    return { success: true, agent: saved };
  }

  public deleteCustomAgent(id: TeamAgentId): boolean {
    const config = this.readConfig();
    const before = config.custom.length;
    config.custom = config.custom.filter((agent) => agent.id !== id);
    if (config.custom.length === before) return false;
    this.writeConfig(config);
    return true;
  }
}

export const globalTeamAgentRegistry = new TeamAgentRegistry();
