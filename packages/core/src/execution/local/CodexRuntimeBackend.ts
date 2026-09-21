import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ExecutionBackend } from '../ExecutionBackend.js';
import {
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
import { EventBus, globalEventBus } from '../../core/EventBus.js';
import { Turn, ToolExecution } from '../../types/runtime.js';

interface SessionRuntimeHandle {
  supervisor: ChildProcessSupervisor;
  rpc: JsonlRpcClient;
  client: CodexAppServerClient;
  threadId?: string;
  cwd: string;
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

    const supervisor = new ChildProcessSupervisor(resolved.path, ['app-server', '--listen', 'stdio://'], {
      cwd,
      env: process.env,
    });
    const child = supervisor.start();
    if (!child.stdout || !child.stdin) {
      await supervisor.terminate();
      throw new Error('Failed to open Codex app-server stdio pipes.');
    }

    const rpc = new JsonlRpcClient(child.stdout, child.stdin);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client = new CodexAppServerClient(rpc, { runId, sessionId });

    const handle: SessionRuntimeHandle = { supervisor, rpc, client, cwd, pendingApprovals: new Map() };
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
      this.handles.delete(sessionId);
      await supervisor.terminate();
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
      this.sessionManager.createSession(request.prompt.slice(0, 60), 'proj-1', 'research', profile.id, profile.model, sessionId);

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
          this.handles.delete(sessionId);
          void handle.supervisor.terminate();
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
        await Promise.race([
          handle.client.turnInterrupt(handle.threadId, handle.activeTurnId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('interrupt timeout')), 5000)),
        ]);
        return true;
      } catch {
        await handle.supervisor.terminate();
        this.handles.delete(sessionId);
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

  public async dispose(): Promise<void> {
    const all = Array.from(this.handles.values());
    this.handles.clear();
    // Clear any still-pending approval timers (default-deny-on-timeout) so a
    // disposed backend doesn't keep the process alive for up to 5 more
    // minutes over approvals nobody will ever answer now.
    for (const handle of all) {
      for (const pending of handle.pendingApprovals.values()) {
        clearTimeout(pending.timer);
      }
      handle.pendingApprovals.clear();
    }
    await Promise.all(all.map((h) => h.supervisor.terminate()));
  }
}

export const globalCodexRuntimeBackend = new CodexRuntimeBackend();
