import fs from 'node:fs';
import { DEFAULT_AGENT_ID } from '../../agents/agentPersona.js';
import path from 'node:path';
import os from 'node:os';
import { ExecutionBackend } from '../ExecutionBackend.js';
import {
  ActiveLocalRuntimeSession,
  ExecutionCallbacks,
  ExecutionMode,
  ExecutionRequest,
  ExecutionResult,
  LocalRuntimeExecutionProfile,
  RuntimeApprovalDecision,
  RuntimeApprovalRequest,
} from '../types.js';
import { globalExecutionProfileManager, ExecutionProfileManager } from '../../config/ExecutionProfileManager.js';
import { RuntimeDetector, globalRuntimeDetector } from './RuntimeDetector.js';
import { ChildProcessSupervisor } from './ChildProcessSupervisor.js';
import { JsonlRpcClient } from './JsonlRpcClient.js';
import { CodexAppServerClient } from './CodexAppServerClient.js';
import { SessionManager, globalSessionManager } from '../../core/SessionManager.js';
import { globalRuntimeUsageStore } from './RuntimeUsageStore.js';
import { EventBus, globalEventBus } from '../../core/EventBus.js';
import { Turn, ToolExecution } from '../../types/runtime.js';

interface SessionRuntimeHandle {
  supervisor: ChildProcessSupervisor;
  rpc: JsonlRpcClient;
  client: CodexAppServerClient;
  threadId?: string;
  cwd: string;
  /** The bound execution profile this session is running under -- lets listActiveSessions() report a per-profile count instead of one process-wide total. */
  profileId: string;
  /** This session's isolated CODEX_HOME -- see deriveCodexHome(). */
  codexHome: string;
  activeRunId?: string;
  activeTurnId?: string;
  // Storing the timer alongside the resolver lets respondApproval() clear
  // it once answered -- otherwise every approval leaves its 5-minute
  // default-deny timer running even after being resolved normally, which
  // (being a real, non-unref'd Node timer) keeps the process alive for up
  // to 5 minutes longer than it needs to.
  pendingApprovals: Map<string, { resolve: (decision: RuntimeApprovalDecision) => void; timer: NodeJS.Timeout }>;
}

function isThreadMissingError(message: string): boolean {
  return /not found|unknown thread|invalid thread|no such thread/i.test(message);
}

function isAuthError(message: string): boolean {
  return /not (logged|authenticated)|please (log|sign) in|unauthorized|authentication required/i.test(message);
}

/**
 * A dedicated, per-session CODEX_HOME so MedScience's local-runtime turns
 * never mix with the user's own everyday `codex` CLI usage. Without this,
 * the child process inherits `process.env` as-is and Codex's own Rollout
 * persistence (the mechanism behind `codex resume` / cross-surface session
 * sync) is transport-agnostic -- it writes to the same CODEX_HOME (default
 * `~/.codex`) whether driven by an interactive terminal or by this
 * app-server JSON-RPC client, so every MedScience conversation would show
 * up in the user's real Codex app / `codex resume` list right alongside
 * their personal sessions.
 *
 * Keyed by MedScience sessionId (not a shared/reused slot) deliberately --
 * Multica hit exactly this as a real bug (multica-ai/multica#3130): reusing
 * one CODEX_HOME across unrelated tasks let stale memories/instructions
 * from one task leak into the next. Deriving from a stable per-session id
 * instead means each MedScience session's Codex state is isolated from
 * every other one too, not just from the user's personal ~/.codex.
 *
 * Path is kept short and shallow (base + one segment) -- Multica also hit
 * a real bug (multica-ai/multica#4041) where an over-nested CODEX_HOME made
 * the app-server's control socket path exceed macOS's SUN_LEN limit.
 */
function deriveCodexHome(sessionId: string): string {
  const base = process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
  // sessionId is already a short, filesystem-safe id (see
  // `sess-${Date.now()}-${random}` in SessionManager.ts/AgentContext.tsx),
  // but sanitize defensively rather than trust that format never changes.
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(base, 'codex-runtime-home', safeId);
}

function ensureCodexHomeDir(codexHome: string): void {
  try {
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  } catch {
    // Best effort -- if this fails, Codex will fall back to creating
    // CODEX_HOME itself on first write, same as it does for ~/.codex today.
  }
}

export class CodexRuntimeBackend implements ExecutionBackend {
  public readonly mode: ExecutionMode = 'local-runtime';
  private handles: Map<string, SessionRuntimeHandle> = new Map();

