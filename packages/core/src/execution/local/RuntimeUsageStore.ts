import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalRuntimeKind, RuntimeUsageDelta, RuntimeUsageRecord } from '../types.js';

/**
 * Persists cumulative token usage per bound local-runtime execution
 * profile, so "how many tokens has this runtime used inside MedScience"
 * survives app restarts. Deliberately its own small JSON file rather than
 * a field bolted onto ExecutionProfileManager's execution.json: usage is
 * write-heavy (one update per turn, potentially many times a minute)
 * while execution.json is write-rare (only on profile create/edit/bind),
 * and keeping them apart means a burst of usage writes can never race a
 * profile edit's read-modify-write cycle.
 *
 * Today only Codex ever calls recordUsage() -- it is the one local runtime
 * that can actually execute turns (see CodexRuntimeBackend.ts, which reads
 * usage off the Codex app-server's `thread/tokenUsage/updated` notification,
 * https://developers.openai.com/codex/app-server/). The store itself is
 * generic over LocalRuntimeKind so other runtimes can start reporting into
 * it the moment they gain execution support, with no shape change needed.
 *
 * Same on-disk convention as ExecutionProfileManager.ts: ~/.medscience
 * (or $MEDSCIENCE_HOME), atomic tmp-file-then-rename writes at mode 0600,
 * corrupted files backed up rather than silently discarded.
 */

export interface RuntimeUsageFile {
  version: string;
  /** Keyed by execution profile id (LocalRuntimeExecutionProfile.id). */
  usage: Record<string, RuntimeUsageRecord>;
}

export class RuntimeUsageStore {
  private customDir?: string;

  constructor(customDir?: string) {
    this.customDir = customDir;
  }

  private getConfigDir(): string {
    return this.customDir || process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
  }

  private getConfigFile(): string {
    return path.join(this.getConfigDir(), 'execution-usage.json');
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

  private readFile(): RuntimeUsageFile {
    const configFile = this.getConfigFile();
    if (!fs.existsSync(configFile)) {
      return { version: '1.0.0', usage: {} };
    }
    try {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(raw) as RuntimeUsageFile;
      if (!parsed.usage || typeof parsed.usage !== 'object') throw new Error('malformed usage file');
      return parsed;
    } catch {
      // Preserve the corrupted file (renamed aside) rather than silently
      // overwriting it, and fall back to an empty in-memory store so the
      // app keeps working -- losing cumulative usage counters is annoying
      // but never something that should block the user from running turns.
      try {
        const backupPath = `${configFile}.corrupted-${Date.now()}`;
        fs.copyFileSync(configFile, backupPath);
      } catch {
        // best effort
      }
      return { version: '1.0.0', usage: {} };
    }
  }

  private writeFile(data: RuntimeUsageFile): void {
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
      // Usage tracking is best-effort telemetry, not core functionality --
      // a disk write failure here must never surface as an error to the
      // user or interrupt a running turn.
      console.error('[RuntimeUsageStore] Failed to persist usage:', err);
    }
  }

  /**
   * Adds a delta (typically one turn's or one usage-notification's worth of
   * tokens) onto the running total for this execution profile. Missing
   * fields in the delta are treated as 0, not "unknown" -- Codex's
   * `thread/tokenUsage/updated.last` always reports a full breakdown when
   * it fires at all, so a genuinely-partial delta is not expected in
   * practice; this only guards against a stray notification with fewer
   * fields than usual.
   */
  public recordUsage(profileId: string, runtime: LocalRuntimeKind, delta: RuntimeUsageDelta): void {
    const file = this.readFile();
    const existing = file.usage[profileId];
    const totalTokens =
      delta.totalTokens !== undefined ? delta.totalTokens : (delta.inputTokens || 0) + (delta.outputTokens || 0);
    file.usage[profileId] = {
      runtime,
      totalTokens: (existing?.totalTokens || 0) + (totalTokens || 0),
      inputTokens: (existing?.inputTokens || 0) + (delta.inputTokens || 0),
      outputTokens: (existing?.outputTokens || 0) + (delta.outputTokens || 0),
      turnCount: (existing?.turnCount || 0) + 1,
      lastUpdated: new Date().toISOString(),
    };
    this.writeFile(file);
  }

  public getUsage(profileId: string): RuntimeUsageRecord | undefined {
    return this.readFile().usage[profileId];
  }

  public getAllUsage(): Record<string, RuntimeUsageRecord> {
    return this.readFile().usage;
  }

  /** Used when an execution profile is deleted/unbound, so a stale entry doesn't linger forever. */
  public clearUsage(profileId: string): void {
    const file = this.readFile();
    if (!(profileId in file.usage)) return;
    delete file.usage[profileId];
    this.writeFile(file);
  }
}

export const globalRuntimeUsageStore = new RuntimeUsageStore();
