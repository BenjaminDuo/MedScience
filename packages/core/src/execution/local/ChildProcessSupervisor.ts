import { spawn, ChildProcess, SpawnOptionsWithoutStdio } from 'node:child_process';

const STDERR_TAIL_LIMIT = 4000;

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
  private disposed = false;

  constructor(private executablePath: string, private args: string[], private options: ChildProcessSupervisorOptions) {
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
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
      this.resolveExit({ kind: 'spawn-error', error: error as Error });
      throw error;
    }
    this.child = child;

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = redact(chunk.toString('utf-8'));
      this.stderrTail = (this.stderrTail + text).slice(-STDERR_TAIL_LIMIT);
    });

    child.on('error', (error) => {
      this.resolveExit({ kind: 'spawn-error', error });
    });
    child.on('exit', (code, signal) => {
      this.resolveExit({ kind: 'exited', code, signal });
    });

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

  /**
   * Graceful-then-forceful shutdown of exactly the process tree this
   * supervisor started. Never targets other processes by name.
   */
  public async terminate(gracefulTimeoutMs = 3000): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const child = this.child;
    if (!child || child.killed || child.exitCode !== null) return;

    const pid = child.pid;
    if (pid === undefined) return;

    try {
      child.stdin?.end();
    } catch {
      // ignore
    }

    if (process.platform === 'win32') {
      try {
        // Fixed argument array, shell:false -- no command-line construction
        // from user-controlled strings.
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: false, windowsHide: true });
      } catch {
        // ignore
      }
      return;
    }

    try {
      // Negative PID signals the whole process group created via `detached`.
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }

    const exited = await Promise.race([
      this.exitPromise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), gracefulTimeoutMs)),
    ]);

    if (!exited) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }
  }
}