  constructor(
    private executionProfileManager: ExecutionProfileManager = globalExecutionProfileManager,
    private detector: RuntimeDetector = globalRuntimeDetector,
    private sessionManager: SessionManager = globalSessionManager,
    private eventBus: EventBus = globalEventBus
  ) {}

  private getActiveLocalProfile(executionProfileId?: string): LocalRuntimeExecutionProfile {
    const profile = executionProfileId
      ? this.executionProfileManager.getProfile(executionProfileId)
      : this.executionProfileManager.getActiveProfile();
    if (!profile || profile.mode !== 'local-runtime') {
      throw new Error('No local Codex runtime profile is active.');
    }
    return profile;
  }

  private resolveCwd(profile: LocalRuntimeExecutionProfile, requestCwd: string | undefined, sessionId: string): string {
    if (profile.workingDirectoryMode === 'session-workspace') {
      const dir = path.join(process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience'), 'workspaces', sessionId);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      return fs.realpathSync(dir);
    }
    const candidate = requestCwd ? path.resolve(requestCwd) : process.cwd();
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
      const err = new Error('The resolved working directory does not exist or is not a directory.');
      (err as any).code = 'RUNTIME_CWD_INVALID';
      throw err;
    }
    return fs.realpathSync(candidate);
  }

  private emitEvent(
    sessionId: string,
    event: Parameters<EventBus['emit']>[0],
    callbacks?: ExecutionCallbacks
  ): void {
    // Every run-scoped event goes through both channels: the shared EventBus
    // (any other UI surface / IPC listener sees it) AND the per-call onEvent
    // callback ExecutionCallbacks documents -- previously only the EventBus
    // got it, so a caller that (like ExecutionRouter callers are meant to be
    // able to) only wired up onEvent silently received nothing.
    this.eventBus.emit(event);
    callbacks?.onEvent?.(event);
  }

