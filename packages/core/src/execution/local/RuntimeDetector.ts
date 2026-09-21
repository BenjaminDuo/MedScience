import { spawn, ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalRuntimeKind, RuntimeErrorCode, RuntimeProbeResult } from '../types.js';

export type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: Error;
}

const STDERR_TAIL_LIMIT = 4096;
const STDOUT_LIMIT = 65536;

function runWithTimeout(
  spawnFn: SpawnFn,
  command: string,
  args: string[],
  timeoutMs: number,
  options: SpawnOptionsWithoutStdio = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    let settled = false;
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnFn(command, args, { ...options, stdio: 'pipe' as any, shell: false, windowsHide: true });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: '', timedOut: false, error: error as Error });
      return;
    }

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < STDOUT_LIMIT) stdout += chunk.toString('utf-8');
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < STDERR_TAIL_LIMIT) stderr += chunk.toString('utf-8');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, timedOut: false, error });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
  });
}

function candidateExecutableNames(): string[] {
  return process.platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];
}

/** macOS-only well-known install locations for bundled/desktop Codex CLIs. */
function macKnownCandidatePaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.codex', 'bin', 'codex'),
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
  ];
}

interface LoginShellCacheEntry {
  path?: string;
  cachedAt: number;
}

const LOGIN_SHELL_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes, within the guide's 15-30 min window
const LOGIN_SHELL_TIMEOUT_MS = 10 * 1000; // heavy shell startup (oh-my-zsh, powerlevel10k, nvm/conda lazy-init) can exceed a short timeout

export class RuntimeDetector {
  private spawnFn: SpawnFn;
  private loginShellCache: Map<string, LoginShellCacheEntry> = new Map();

  constructor(spawnFn: SpawnFn = spawn as unknown as SpawnFn) {
    this.spawnFn = spawnFn;
  }

  private loginShellCacheKey(): string {
    const shell = process.env.SHELL || '';
    const home = os.homedir();
    const pathEnv = process.env.PATH || '';
    return `${shell}::${home}::${pathEnv}`;
  }

  /** Resolves `codex` via PATH using a plain (fast, no-shell) spawn. */
  private async resolveFromPath(): Promise<string | undefined> {
    for (const name of candidateExecutableNames()) {
      const found = await this.which(name);
      if (found) return found;
    }
    return undefined;
  }

