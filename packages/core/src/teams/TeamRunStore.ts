import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TeamRun, TeamTask, AgentRun, ScientificHandoff, ScientificConflict } from './types.js';

export interface TeamRunRecord {
  run: TeamRun;
  tasks: TeamTask[];
  agentRuns: AgentRun[];
  handoffs: ScientificHandoff[];
  conflicts: ScientificConflict[];
}

export interface TeamRunsIndexEntry {
  id: string;
  teamId: string;
  sessionId: string;
  inquiry: string;
  status: string;
  startedAt: string;
  completedAt?: string;
}

/**
 * Local persistence for Team Runs (design doc MVP item 12: "Team Run 本地持久化").
 * One JSON file per run under ~/.medscience/team-runs/<runId>.json (the whole
 * run + its tasks/agentRuns/handoffs/conflicts, since they're always read and
 * written together as one unit of work), plus a small index.json for fast
 * listing without reading every run file. Same atomic-write safety pattern as
 * ExecutionProfileManager/TeamProfileManager.
 */
export class TeamRunStore {
  private customDir?: string;
  /** In-memory cache of runs currently in flight, so TeamOrchestrator can mutate/read without re-parsing JSON on every step. */
  private cache: Map<string, TeamRunRecord> = new Map();

  constructor(customDir?: string) {
    this.customDir = customDir;
  }

  private getRunsDir(): string {
    const base = this.customDir || process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
    return path.join(base, 'team-runs');
  }

  private getRunFile(runId: string): string {
    return path.join(this.getRunsDir(), `${runId}.json`);
  }

  private getIndexFile(): string {
    return path.join(this.getRunsDir(), 'index.json');
  }

  private ensureDirectory(): void {
    try {
      const dir = this.getRunsDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      // best effort; falls back to in-memory-only behavior for this process
    }
  }

  private atomicWrite(filePath: string, data: unknown): void {
    this.ensureDirectory();
    const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmpFile, filePath);
    } catch (err) {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
      throw err;
    }
  }

  private readIndex(): TeamRunsIndexEntry[] {
    const indexFile = this.getIndexFile();
    if (!fs.existsSync(indexFile)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeIndexEntry(record: TeamRunRecord): void {
    const index = this.readIndex();
    const entry: TeamRunsIndexEntry = {
      id: record.run.id,
      teamId: record.run.teamId,
      sessionId: record.run.sessionId,
      inquiry: record.run.inquiry,
      status: record.run.status,
      startedAt: record.run.startedAt,
      completedAt: record.run.completedAt,
    };
    const existingIdx = index.findIndex((e) => e.id === entry.id);
    if (existingIdx >= 0) index[existingIdx] = entry;
    else index.unshift(entry);
    this.atomicWrite(this.getIndexFile(), index);
  }

  /** Persists the full record and updates the index. Call after any mutation. */
  public save(record: TeamRunRecord): void {
    this.cache.set(record.run.id, record);
    this.atomicWrite(this.getRunFile(record.run.id), record);
    this.writeIndexEntry(record);
  }

  public get(runId: string): TeamRunRecord | undefined {
    const cached = this.cache.get(runId);
    if (cached) return cached;
    const file = this.getRunFile(runId);
    if (!fs.existsSync(file)) return undefined;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as TeamRunRecord;
      this.cache.set(runId, parsed);
      return parsed;
    } catch {
      return undefined;
    }
  }

  /** Lightweight listing (from the index, not a full read of every run file). Most recent first. */
  public list(teamId?: string): TeamRunsIndexEntry[] {
    const index = this.readIndex();
    return teamId ? index.filter((e) => e.teamId === teamId) : index;
  }
}

export const globalTeamRunStore = new TeamRunStore();
