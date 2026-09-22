import { spawn, ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeErrorCode, RuntimeProbeResult } from '../types.js';
import { LocalRuntimeSpec } from './runtimeCatalog.js';

/**
 * Detection for the local runtimes added on top of Codex (see
 * runtimeCatalog.ts) -- Claude Code, OpenCode, and whatever else joins the
 * catalog later. Deliberately a separate, self-contained detector rather
 * than a refactor of RuntimeDetector.ts: Codex's detector is already
 * shipped and covered by its own test suite (RuntimeDetector.test.ts), and
 * it also does one Codex-specific thing (probing `codex app-server --help`)
 * that doesn't generalize to tools with no equivalent subcommand. The
 * low-level pattern here (PATH scan -> login-shell fallback -> versioned
 * probe with a timeout) intentionally mirrors RuntimeDetector.ts's shape so
 * the two behave consistently from the user's point of view, just without
 * sharing code that would risk the already-tested Codex path.
 */

export type GenericSpawnFn = (
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

const STDOUT_LIMIT = 65536;
const STDERR_TAIL_LIMIT = 4096;
const LOGIN_SHELL_TIMEOUT_MS = 10 * 1000;
const LOGIN_SHELL_CACHE_TTL_MS = 20 * 60 * 1000;

function runWithTimeout(
  spawnFn: GenericSpawnFn,
  command: string,
  args: string[],
  timeoutMs: number
): Promise<RunResult> {
  return new Promise((resolve) => {
    let settled = false;
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnFn(command, args, { stdio: 'pipe' as any, shell: false, windowsHide: true });
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

interface LoginShellCacheEntry {
  path?: string;
  cachedAt: number;
}

export class GenericRuntimeDetector {
  private spawnFn: GenericSpawnFn;
  private loginShellCache: Map<string, LoginShellCacheEntry> = new Map();
  private batchLoginShellCache?: { key: string; cachedAt: number; resolved: Record<string, string> };

  constructor(spawnFn: GenericSpawnFn = spawn as unknown as GenericSpawnFn) {
    this.spawnFn = spawnFn;
  }

  private candidateNames(spec: LocalRuntimeSpec): string[] {
    return process.platform === 'win32' ? spec.candidateNamesWin32 || spec.candidateNames : spec.candidateNames;
  }

  /** Expands a leading "~" (or "~/...") to the current user's home directory. */
  private expandHome(dir: string): string {
    if (dir === '~') return os.homedir();
    if (dir.startsWith('~/')) return path.join(os.homedir(), dir.slice(2));
    return dir;
  }

  private statExecutable(candidate: string): string | undefined {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        if (process.platform === 'win32') return candidate;
        // eslint-disable-next-line no-bitwise
        if (stat.mode & 0o111) return candidate;
      }
    } catch {
      // not there -- expected for most directories checked
    }
    return undefined;
  }

  private async which(name: string): Promise<string | undefined> {
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
      const found = this.statExecutable(path.join(dir, name));
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Checks a tool's extraSearchDirs (see LocalRuntimeSpec's doc comment) --
   * fixed, well-known install locations some CLIs use that may not be on
   * PATH for every process that could run MedScience (e.g. OpenCode's own
   * installer places itself at ~/.opencode/bin, added to PATH only via the
   * user's interactive shell rc file). Checked directly, no PATH or shell
   * fork required, so it's tried before both resolveFromPath's bare PATH
   * scan's login-shell fallback would otherwise be needed.
   */
  private resolveFromExtraSearchDirs(spec: LocalRuntimeSpec): string | undefined {
    if (!spec.extraSearchDirs || spec.extraSearchDirs.length === 0) return undefined;
    for (const rawDir of spec.extraSearchDirs) {
      const dir = this.expandHome(rawDir);
      for (const name of this.candidateNames(spec)) {
        const found = this.statExecutable(path.join(dir, name));
        if (found) return found;
      }
    }
    return undefined;
  }

  private async resolveFromPath(spec: LocalRuntimeSpec): Promise<string | undefined> {
    for (const name of this.candidateNames(spec)) {
      const found = await this.which(name);
      if (found) return found;
    }
    return this.resolveFromExtraSearchDirs(spec);
  }

  private loginShellCacheKey(runtime: string): string {
    const shell = process.env.SHELL || '';
    const home = os.homedir();
    const pathEnv = process.env.PATH || '';
    return `${runtime}::${shell}::${home}::${pathEnv}`;
  }

  private async resolveFromLoginShell(spec: LocalRuntimeSpec): Promise<string | undefined> {
    const cacheKey = this.loginShellCacheKey(spec.runtime);
    const cached = this.loginShellCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < LOGIN_SHELL_CACHE_TTL_MS) {
      return cached.path;
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const name = this.candidateNames(spec)[0];
    const result = await runWithTimeout(this.spawnFn, shell, ['-l', '-i', '-c', `command -v ${name}`], LOGIN_SHELL_TIMEOUT_MS);
    const resolved = !result.timedOut && result.code === 0 ? result.stdout.trim().split('\n').pop()?.trim() : undefined;
    this.loginShellCache.set(cacheKey, { path: resolved || undefined, cachedAt: Date.now() });
    return resolved || undefined;
  }

  /**
   * Batched login-shell resolution for a "detect every catalog runtime at
   * once" pass (probeMany/discoverAllRuntimes) -- forks the login shell ONCE
   * for every candidate name instead of once per tool. Modeled directly on
   * Multica's own resolveAgentsViaLoginShell/buildLoginShellResolveScript
   * (server/internal/daemon/config.go): its startup/periodic full-probe path
   * batches every known agent name into one `$SHELL -ilc <script>` call for
   * exactly this reason (forking a login shell is the expensive part, not
   * running `command -v`), while its single-tool re-probe path stays
   * one-name-per-call like our resolveFromLoginShell above -- so this method
   * is deliberately a separate, additional path rather than a replacement.
   *
   * The script mirrors Multica's technique:
   *   1. `unalias`/`unset -f` each name first, so an interactive shell's
   *      `alias claude=...` or a shell function can't shadow `command -v`
   *      and make it print the alias/function body instead of a real path
   *      (Multica's PR notes this was the actual bug behind their #2512).
   *   2. `command -v "$n"` to search the interactive PATH.
   *   3. Reject anything that isn't an absolute path (defence in depth if
   *      step 1 didn't fully unshadow it).
   *   4. Canonicalise via `cd "$(dirname ...)" && pwd -P` while the spawned
   *      shell is still alive, since version-manager "multishell" prefix
   *      dirs (fnm/nvm/volta) can be per-session and gone once the shell
   *      exits.
   *   5. Print `<name>\t<canonical_dir>/<basename>` per line.
   * We deliberately do NOT port Multica's extra step of skipping their own
   * `~/.multica/hooks` shadow directory -- MedScience has no equivalent
   * wrapper-script directory on PATH, so there is nothing there to exclude.
   */
  private async resolveManyFromLoginShell(names: string[]): Promise<Record<string, string>> {
    const uniqueNames = Array.from(new Set(names.filter((n) => /^[A-Za-z0-9._-]+$/.test(n))));
    if (uniqueNames.length === 0) return {};

    const cacheKey = `batch::${process.env.SHELL || ''}::${os.homedir()}::${process.env.PATH || ''}`;
    const cached = this.batchLoginShellCache;
    if (cached && cached.key === cacheKey && Date.now() - cached.cachedAt < LOGIN_SHELL_CACHE_TTL_MS) {
      return cached.resolved;
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const script = this.buildBatchLoginShellScript(uniqueNames);
    const result = await runWithTimeout(this.spawnFn, shell, ['-l', '-i', '-c', script], LOGIN_SHELL_TIMEOUT_MS);

    const resolved: Record<string, string> = {};
    if (!result.timedOut && result.code === 0) {
      for (const line of result.stdout.split('\n')) {
        const tab = line.indexOf('\t');
        if (tab < 0) continue;
        const name = line.slice(0, tab).trim();
        const candidate = line.slice(tab + 1).trim();
        if (!name || !path.isAbsolute(candidate)) continue;
        try {
          const stat = fs.statSync(candidate);
          if (stat.isFile() && (process.platform === 'win32' || (stat.mode & 0o111) !== 0)) {
            resolved[name] = candidate;
          }
        } catch {
          // Resolved by the shell a moment ago but gone now (e.g. an fnm
          // multishell dir that vanished with the helper shell) -- treat as
          // not found rather than handing back a dead path.
        }
      }
    }

    this.batchLoginShellCache = { key: cacheKey, cachedAt: Date.now(), resolved };
    return resolved;
  }

  private buildBatchLoginShellScript(names: string[]): string {
    const lines: string[] = [];
    lines.push('for n in ' + names.join(' ') + '; do');
    lines.push('  unalias "$n" 2>/dev/null');
    lines.push('  unset -f "$n" 2>/dev/null');
    lines.push('  p=$(command -v "$n" 2>/dev/null) || continue');
    lines.push('  [ -n "$p" ] || continue');
    lines.push('  case "$p" in /*) ;; *) continue ;; esac');
    lines.push('  d=$(dirname "$p") && f=$(basename "$p") && c=$(cd "$d" 2>/dev/null && pwd -P) || continue');
    lines.push('  printf \'%s\\t%s/%s\\n\' "$n" "$c" "$f"');
    lines.push('done');
    return lines.join('\n');
  }

  private notFoundMessage(spec: LocalRuntimeSpec): string {
    const extra = spec.extraSearchDirs && spec.extraSearchDirs.length > 0
      ? ` (also checked: ${spec.extraSearchDirs.join(', ')})`
      : '';
    return `${spec.displayName} was not found on PATH${extra} or in the login shell PATH.`;
  }

  public async resolveExecutablePath(
    spec: LocalRuntimeSpec,
    configuredPath?: string
  ): Promise<{ path?: string; source?: RuntimeProbeResult['source']; invalidConfigured?: boolean }> {
    if (configuredPath) {
      const resolved = path.resolve(configuredPath);
      const exists = fs.existsSync(resolved) && fs.statSync(resolved).isFile();
      if (!exists) return { invalidConfigured: true };
      return { path: resolved, source: 'configured' };
    }

    const fromPath = await this.resolveFromPath(spec);
    if (fromPath) return { path: fromPath, source: 'path' };

    const fromLoginShell = await this.resolveFromLoginShell(spec);
    if (fromLoginShell) return { path: fromLoginShell, source: 'login-shell' };

    return {};
  }

  public async probeVersion(spec: LocalRuntimeSpec, executablePath: string): Promise<{ version?: string; error?: RuntimeErrorCode }> {
    const result = await runWithTimeout(this.spawnFn, executablePath, spec.versionArgs, 5000);
    if (result.timedOut) return { error: 'RUNTIME_HANDSHAKE_TIMEOUT' };
    if (result.error || (result.code !== 0 && result.code !== null)) {
      // Some CLIs (observed in the wild for a few of these tools) print
      // version info to stdout but still exit non-zero when stdin isn't a
      // TTY -- so a version match in stdout/stderr still counts even if
      // the exit code alone looks like failure, rather than treating every
      // non-zero exit as "not found".
      const combined = `${result.stdout}\n${result.stderr}`;
      const match = combined.match(spec.versionRegex);
      if (match) return { version: match[1] };
      return { error: 'RUNTIME_START_FAILED' };
    }
    const match = result.stdout.match(spec.versionRegex) || result.stderr.match(spec.versionRegex);
    return { version: match?.[1] };
  }

  public async probe(spec: LocalRuntimeSpec, configuredPath?: string): Promise<RuntimeProbeResult> {
    const resolved = await this.resolveExecutablePath(spec, configuredPath);

    if (resolved.invalidConfigured) {
      return {
        runtime: spec.runtime,
        available: false,
        errorCode: 'RUNTIME_PATH_INVALID',
        message: `The configured ${spec.displayName} executable path does not exist or is not a file.`,
      };
    }
    if (!resolved.path) {
      return {
        runtime: spec.runtime,
        available: false,
        errorCode: 'RUNTIME_NOT_FOUND',
        message: this.notFoundMessage(spec),
      };
    }

    // Pure discovery: resolving to a real executable on this machine is
    // enough to report "available", matching Multica's own probeAgentCLIs
    // ("this is pure discovery: no version detection and no minimum-version
    // gate"). Version-flag conventions vary wildly across ~25 different
    // CLIs -- some use --version, some need a subcommand, some print to
    // stderr, some refuse without a TTY -- so a failed version probe must
    // never turn a genuinely-found binary into "not available". The version
    // string is shown when it works and simply omitted when it doesn't.
    const versionResult = await this.probeVersion(spec, resolved.path);
    return {
      runtime: spec.runtime,
      available: true,
      executablePath: resolved.path,
      version: versionResult.version,
      source: resolved.source,
    };
  }

  /**
   * Detect every given runtime in one pass, forking the login shell at most
   * ONCE total instead of once per runtime -- see resolveManyFromLoginShell's
   * doc comment for why this mirrors Multica's own startup/periodic
   * full-probe path rather than its single-tool re-probe path. This is what
   * discoverAllRuntimes() (the "Bind Local Runtime" button's detect pass)
   * calls; a single re-detect of one already-bound profile still goes
   * through probe() above, one shell fork at most, matching Multica's
   * reresolveAgentCommand.
   */
  public async probeMany(
    specs: LocalRuntimeSpec[],
    configuredPaths?: Partial<Record<string, string>>
  ): Promise<RuntimeProbeResult[]> {
    type ResolvedHit = { path: string; source: RuntimeProbeResult['source'] };
    const resolvedPaths = new Map<string, ResolvedHit>();
    const invalidConfigured = new Set<string>();
    const pending: Array<{ spec: LocalRuntimeSpec; firstCandidate: string }> = [];

    for (const spec of specs) {
      const configuredPath = configuredPaths?.[spec.runtime];
      if (configuredPath) {
        const resolvedAbs = path.resolve(configuredPath);
        const exists = fs.existsSync(resolvedAbs) && fs.statSync(resolvedAbs).isFile();
        if (!exists) {
          invalidConfigured.add(spec.runtime);
        } else {
          resolvedPaths.set(spec.runtime, { path: resolvedAbs, source: 'configured' });
        }
        continue;
      }
      const fromPath = await this.resolveFromPath(spec);
      if (fromPath) {
        resolvedPaths.set(spec.runtime, { path: fromPath, source: 'path' });
      } else {
        pending.push({ spec, firstCandidate: this.candidateNames(spec)[0] });
      }
    }

    if (pending.length > 0) {
      const batch = await this.resolveManyFromLoginShell(pending.map((p) => p.firstCandidate));
      for (const { spec, firstCandidate } of pending) {
        const hit = batch[firstCandidate];
        if (hit) resolvedPaths.set(spec.runtime, { path: hit, source: 'login-shell' });
      }
    }

    const results: RuntimeProbeResult[] = [];
    for (const spec of specs) {
      if (invalidConfigured.has(spec.runtime)) {
        results.push({
          runtime: spec.runtime,
          available: false,
          errorCode: 'RUNTIME_PATH_INVALID',
          message: `The configured ${spec.displayName} executable path does not exist or is not a file.`,
        });
        continue;
      }
      const hit = resolvedPaths.get(spec.runtime);
      if (!hit) {
        results.push({
          runtime: spec.runtime,
          available: false,
          errorCode: 'RUNTIME_NOT_FOUND',
          message: this.notFoundMessage(spec),
        });
        continue;
      }
      // Pure discovery here too -- see probe()'s matching comment.
      const versionResult = await this.probeVersion(spec, hit.path);
      results.push({
        runtime: spec.runtime,
        available: true,
        executablePath: hit.path,
        version: versionResult.version,
        source: hit.source,
      });
    }
    return results;
  }
}

export const globalGenericRuntimeDetector = new GenericRuntimeDetector();
