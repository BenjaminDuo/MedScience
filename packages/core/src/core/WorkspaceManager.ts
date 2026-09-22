import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Workspace } from '../types/workspace.js';

const DEFAULT_WORKSPACE_ID = 'proj-1';
const DEFAULT_WORKSPACE_TITLE = 'Uncategorized';

/**
 * Backing store for Workspace records, mirroring SessionManager's one-JSON-
 * file-per-record persistence under ~/.medscience/. Self-initializes a
 * 'proj-1' record on construction -- every RuntimeSession created before
 * Workspace existed as a real entity (and every caller that still defaults
 * to the 'proj-1' literal, e.g. ResearchEngine/TeamOrchestrator) resolves
 * to this record rather than a dangling id, so nothing needs a one-time
 * migration step run at the right moment during startup.
 */
export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private storageDir: string;

  constructor(customDir?: string) {
    this.storageDir = customDir || path.join(process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience'), 'workspaces');
    this.loadFromStorage();
    this.ensureWorkspace(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_TITLE);
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      } catch {
        // In-memory fallback if filesystem restricted
      }
    }
  }

  private loadFromStorage(): void {
    if (!fs.existsSync(this.storageDir)) return;
    try {
      const files = fs.readdirSync(this.storageDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this.storageDir, file), 'utf-8');
          const workspace = JSON.parse(raw) as Workspace;
          this.workspaces.set(workspace.id, workspace);
        } catch {
          // ignore corrupted file
        }
      }
    } catch {
      // In-memory mode
    }
  }

  private saveToDisk(workspace: Workspace): void {
    try {
      this.ensureDirectory();
      const filePath = path.join(this.storageDir, `${workspace.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(workspace, null, 2), { mode: 0o600 });
    } catch {
      // ignore
    }
  }

  /**
   * Idempotent create: returns the existing record if `id` is already
   * present (title is NOT overwritten on repeat calls -- a user-renamed
   * default workspace must survive every subsequent app boot), otherwise
   * creates and persists a new one under that exact id.
   */
  public ensureWorkspace(id: string, title: string): Workspace {
    const existing = this.workspaces.get(id);
    if (existing) return existing;
    return this.createWorkspace(title, id);
  }

  public createWorkspace(title: string, explicitId?: string, description?: string): Workspace {
    const id = explicitId || `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id,
      title: title.trim() || DEFAULT_WORKSPACE_TITLE,
      description,
      createdAt: now,
      updatedAt: now,
    };
    this.workspaces.set(id, workspace);
    this.saveToDisk(workspace);
    return workspace;
  }

  public getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  public listWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public renameWorkspace(id: string, newTitle: string): boolean {
    const workspace = this.workspaces.get(id);
    if (!workspace) return false;
    workspace.title = newTitle.trim() || workspace.title;
    workspace.updatedAt = new Date().toISOString();
    this.saveToDisk(workspace);
    return true;
  }

  public touchWorkspace(id: string): void {
    const workspace = this.workspaces.get(id);
    if (!workspace) return;
    workspace.updatedAt = new Date().toISOString();
    this.saveToDisk(workspace);
  }

  /**
   * Refuses to delete the default 'proj-1' workspace -- every session created
   * before Workspace existed (and every caller that still hasn't been wired
   * to pass a real workspaceId) resolves there, so removing it would strand
   * that data with no backing record again.
   */
  public deleteWorkspace(id: string): boolean {
    if (id === DEFAULT_WORKSPACE_ID) return false;
    const exists = this.workspaces.has(id);
    if (!exists) return false;
    this.workspaces.delete(id);
    try {
      const filePath = path.join(this.storageDir, `${id}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
    return true;
  }
}

export const globalWorkspaceManager = new WorkspaceManager();
export { DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_TITLE };
