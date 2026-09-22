/**
 * Per-workspace local folder binding, backed by the browser's File System
 * Access API (`showDirectoryPicker`). This only exists for the web build
 * (`npm run web`) -- Electron desktop mode has real Node `fs` access and
 * doesn't need it, but this project is only ever run with `npm run web`,
 * so this is the one real read/write path for "generated figures/reports
 * land in this workspace's folder" (see WorkspaceTree.tsx / OutputFilesView.tsx).
 *
 * A `FileSystemDirectoryHandle` cannot be serialized to JSON/localStorage,
 * so it is persisted in IndexedDB, one handle per workspace id. Browsers
 * may not remember the read/write permission grant across reloads, so
 * every write first checks `queryPermission` (no prompt) and only prompts
 * with `requestPermission` from an explicit user gesture (the bind button,
 * or a manual "save to folder" click) -- `requestPermission` silently
 * rejects when called without recent user activation, so a background
 * auto-save after an artifact streams in only writes when permission is
 * already granted, and otherwise leaves the file to be saved manually.
 */

const DB_NAME = 'medscience-local-folders';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

export interface BoundFolderInfo {
  workspaceId: string;
  name: string;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best effort -- folder binding is a convenience, never load-bearing
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

function handleKey(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

/** Reads the stored handle without touching permissions. */
export async function getStoredFolderHandle(workspaceId: string): Promise<FileSystemDirectoryHandle | undefined> {
  return idbGet<FileSystemDirectoryHandle>(handleKey(workspaceId));
}

/** Non-prompting permission check -- safe to call from a background effect. */
export async function hasGrantedPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const anyHandle = handle as any;
    if (typeof anyHandle.queryPermission !== 'function') return false;
    const status = await anyHandle.queryPermission({ mode: 'readwrite' });
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Prompting permission request -- only call from a direct user-gesture handler (click). */
export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const anyHandle = handle as any;
    if (typeof anyHandle.requestPermission !== 'function') return false;
    const status = await anyHandle.requestPermission({ mode: 'readwrite' });
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Non-prompting check for whether a background auto-save can proceed right now. */
export async function isFolderWriteReady(workspaceId: string): Promise<boolean> {
  const handle = await getStoredFolderHandle(workspaceId);
  if (!handle) return false;
  return hasGrantedPermission(handle);
}

/** Returns the bound folder's display name if a handle exists and permission is currently granted, without prompting. */
export async function getBoundFolderInfo(workspaceId: string): Promise<BoundFolderInfo | undefined> {
  const handle = await getStoredFolderHandle(workspaceId);
  if (!handle) return undefined;
  const granted = await hasGrantedPermission(handle);
  return { workspaceId, name: granted ? handle.name : `${handle.name} (需要重新授权)` };
}

/**
 * Opens the native folder picker (must be called from a click handler --
 * this is the user gesture) and binds the chosen folder to a workspace.
 * Returns undefined if the user cancels or the browser doesn't support it.
 */
export async function pickAndBindFolder(workspaceId: string): Promise<BoundFolderInfo | undefined> {
  if (!isFileSystemAccessSupported()) return undefined;
  try {
    const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    const granted = await requestPermission(handle);
    if (!granted) return undefined;
    await idbSet(handleKey(workspaceId), handle);
    return { workspaceId, name: handle.name };
  } catch {
    // user cancelled the picker, or the browser refused -- not an error worth surfacing
    return undefined;
  }
}

export async function unbindFolder(workspaceId: string): Promise<void> {
  await idbDelete(handleKey(workspaceId));
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'output';
}

/**
 * Writes one file into the workspace's bound folder. Only succeeds when a
 * handle is stored AND permission is already granted (never prompts) --
 * call `requestPermissionAndWrite` instead from a user-gesture handler if
 * this is a manual save rather than a background auto-save.
 */
export async function writeFileToFolder(
  workspaceId: string,
  fileName: string,
  content: string | Blob
): Promise<{ ok: boolean; reason?: 'no-folder-bound' | 'permission-not-granted' | 'write-failed' }> {
  const handle = await getStoredFolderHandle(workspaceId);
  if (!handle) return { ok: false, reason: 'no-folder-bound' };
  const granted = await hasGrantedPermission(handle);
  if (!granted) return { ok: false, reason: 'permission-not-granted' };
  try {
    const fileHandle = await handle.getFileHandle(sanitizeFileName(fileName), { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'write-failed' };
  }
}

/** Same as writeFileToFolder, but requests permission first (call only from a user gesture). */
export async function writeFileToFolderWithPrompt(
  workspaceId: string,
  fileName: string,
  content: string | Blob
): Promise<{ ok: boolean; reason?: 'no-folder-bound' | 'permission-not-granted' | 'write-failed' }> {
  const handle = await getStoredFolderHandle(workspaceId);
  if (!handle) return { ok: false, reason: 'no-folder-bound' };
  const granted = await requestPermission(handle);
  if (!granted) return { ok: false, reason: 'permission-not-granted' };
  try {
    const fileHandle = await handle.getFileHandle(sanitizeFileName(fileName), { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'write-failed' };
  }
}
