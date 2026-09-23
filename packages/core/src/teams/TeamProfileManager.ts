import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ResearchTeamDefinition } from './types.js';
import { builtInTeamTemplates, DEFAULT_TEAM_TEMPLATE_ID } from './BuiltInTeamTemplates.js';
import { globalTeamAgentRegistry, TeamAgentRegistry } from './TeamRegistry.js';

export interface TeamsConfigFile {
  version: string;
  teams: ResearchTeamDefinition[];
}

/**
 * Persistence + CRUD for user-owned Research Team definitions, plus a
 * read-only view over the built-in templates. Follows the exact same
 * safety pattern as ExecutionProfileManager (see
 * packages/core/src/config/ExecutionProfileManager.ts): atomic
 * temp-file-then-rename writes, 0600/0700 permissions, and a corrupted
 * config file is backed up rather than silently overwritten.
 *
 * Phase 1 scope only (design doc section 19, stage 1): this manager lets a
 * user browse built-in templates and clone/edit/archive their own team
 * definitions. It does not execute anything -- there is no
 * TeamOrchestrator/TeamPlanner/TeamScheduler yet.
 */
export class TeamProfileManager {
  private customDir?: string;
  private agentRegistry: TeamAgentRegistry;

  constructor(customDir?: string, agentRegistry?: TeamAgentRegistry) {
    this.customDir = customDir;
    this.agentRegistry = agentRegistry || globalTeamAgentRegistry;
  }

  private getConfigDir(): string {
    return this.customDir || process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
  }

  private getConfigFile(): string {
    return path.join(this.getConfigDir(), 'teams.json');
  }

  private ensureDirectory(): void {
    try {
      const dir = this.getConfigDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
    } catch {
      // Ignore if directory creation is restricted; falls back to in-memory behavior.
    }
  }

  private readConfigFile(): TeamsConfigFile {
    const configFile = this.getConfigFile();
    if (!fs.existsSync(configFile)) {
      return { version: '1.0.0', teams: [] };
    }
    try {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(raw) as TeamsConfigFile;
      if (!Array.isArray(parsed.teams)) {
        throw new Error('malformed teams config: teams is not an array');
      }
      return parsed;
    } catch {
      // Config file exists but is corrupted/unreadable. Preserve it (renamed
      // aside) rather than silently overwriting user data, and fall back to
      // an empty in-memory list so the app keeps working.
      try {
        const backupPath = `${configFile}.corrupted-${Date.now()}`;
        fs.copyFileSync(configFile, backupPath);
      } catch {
        // best effort
      }
      return { version: '1.0.0', teams: [] };
    }
  }

