/**
 * Per-viewer, per-workspace chat preferences for research-team groups:
 * pinned, muted, and where the user had read up to.
 *
 * These live in localStorage rather than teams.json on purpose -- they are
 * view state, not part of a team's definition, and writing them to the
 * shared team record would bump a team's `version` (and its updatedAt)
 * every time someone pinned a chat. If they ever need to follow the user
 * across machines, they move to their own store, not into the team.
 */
export interface GroupPrefs {
  pinned: boolean;
  muted: boolean;
  /** ISO timestamp of the newest message the user has seen in this group. */
  lastReadAt?: string;
}

const EMPTY: GroupPrefs = { pinned: false, muted: false };

function storageKey(workspaceId: string): string {
  return `medscience.teamGroups.${workspaceId}`;
}

function readAll(workspaceId: string): Record<string, GroupPrefs> {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    return raw ? (JSON.parse(raw) as Record<string, GroupPrefs>) : {};
  } catch {
    return {};
  }
}

function writeAll(workspaceId: string, value: Record<string, GroupPrefs>): void {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(value));
  } catch {
    // Private mode / blocked storage: preferences simply do not persist.
  }
}

export function getGroupPrefs(workspaceId: string, teamId: string): GroupPrefs {
  return { ...EMPTY, ...readAll(workspaceId)[teamId] };
}

export function setGroupPrefs(workspaceId: string, teamId: string, patch: Partial<GroupPrefs>): GroupPrefs {
  const all = readAll(workspaceId);
  const next = { ...EMPTY, ...all[teamId], ...patch };
  all[teamId] = next;
  writeAll(workspaceId, all);
  return next;
}

export function getAllGroupPrefs(workspaceId: string): Record<string, GroupPrefs> {
  return readAll(workspaceId);
}
