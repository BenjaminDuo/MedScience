import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ExecutionProfile, ApiExecutionProfile, LocalRuntimeExecutionProfile } from '../execution/types.js';
import { LOCAL_RUNTIME_CATALOG } from '../execution/local/runtimeCatalog.js';
import { ProfileManager, globalProfileManager } from './ProfileManager.js';

export interface ExecutionConfigFile {
  version: string;
  activeExecutionProfileId?: string;
  profiles: ExecutionProfile[];
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (process.platform === 'win32') {
      return /\.(exe|cmd|bat)$/i.test(candidate);
    }
    // eslint-disable-next-line no-bitwise
    return Boolean(stat.mode & 0o111);
  } catch {
    return false;
  }
}

export class ExecutionProfileManager {
  private customDir?: string;
  private profileManager: ProfileManager;

  constructor(customDir?: string, profileManager?: ProfileManager) {
    this.customDir = customDir;
    this.profileManager = profileManager || globalProfileManager;
  }

  private getConfigDir(): string {
    return this.customDir || process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
  }

  private getConfigFile(): string {
    return path.join(this.getConfigDir(), 'execution.json');
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

  private createDefaultApiProfile(): ApiExecutionProfile {
    const now = new Date().toISOString();
    const activeModelProfile = this.profileManager.getActiveProfile();
    return {
      id: 'exec-api-default',
      name: 'API Research',
      mode: 'api',
      modelProfileId: activeModelProfile?.id,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Reads the execution config, migrating (creating) it on first access.
   * Migration rule: activeExecutionProfileId defaults to the API profile so
   * upgraded installs keep behaving exactly as before.
   */
  private readConfigFile(): ExecutionConfigFile {
    const configFile = this.getConfigFile();
    if (!fs.existsSync(configFile)) {
      const defaultProfile = this.createDefaultApiProfile();
      const fresh: ExecutionConfigFile = {
        version: '1.0.0',
        activeExecutionProfileId: defaultProfile.id,
        profiles: [defaultProfile],
      };
      this.writeConfigFile(fresh);
      return fresh;
    }
    try {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(raw) as ExecutionConfigFile;
      if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
        throw new Error('empty profile list');
      }
      return parsed;
    } catch {
      // Config file exists but is corrupted/unreadable. Preserve it (renamed
      // aside) rather than silently overwriting user data, and fall back to
      // an in-memory default so the app keeps working.
      try {
        const backupPath = `${configFile}.corrupted-${Date.now()}`;
        fs.copyFileSync(configFile, backupPath);
      } catch {
        // best effort
      }
      const defaultProfile = this.createDefaultApiProfile();
      return {
        version: '1.0.0',
        activeExecutionProfileId: defaultProfile.id,
        profiles: [defaultProfile],
      };
    }
  }

  private writeConfigFile(data: ExecutionConfigFile): void {
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

  public listProfiles(): ExecutionProfile[] {
    return this.readConfigFile().profiles;
  }

  public getProfile(id: string): ExecutionProfile | undefined {
    return this.readConfigFile().profiles.find((p) => p.id === id);
  }

  public getActiveProfile(): ExecutionProfile {
    const config = this.readConfigFile();
    const active = config.profiles.find((p) => p.id === config.activeExecutionProfileId);
    return active || config.profiles[0];
  }

  public validateProfile(profile: ExecutionProfile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!profile.name?.trim()) errors.push('Execution profile name is required.');

    if (profile.mode === 'api') {
      if (profile.modelProfileId && !this.profileManager.getProfile(profile.modelProfileId)) {
        errors.push('The referenced model profile does not exist.');
      }
    } else if (profile.mode === 'local-runtime') {
      const supportedRuntimes = new Set(['codex', ...LOCAL_RUNTIME_CATALOG.map((spec) => spec.runtime)]);
      if (!supportedRuntimes.has(profile.runtime)) {
        errors.push(`Unknown local runtime "${profile.runtime}".`);
      }
      if (profile.executablePath) {
        const resolved = path.resolve(profile.executablePath);
        if (!isExecutableFile(resolved)) {
          errors.push('The configured executable path does not point to a runnable file.');
        }
      }
      if (!['project', 'session-workspace'].includes(profile.workingDirectoryMode)) {
        errors.push('Invalid working directory mode.');
      }
      if (!['read-only', 'workspace-write'].includes(profile.sandboxPreset)) {
        errors.push('Invalid sandbox preset.');
      }
      if (profile.approvalPreset !== 'prompt') {
        errors.push('Only the "prompt" approval preset is supported in this release.');
      }
    } else {
      errors.push('Unknown execution mode.');
    }

    return { valid: errors.length === 0, errors };
  }

  public saveProfile(profile: ExecutionProfile): { success: boolean; profile?: ExecutionProfile; errors?: string[] } {
    const validation = this.validateProfile(profile);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const config = this.readConfigFile();
    const now = new Date().toISOString();
    const id = profile.id || `exec-${profile.mode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const withMeta = { ...profile, id, updatedAt: now, createdAt: profile.createdAt || now } as ExecutionProfile;

    const existingIndex = config.profiles.findIndex((p) => p.id === id);
    if (existingIndex >= 0) {
      config.profiles[existingIndex] = withMeta;
    } else {
      config.profiles.push(withMeta);
      if (!config.activeExecutionProfileId) {
        config.activeExecutionProfileId = id;
      }
    }

    this.writeConfigFile(config);
    return { success: true, profile: withMeta };
  }

  public deleteProfile(id: string): boolean {
    const config = this.readConfigFile();
    if (config.profiles.length <= 1) {
      // Never delete the last remaining profile: section 5.3 requires a
      // valid profile to always exist so execution never silently falls
      // back to a mock result.
      return false;
    }
    const initialLen = config.profiles.length;
    config.profiles = config.profiles.filter((p) => p.id !== id);
    if (config.profiles.length === initialLen) return false;

    if (config.activeExecutionProfileId === id) {
      config.activeExecutionProfileId = config.profiles[0]?.id;
    }
    this.writeConfigFile(config);
    return true;
  }

  public setActiveProfile(id: string): boolean {
    const config = this.readConfigFile();
    const target = config.profiles.find((p) => p.id === id);
    if (!target) return false;
    config.activeExecutionProfileId = id;
    this.writeConfigFile(config);
    return true;
  }

  public createDefaultLocalRuntimeProfile(overrides?: Partial<LocalRuntimeExecutionProfile>): LocalRuntimeExecutionProfile {
    const now = new Date().toISOString();
    const runtime = overrides?.runtime || 'codex';
    const defaultNames: Record<string, string> = {
      codex: 'Local Codex',
      'claude-code': 'Local Claude Code',
      opencode: 'Local OpenCode',
    };
    return {
      id: overrides?.id || `exec-${runtime}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: overrides?.name || defaultNames[runtime] || `Local ${runtime}`,
      mode: 'local-runtime',
      runtime,
      executablePath: overrides?.executablePath,
      model: overrides?.model,
      workingDirectoryMode: overrides?.workingDirectoryMode || 'project',
      sandboxPreset: overrides?.sandboxPreset || 'workspace-write',
      approvalPreset: 'prompt',
      networkAccess: overrides?.networkAccess ?? false,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export const globalExecutionProfileManager = new ExecutionProfileManager();