  private async which(name: string): Promise<string | undefined> {
    const command = process.platform === 'win32' ? 'where' : 'command';
    const args = process.platform === 'win32' ? [name] : ['-v', name];
    // `command -v` is a shell builtin, but invoking `/bin/sh -c "command -v codex"`
    // still counts as "no shell parsing of user input" since args are fixed and
    // do not come from user text. We still keep this path secondary to a direct
    // PATH scan for speed.
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) {
          if (process.platform === 'win32') return candidate;
          // eslint-disable-next-line no-bitwise
          if (stat.mode & 0o111) return candidate;
        }
      } catch {
        // not in this dir
      }
    }
    return undefined;
  }

  /**
   * Resolves `codex` via the user's login shell. GUI-launched apps (Dock,
   * Launchpad) often see a minimal PATH that does not include entries a
   * user's interactive shell profile adds (nvm, homebrew, asdf, etc.).
   * Result is cached for LOGIN_SHELL_CACHE_TTL_MS, keyed by SHELL/PATH/HOME.
   */
  private async resolveFromLoginShell(bypassCache = false): Promise<string | undefined> {
    const cacheKey = this.loginShellCacheKey();
    if (!bypassCache) {
      const cached = this.loginShellCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < LOGIN_SHELL_CACHE_TTL_MS) {
        return cached.path;
      }
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const result = await runWithTimeout(this.spawnFn, shell, ['-l', '-i', '-c', 'command -v codex'], LOGIN_SHELL_TIMEOUT_MS);
    const resolved = !result.timedOut && result.code === 0 ? result.stdout.trim().split('\n').pop()?.trim() : undefined;
    this.loginShellCache.set(cacheKey, { path: resolved || undefined, cachedAt: Date.now() });
    return resolved || undefined;
  }

  /**
   * Discovery order (stable, does not silently fall through past a user's
   * explicit but invalid configuration):
   *   1. Explicit configured path
   *   2. MEDSCIENCE_CODEX_PATH environment variable
   *   3. Plain PATH scan
   *   4. Login shell PATH (GUI launch fallback), cached
   *   5. (macOS) well-known bundled/Desktop install locations
   */
  public async resolveExecutablePath(
    configuredPath?: string,
    options?: { bypassLoginShellCache?: boolean }
  ): Promise<{ path?: string; source?: RuntimeProbeResult['source']; invalidConfigured?: boolean }> {
    if (configuredPath) {
      const resolved = path.resolve(configuredPath);
      const exists = fs.existsSync(resolved) && fs.statSync(resolved).isFile();
      if (!exists) {
        // A user who explicitly configured an invalid path must see that
        // error, not have us silently pick a different Codex from PATH.
        return { invalidConfigured: true };
      }
      return { path: resolved, source: 'configured' };
    }

    const envPath = process.env.MEDSCIENCE_CODEX_PATH;
    if (envPath) {
      const resolved = path.resolve(envPath);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return { path: resolved, source: 'configured' };
      }
    }

    const fromPath = await this.resolveFromPath();
    if (fromPath) return { path: fromPath, source: 'path' };

    const fromLoginShell = await this.resolveFromLoginShell(options?.bypassLoginShellCache);
    if (fromLoginShell) return { path: fromLoginShell, source: 'login-shell' };

    if (process.platform === 'darwin' || process.platform === 'linux') {
      for (const candidate of macKnownCandidatePaths()) {
        try {
          const stat = fs.statSync(candidate);
          // eslint-disable-next-line no-bitwise
          if (stat.isFile() && stat.mode & 0o111) {
            return { path: candidate, source: 'bundled' };
          }
        } catch {
          // candidate does not exist; that is a normal, expected outcome
        }
      }
    }

    return {};
  }

  public async probeVersion(executablePath: string): Promise<{ version?: string; error?: RuntimeErrorCode }> {
    const result = await runWithTimeout(this.spawnFn, executablePath, ['--version'], 3000);
    if (result.timedOut) return { error: 'RUNTIME_HANDSHAKE_TIMEOUT' };
    if (result.error || result.code !== 0) return { error: 'RUNTIME_START_FAILED' };
    const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
    return { version: match?.[1] };
  }

  public async probeAppServerCapability(executablePath: string): Promise<{ available: boolean }> {
    const result = await runWithTimeout(this.spawnFn, executablePath, ['app-server', '--help'], 3000);
    if (result.timedOut || result.error) return { available: false };
    const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
    return { available: result.code === 0 || combined.includes('app-server') };
  }

  /**
   * Read-only, fast probe: path + version + app-server capability.
   * Authentication status requires an actual handshake (initialize +
   * account/read) and is layered on top by CodexRuntimeBackend, since it
   * needs the JSON-RPC client and a short-lived process, not just a
   * `--version` invocation.
   */
  public async probe(configuredPath?: string, options?: { bypassLoginShellCache?: boolean }): Promise<RuntimeProbeResult> {
    const runtime: LocalRuntimeKind = 'codex';
    const resolved = await this.resolveExecutablePath(configuredPath, options);

    if (resolved.invalidConfigured) {
      return {
        runtime,
        available: false,
        errorCode: 'RUNTIME_PATH_INVALID',
        message: 'The configured Codex executable path does not exist or is not a file.',
      };
    }
    if (!resolved.path) {
      return {
        runtime,
        available: false,
        errorCode: 'RUNTIME_NOT_FOUND',
        message: 'Codex CLI was not found on PATH, in the login shell PATH, or at any known install location.',
      };
    }

    const versionResult = await this.probeVersion(resolved.path);
    if (versionResult.error) {
      return {
        runtime,
        available: false,
        executablePath: resolved.path,
        source: resolved.source,
        errorCode: versionResult.error,
        message: 'Failed to run `codex --version`.',
      };
    }

    const capability = await this.probeAppServerCapability(resolved.path);
    if (!capability.available) {
      return {
        runtime,
        available: false,
        executablePath: resolved.path,
        version: versionResult.version,
        source: resolved.source,
        errorCode: 'RUNTIME_PROTOCOL_UNAVAILABLE',
        message: 'This Codex CLI does not appear to support `app-server`. Please upgrade Codex.',
      };
    }

    return {
      runtime,
      available: true,
      executablePath: resolved.path,
      version: versionResult.version,
      protocolAvailable: true,
      source: resolved.source,
    };
  }
}

export const globalRuntimeDetector = new RuntimeDetector();