  private writeConfigFile(data: TeamsConfigFile): void {
    this.ensureDirectory();
    const configFile = this.getConfigFile();
    const tmpFile = `${configFile}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmpFile, configFile);
    } catch (err) {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
      throw err;
    }
  }

  /** The 4 read-only built-in templates (design doc section 8, MVP-scoped to 4 in section 18). */
  public listTemplates(): ResearchTeamDefinition[] {
    return builtInTeamTemplates;
  }

  public getTemplate(id: string): ResearchTeamDefinition | undefined {
    return builtInTeamTemplates.find((t) => t.id === id);
  }

  /**
   * User-owned teams only (persisted to teams.json), excluding archived ones
   * unless requested.
   *
   * With a `workspaceId`, returns that workspace's teams PLUS every team
   * that has no workspaceId at all. The unscoped ones are teams created
   * before teams became workspace-scoped: dropping them would make a user's
   * existing teams look deleted, and auto-assigning them to the current
   * workspace would silently rewrite their data, so they are returned as-is
   * and the UI groups them under "unscoped" until the user picks a home for
   * them.
   */
  public listUserTeams(includeArchived = false, workspaceId?: string): ResearchTeamDefinition[] {
    const teams = this.readConfigFile().teams;
    const visible = includeArchived ? teams : teams.filter((t) => !t.archived);
    if (!workspaceId) return visible;
    return visible.filter((t) => !t.workspaceId || t.workspaceId === workspaceId);
  }

  /** Built-in templates + user-owned teams, for a unified "browse everything" view. */
  public listAll(includeArchived = false, workspaceId?: string): ResearchTeamDefinition[] {
    return [...this.listTemplates(), ...this.listUserTeams(includeArchived, workspaceId)];
  }

  /**
   * Every workspace starts with a research team, so 科研小队 is never an
   * empty page: the first time a workspace is listed, the default template
   * is cloned into it.
   *
   * "Has none" counts archived teams too -- otherwise archiving the last
   * team in a workspace would silently resurrect a fresh one, which is the
   * opposite of what archiving means.
   */
  public ensureDefaultTeam(workspaceId: string): ResearchTeamDefinition | undefined {
    if (!workspaceId) return undefined;
    const existing = this.readConfigFile().teams.filter((team) => team.workspaceId === workspaceId);
    if (existing.length > 0) return undefined;
    const template = this.getTemplate(DEFAULT_TEAM_TEMPLATE_ID);
    const result = this.cloneTemplate(DEFAULT_TEAM_TEMPLATE_ID, {
      // Keep the template's own name rather than "... (Copy)": to the user
      // this is simply the team their workspace came with.
      name: template?.name,
      workspaceId,
    });
    return result.team;
  }

  public getTeam(id: string): ResearchTeamDefinition | undefined {
    return this.getTemplate(id) || this.readConfigFile().teams.find((t) => t.id === id);
  }

  public validateTeam(team: ResearchTeamDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!team.name?.trim()) errors.push('Team name is required.');
    if (!Array.isArray(team.members) || team.members.length === 0) {
      errors.push('A team must have at least one member.');
    } else {
      for (const member of team.members) {
        if (!this.agentRegistry.has(member.agentId)) {
          errors.push(`Unknown agent id in team members: "${member.agentId}".`);
        }
      }
      const leaderIsMember = team.members.some((m) => m.agentId === team.leaderAgentId && m.canLead);
      if (!leaderIsMember) {
        errors.push('leaderAgentId must reference a member with canLead: true.');
      }
    }
    if (!this.agentRegistry.has(team.leaderAgentId)) {
      errors.push(`Unknown leader agent id: "${team.leaderAgentId}".`);
    }
    if (!Number.isInteger(team.maxConcurrency) || team.maxConcurrency < 1) {
      errors.push('maxConcurrency must be a positive integer.');
    }
    if (!Number.isInteger(team.maxTasks) || team.maxTasks < 1) {
      errors.push('maxTasks must be a positive integer.');
    }
    if (!Number.isInteger(team.maxRevisionsPerTask) || team.maxRevisionsPerTask < 0) {
      errors.push('maxRevisionsPerTask must be a non-negative integer.');
    }
    if (!['review-first', 'automatic'].includes(team.planningMode)) {
      errors.push('Invalid planningMode.');
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Creates a new user-owned team, persisted to teams.json. Always forces
   * builtIn: false and archived: false regardless of what the caller passed,
   * since only the built-in templates constant is allowed to be builtIn: true.
   */
  public saveTeam(
    team: Omit<ResearchTeamDefinition, 'builtIn' | 'createdAt' | 'updatedAt' | 'version'> &
      Partial<Pick<ResearchTeamDefinition, 'createdAt' | 'version'>>
  ): { success: boolean; team?: ResearchTeamDefinition; errors?: string[] } {
    const now = new Date().toISOString();
    const id = team.id || `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const config = this.readConfigFile();
    const existingIndex = config.teams.findIndex((t) => t.id === id);
    const existing = existingIndex >= 0 ? config.teams[existingIndex] : undefined;

    const candidate: ResearchTeamDefinition = {
      ...team,
      id,
      builtIn: false,
      archived: team.archived ?? existing?.archived ?? false,
      version: existing ? existing.version + 1 : team.version || 1,
      createdAt: existing?.createdAt || team.createdAt || now,
      updatedAt: now,
    };

    const validation = this.validateTeam(candidate);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    if (existingIndex >= 0) {
      config.teams[existingIndex] = candidate;
    } else {
      config.teams.push(candidate);
    }
    this.writeConfigFile(config);
    return { success: true, team: candidate };
  }

  /**
   * Clones a built-in (or another user) template into a new, independent
   * user-owned team definition (design doc section 8: "用户点击 Customize
   * 后复制成自己的 Team Definition, 避免应用升级覆盖用户修改").
   */
  public cloneTemplate(
    templateId: string,
    overrides?: { name?: string; description?: string; workspaceId?: string }
  ): { success: boolean; team?: ResearchTeamDefinition; errors?: string[] } {
    const template = this.getTeam(templateId);
    if (!template) {
      return { success: false, errors: [`No team or template found with id "${templateId}".`] };
    }
    const now = new Date().toISOString();
    const cloned: ResearchTeamDefinition = {
      ...template,
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: overrides?.name || `${template.name} (Copy)`,
      description: overrides?.description || template.description,
      // A clone belongs to the workspace it was created from; without this a
      // team cloned inside a workspace would come back unscoped and show up
      // in every workspace's list.
      workspaceId: overrides?.workspaceId ?? template.workspaceId,
      builtIn: false,
      archived: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
      clonedFromTemplateId: template.id,
    };
    return this.saveTeam(cloned);
  }

  /** Soft-delete: archived teams are hidden from the default listing but never silently erased. */
  public archiveTeam(id: string): boolean {
    const config = this.readConfigFile();
    const target = config.teams.find((t) => t.id === id);
    if (!target) return false;
    target.archived = true;
    target.updatedAt = new Date().toISOString();
    this.writeConfigFile(config);
    return true;
  }

  public unarchiveTeam(id: string): boolean {
    const config = this.readConfigFile();
    const target = config.teams.find((t) => t.id === id);
    if (!target) return false;
    target.archived = false;
    target.updatedAt = new Date().toISOString();
    this.writeConfigFile(config);
    return true;
  }
}

export const globalTeamProfileManager = new TeamProfileManager();
