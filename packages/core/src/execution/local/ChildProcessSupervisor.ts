import { spawn, ChildProcess, SpawnOptionsWithoutStdio } from 'node:child_process';

const STDERR_TAIL_LIMIT = 4000;
const FORCED_EXIT_TIMEOUT_MS = 1000;

// Redacts common secret shapes (Authorization headers, bearer tokens, API
// keys) from anything that might end up in a diagnostic log. Best-effort:
// this is a safety net, not the only place secrets must be kept out of logs.
function redact(text: string): string {
  return text
    .replace(/(authorization\s*:\s*)\S+/gi, '$1[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9]{10,}/g, 'sk-[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (m.length >= 32 ? '[redacted]' : m));
}

export interface ChildProcessSupervisorOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export type ExitReason =
  | { kind: 'exited'; code: number | null; signal: NodeJS.Signals | null }
  | { kind: 'spawn-error'; error: Error };

/**
 * Owns exactly one child process: its PID/process-group, stdio streams, a
 * bounded stderr tail, and safe termination. It knows nothing about the
 * Codex/JSON-RPC protocol running over the pipes -- that belongs to
 * JsonlRpcClient / CodexAppServerClient.
 */
export class ChildProcessSupervisor {
  private child?: ChildProcess;
  private stderrTail = '';
  private exitPromise: Promise<ExitReason>;
  private resolveExit!: (reason: ExitReason) => void;
  private exitSettled = false;
  private closePromise: Promise<void>;
  private resolveClose!: () => void;
  private closeSettled = false;
  private terminationPromise?: Promise<void>;

  constructor(private executablePath: string, private args: string[], private options: ChildProcessSupervisorOptions) {
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
    });
    this.closePromise = new Promise((resolve) => {
      this.resolveClose = resolve;
    });
  }

  public start(): ChildProcess {
    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: this.options.cwd,
      env: this.options.env || process.env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      // POSIX: detached creates a new process group headed by this PID, so we
      // can signal the whole group (Codex's own subprocesses included) on
      // cleanup without touching processes we did not start.
      detached: process.platform !== 'win32',
    };

    let child: ChildProcess;
    try {
      child = spawn(this.executablePath, this.args, spawnOptions);
    } catch (error) {
      this.markExit({ kind: 'spawn-error', error: error as Error });
      throw error;
    }
    this.child = child;

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = redact(chunk.toString('utf-8'));
      this.stderrTail = (this.stderrTail + text).slice(-STDERR_TAIL_LIMIT);
    });

    child.on('error', (error) => {
      this.markExit({ kind: 'spawn-error', error });
    });
    child.on('exit', (code, signal) => {
      this.markExit({ kind: 'exited', code, signal });
    });
    child.on('close', () => this.markClose());

    return child;
  }

  public get pid(): number | undefined {
    return this.child?.pid;
  }

  public get stdout() {
    return this.child?.stdout;
  }

  public get stdin() {
    return this.child?.stdin;
  }

  public getStderrTail(): string {
    return this.stderrTail;
  }

  public waitForExit(): Promise<ExitReason> {
    return this.exitPromise;
  }

  private markExit(reason: ExitReason): void {
    if (this.exitSettled) return;
    this.exitSettled = true;
    this.resolveExit(reason);
  }

  private markClose(): void {
    if (this.closeSettled) return;
    this.closeSettled = true;
    this.resolveClose();
  }

  private hasExited(child: ChildProcess): boolean {
    // signalCode can become visible just before Node emits the `exit` event;
    // the event is the point at which stdio and the ChildProcess lifecycle are
    // observable as finished, so do not treat signalCode alone as completion.
    return this.exitSettled || child.exitCode !== null;
  }

  private closeStdio(child: ChildProcess): void {
    // Child exit normally closes these streams shortly afterwards. Destroying
    // them after exit also releases any pipe handles retained by a child that
    // inherited or held one of the stdio descriptors open.
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      try {
        stream?.destroy();
      } catch {
        // best effort
      }
    }
  }

  private async waitForExitWithin(timeoutMs: number): Promise<boolean> {
    if (this.exitSettled) return true;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.exitPromise.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async waitForCloseWithin(timeoutMs: number): Promise<boolean> {
    if (this.closeSettled) return true;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.closePromise.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private requestWindowsTermination(pid: number | undefined): void {
    if (pid === undefined) {
      try {
        this.child?.kill();
      } catch {
        // ignore
      }
      return;
    }
    try {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
      // The target child is still awaited below. The helper itself must not
      // become a second process that keeps the parent alive during teardown.
      killer.unref();
    } catch {
      try {
        this.child?.kill();
      } catch {
        // ignore
      }
    }
  }

  private async terminateInternal(gracefulTimeoutMs: number): Promise<void> {
    const child = this.child;
    if (!child) return;

    if (this.hasExited(child)) {
      this.closeStdio(child);
      await this.waitForCloseWithin(FORCED_EXIT_TIMEOUT_MS);
      return;
    }

    try {
      child.stdin?.end();
    } catch {
      // ignore
    }

    if (process.platform === 'win32') {
      this.requestWindowsTermination(child.pid);
    } else {
      const pid = child.pid;
      if (pid !== undefined) {
        try {
          // Negative PID signals the whole process group created via
          // `detached` without touching processes we did not start.
          process.kill(-pid, 'SIGTERM');
        } catch {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
        }
      }
    }

    const exitedGracefully = await this.waitForExitWithin(gracefulTimeoutMs);
    if (!exitedGracefully && !this.hasExited(child)) {
      const pid = child.pid;
      try {
        if (process.platform !== 'win32' && pid !== undefined) process.kill(-pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }

      // Do not resolve immediately after SIGKILL. Observe the exit event when
      // possible, while retaining a bounded safety timeout for an already
      // reaped process or an unusual platform runtime that emits no event.
      await this.waitForExitWithin(FORCED_EXIT_TIMEOUT_MS);
    }

    this.closeStdio(child);
    await this.waitForCloseWithin(FORCED_EXIT_TIMEOUT_MS);
  }

  /**
   * Graceful-then-forceful shutdown of exactly the process tree this
   * supervisor started. Never targets other processes by name.
   */
  public terminate(gracefulTimeoutMs = 3000): Promise<void> {
    if (this.terminationPromise) return this.terminationPromise;
    this.terminationPromise = this.terminateInternal(gracefulTimeoutMs);
    return this.terminationPromise;
  }
}