  private async ensureSessionHandle(
    sessionId: string,
    profile: LocalRuntimeExecutionProfile,
    cwd: string,
    resumeThreadId: string | undefined
  ): Promise<SessionRuntimeHandle> {
    const existing = this.handles.get(sessionId);
    if (existing) return existing;

    const resolved = await this.detector.resolveExecutablePath(profile.executablePath);
    if (!resolved.path) {
      const err = new Error(
        resolved.invalidConfigured
          ? 'The configured Codex executable path is invalid.'
          : 'Codex CLI was not found. Install it or configure its path in Settings.'
      );
      (err as any).code = resolved.invalidConfigured ? 'RUNTIME_PATH_INVALID' : 'RUNTIME_NOT_FOUND';
      throw err;
    }

    const codexHome = deriveCodexHome(sessionId);
    ensureCodexHomeDir(codexHome);
    const supervisor = new ChildProcessSupervisor(resolved.path, ['app-server', '--listen', 'stdio://'], {
      cwd,
      // CODEX_HOME override is the whole point of deriveCodexHome() -- see
      // its doc comment. Everything else in process.env (PATH, auth tokens
      // Codex itself manages, etc.) still needs to reach the child process
      // as normal, so this is an override on top of it, not a replacement.
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    const child = supervisor.start();
    if (!child.stdout || !child.stdin) {
      await supervisor.terminate();
      throw new Error('Failed to open Codex app-server stdio pipes.');
    }

    const rpc = new JsonlRpcClient(child.stdout, child.stdin);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client = new CodexAppServerClient(rpc, { runId, sessionId });

    const handle: SessionRuntimeHandle = { supervisor, rpc, client, cwd, codexHome, profileId: profile.id, pendingApprovals: new Map() };
    this.handles.set(sessionId, handle);

    // The whole handshake -- initialize, then resume-or-start a thread -- is
    // one unit for cleanup purposes: a failure at ANY step (including the
    // final threadStart, e.g. because the process crashed a few ms after
    // answering `initialize`) must delete the handle and terminate the
    // supervisor. Previously only the `initialize()` call was guarded, so a
    // crash between initialize and threadStart left a dead handle (rpc
    // already permanently closed) cached under this sessionId forever --
    // every future execute() for that session would silently reuse it and
    // fail immediately with a confusing "transport is closed" error instead
    // of spawning a fresh process.
    try {
      await client.initialize();

      let threadId = resumeThreadId;
      let contextWasReset = false;
      if (threadId) {
        try {
          const resumed = await client.threadResume(threadId);
          threadId = resumed.threadId;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!isThreadMissingError(message)) throw error;
          // Thread genuinely gone (or incompatible) server-side: start
          // fresh, but say so rather than pretending nothing happened.
          threadId = undefined;
          contextWasReset = true;
        }
      }
      if (!threadId) {
        const started = await client.threadStart({ cwd, model: profile.model, sandboxPreset: profile.sandboxPreset });
        threadId = started.threadId;
      }
      handle.threadId = threadId;

      if (contextWasReset) {
        this.emitEvent(sessionId, {
          type: 'agent.thinking',
          sessionId,
          timestamp: new Date().toISOString(),
          payload: { thought: 'The previous Codex thread was no longer available; a new one was started.', phase: 'Runtime' },
        });
      }
    } catch (error) {
      await this.releaseHandle(sessionId, handle);
      throw error;
    }

    this.sessionManager.patchSession(sessionId, {
      executionMode: 'local-runtime',
      executionProfileId: profile.id,
      runtimeKind: 'codex',
      runtimeThreadId: handle.threadId,
      runtimeCwd: cwd,
    });

    return handle;
  }

  public async execute(request: ExecutionRequest, callbacks?: ExecutionCallbacks): Promise<ExecutionResult> {
    const sessionId = request.sessionId || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const profile = this.getActiveLocalProfile(request.executionProfileId);
    const existingSession = this.sessionManager.getSession(sessionId);
    const cwd = this.resolveCwd(profile, request.cwd, sessionId);

    // Create the session record (if this is a brand-new session) *before*
    // ensureSessionHandle, which persists runtime metadata onto it via
    // patchSession(sessionId, ...) -- patchSession is a silent no-op when
    // no session with that id exists yet, so doing this after would drop
    // executionMode/runtimeThreadId/runtimeCwd for a session's first turn.
    // Pass sessionId explicitly so the record's own id matches the id this
    // backend already committed to for its handle map, cwd resolution, and
    // event routing -- otherwise every subsequent addTurn/updateSessionStatus
    // call keyed on sessionId would silently find nothing.
    const session =
      existingSession ||
      this.sessionManager.createSession(
        request.prompt.slice(0, 60),
        // These used to be hardcoded 'proj-1'/'research': a conversation
        // started inside a workspace, with a specific member, was filed
        // under Uncategorized and attributed to the legacy default agent
        // as soon as it ran on the local runtime instead of the API.
        request.workspaceId || 'proj-1',
        request.agentId || DEFAULT_AGENT_ID,
        profile.id,
        profile.model,
        sessionId,
        request.sessionType || 'research',
        request.researchProfileId || 'general'
      );

    const handle = await this.ensureSessionHandle(sessionId, profile, cwd, existingSession?.runtimeThreadId);
    if (handle.activeRunId) {
      throw new Error('A run is already active for this session. Wait for it to finish or cancel it first.');
    }

    const runId = request.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    handle.activeRunId = runId;

    let agentResponse = '';
    const toolExecutions: Map<string, ToolExecution> = new Map();

    return await new Promise<ExecutionResult>((resolve, reject) => {
      let settled = false;
      const finish = (err: Error | null, result?: ExecutionResult) => {
        if (settled) return;
        settled = true;
        handle.activeRunId = undefined;
        handle.activeTurnId = undefined;
        if (err) reject(err);
        else resolve(result!);
      };

      handle.client.setCallbacks({
        onAgentMessageDelta: (_itemId, delta) => {
          agentResponse += delta;
          callbacks?.onDelta?.(delta);
          this.emitEvent(
            sessionId,
            {
            type: 'agent.message.delta',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { messageId: runId, delta },
          },
            callbacks
          );
        },
        onItemStarted: (item) => {
          const type = String(item.type || 'tool');
          if (type.toLowerCase().includes('command')) {
            const id = String(item.id || `item-${Date.now()}`);
            const exec: ToolExecution = {
              id,
              toolName: 'shell command',
              category: 'execution',
              description: 'Codex command execution',
              status: 'running',
              logs: [],
            };
            toolExecutions.set(id, exec);
            this.emitEvent(
            sessionId,
            {
              type: 'tool.started',
              sessionId,
              timestamp: new Date().toISOString(),
              payload: { toolId: id, toolName: exec.toolName, category: exec.category, input: {} },
            },
            callbacks
          );
          } else if (type.toLowerCase().includes('filechange')) {
            const id = String(item.id || `item-${Date.now()}`);
            this.emitEvent(
            sessionId,
            {
              type: 'file.change.started',
              sessionId,
              timestamp: new Date().toISOString(),
              payload: { itemId: id },
            },
            callbacks
          );
          }
        },
        onCommandOutputDelta: (itemId, text) => {
          const exec = toolExecutions.get(itemId);
          if (exec) {
            exec.logs.push(text);
            this.emitEvent(
            sessionId,
            {
              type: 'tool.progress',
              sessionId,
              timestamp: new Date().toISOString(),
              payload: { toolId: itemId, log: text },
            },
            callbacks
          );
          }
        },
        onItemCompleted: (item) => {
          const id = String(item.id || '');
          const exec = toolExecutions.get(id);
          if (exec) {
            exec.status = 'completed';
            this.emitEvent(
            sessionId,
            {
              type: 'tool.completed',
              sessionId,
              timestamp: new Date().toISOString(),
              payload: { toolId: id, execution: exec },
            },
            callbacks
          );
          } else {
            const type = String((item as any).type || '');
            if (type.toLowerCase().includes('filechange')) {
              this.emitEvent(
            sessionId,
            {
                type: 'file.change.completed',
                sessionId,
                timestamp: new Date().toISOString(),
                payload: { itemId: id, status: 'completed' },
              },
            callbacks
          );
            }
          }
        },
        onTurnStarted: () => {
          this.emitEvent(
            sessionId,
            {
            type: 'runtime.turn.started',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { runId, backend: 'local-runtime' },
          },
            callbacks
          );
        },
        onTokenUsageUpdated: (usage) => {
          // Best-effort telemetry only -- see RuntimeUsageStore's own doc
          // comment. Never let a usage-store write failure affect the run
          // itself (the store already swallows its own I/O errors).
          try {
            globalRuntimeUsageStore.recordUsage(profile.id, 'codex', usage);
          } catch (err) {
            console.error('[CodexRuntimeBackend] Failed to record token usage:', err);
          }
        },
        onTurnCompleted: (turn) => {
          const startedAt = new Date().toISOString();
          const status = turn.status === 'interrupted' ? 'cancelled' : turn.status === 'failed' ? 'error' : 'completed';
          const turnRecord: Turn = {
            index: session.turns.length,
            userInput: request.prompt,
            toolCalls: [],
            toolResults: [],
            agentResponse,
            status: status as Turn['status'],
            startedAt,
            completedAt: new Date().toISOString(),
            backend: 'local-runtime',
            runtimeTurnId: turn.id,
          } as unknown as Turn;

          this.sessionManager.addTurn(sessionId, turnRecord);
          this.sessionManager.updateSessionStatus(sessionId, status === 'error' ? 'error' : status === 'cancelled' ? 'cancelled' : 'completed');

          this.emitEvent(
            sessionId,
            {
            type: 'agent.message.completed',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { messageId: runId, fullContent: agentResponse },
          },
            callbacks
          );
          this.emitEvent(
            sessionId,
            {
            type: 'runtime.turn.completed',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { runId, status: status === 'error' ? 'failed' : (status as 'completed' | 'cancelled'), error: turn.error?.message },
          },
            callbacks
          );

          const refreshed = this.sessionManager.getSession(sessionId)!;
          finish(null, { session: refreshed, turn: turnRecord, backend: 'local-runtime', runtimeThreadId: handle.threadId });
        },
        onApprovalRequest: (request: RuntimeApprovalRequest) => {
          this.emitEvent(
            sessionId,
            {
            type: 'runtime.approval.requested',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { request },
          },
            callbacks
          );
          callbacks?.onApprovalRequest?.(request);
          return new Promise<RuntimeApprovalDecision>((resolveApproval) => {
            const timer = setTimeout(() => {
              if (handle.pendingApprovals.has(request.id)) {
                handle.pendingApprovals.delete(request.id);
                resolveApproval('decline'); // default-deny on timeout, per section 10.1
              }
            }, 5 * 60 * 1000);
            handle.pendingApprovals.set(request.id, { resolve: resolveApproval, timer });
          });
        },
        onUnknownNotification: () => {
          // Intentionally ignored: unrecognized protocol events must not
          // crash the run (section 8.3).
        },
        onFatalError: (error) => {
          // The transport is now permanently closed (crash, malformed/oversized
          // line, stdout EOF, ...). A turn waiting only on notifications has no
          // pending request for this to reject on its own, so without this it
          // would hang forever instead of surfacing an error. The handle is
          // dead either way, so drop it and terminate the process rather than
          // leaving a future execute() for this session reuse a closed transport.
          void this.releaseHandle(sessionId, handle);
          this.emitEvent(
            sessionId,
            {
            type: 'runtime.error',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { code: 'RUNTIME_CRASHED', message: error.message },
          },
            callbacks
          );
          finish(error);
        },
      });

      handle.client
        .turnStart({ threadId: handle.threadId!, text: request.prompt, cwd: handle.cwd, sandboxPreset: profile.sandboxPreset })
        .then((started) => {
          handle.activeTurnId = started.turnId;
        })
        .catch((error: Error) => {
          const authError = isAuthError(error.message);
          this.emitEvent(
            sessionId,
            {
            type: 'runtime.error',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { code: authError ? 'RUNTIME_NOT_AUTHENTICATED' : 'RUNTIME_PROTOCOL_ERROR', message: error.message },
          },
            callbacks
          );
          finish(error);
        });
    });
  }

  /**
   * Read-only status surface for the Settings "Runtime" status card (see
   * ModelConfigView.tsx) -- lists every session this backend currently has
   * a live Codex app-server child process for. This is process-local state
   * (the `handles` map lives only inside whichever Node process is running
   * `npm run web`/Electron main), so it reflects "sessions alive in THIS
   * process" rather than anything persisted to disk.
   */
  public listActiveSessions(): ActiveLocalRuntimeSession[] {
    return Array.from(this.handles.entries()).map(([sessionId, handle]) => ({
      sessionId,
      cwd: handle.cwd,
      codexHome: handle.codexHome,
      threadId: handle.threadId,
      activeRunId: handle.activeRunId,
      pendingApprovalCount: handle.pendingApprovals.size,
      profileId: handle.profileId,
    }));
  }

  public respondApproval(sessionId: string, approvalId: string, decision: RuntimeApprovalDecision): boolean {
    const handle = this.handles.get(sessionId);
    const pending = handle?.pendingApprovals.get(approvalId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    handle!.pendingApprovals.delete(approvalId);
    pending.resolve(decision);
    return true;
  }

  public async cancel(runId: string): Promise<boolean> {
    for (const [sessionId, handle] of this.handles.entries()) {
      if (handle.activeRunId !== runId) continue;
      if (!handle.threadId) return false;
      try {
        if (!handle.activeTurnId) {
          // turn/start hasn't resolved yet (still handshaking); there is
          // nothing to interrupt server-side, so tear down the process --
          // this still stops the run promptly.
          throw new Error('No active Codex turn id yet.');
        }
        let interruptTimer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            handle.client.turnInterrupt(handle.threadId, handle.activeTurnId),
            new Promise((_, reject) => {
              interruptTimer = setTimeout(() => reject(new Error('interrupt timeout')), 5000);
            }),
          ]);
        } finally {
          // The interrupt usually answers well inside 5s; the losing timer
          // must not keep the process alive for the rest of that window.
          clearTimeout(interruptTimer);
        }
        return true;
      } catch {
        await this.releaseHandle(sessionId, handle);
        this.emitEvent(sessionId, {
          type: 'runtime.turn.completed',
          sessionId,
          timestamp: new Date().toISOString(),
          payload: { runId, status: 'cancelled' },
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Drops a session's handle and everything it holds: the process tree and
   * any approval still waiting on the user. Every path that discards a
   * handle (failed start, fatal transport error, cancel, dispose) goes
   * through here. Each pending approval carries a 5-minute default-deny
   * timer, and dropping the handle without clearing it kept the whole
   * process alive for those 5 minutes -- the length of the test runner's
   * kill timeout, which is how it surfaced.
   */
  private async releaseHandle(sessionId: string, handle: SessionRuntimeHandle): Promise<void> {
    if (this.handles.get(sessionId) === handle) this.handles.delete(sessionId);
    for (const pending of handle.pendingApprovals.values()) {
      clearTimeout(pending.timer);
      // Nobody can answer it now; resolve it the way the timeout would have.
      pending.resolve('decline');
    }
    handle.pendingApprovals.clear();
    await handle.supervisor.terminate();
  }

  public async dispose(): Promise<void> {
    const all = Array.from(this.handles.entries());
    await Promise.all(all.map(([sessionId, handle]) => this.releaseHandle(sessionId, handle)));
  }
}

export const globalCodexRuntimeBackend = new CodexRuntimeBackend();
