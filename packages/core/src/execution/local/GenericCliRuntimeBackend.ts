import fs from 'node:fs';
import { DEFAULT_AGENT_ID } from '../../agents/agentPersona.js';
import path from 'node:path';
import os from 'node:os';
import { ExecutionBackend } from '../ExecutionBackend.js';
import { ExecutionCallbacks, ExecutionMode, ExecutionRequest, ExecutionResult, LocalRuntimeExecutionProfile } from '../types.js';
import { globalExecutionProfileManager, ExecutionProfileManager } from '../../config/ExecutionProfileManager.js';
import { GenericRuntimeDetector, globalGenericRuntimeDetector } from './GenericRuntimeDetector.js';
import { ChildProcessSupervisor } from './ChildProcessSupervisor.js';
import { DEFAULT_NON_INTERACTIVE_ARGS, findRuntimeSpec } from './runtimeCatalog.js';
import { prepareRuntimeIsolation } from './runtimeIsolation.js';
import { SessionManager, globalSessionManager } from '../../core/SessionManager.js';
import { EventBus, globalEventBus } from '../../core/EventBus.js';
import { Turn } from '../../types/runtime.js';

// A single turn gets at most this long end to end...
const TOTAL_TIMEOUT_MS = 10 * 60 * 1000;
// ...and is killed early if it produces no stdout at all for this long --
// most of these CLIs are unverified (see runtimeCatalog.ts's
// nonInteractiveArgs doc comment), so a tool that silently hangs waiting
// for a TTY/approval prompt that will never come needs to fail fast rather
// than tie up the run for the full 10 minutes.
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
// Kept response text is generous but bounded -- these tools have no
// structured output contract MedScience can rely on, so the whole of
// stdout is the "response", and a runaway process should not be able to
// grow that without limit.
const STDOUT_KEEP_LIMIT = 200_000;

interface RunHandle {
  supervisor: ChildProcessSupervisor;
}

/**
 * Runs any catalog local runtime OTHER than Codex (see
 * CodexRuntimeBackend.ts, which keeps its own richer app-server protocol)
 * as a plain one-shot CLI invocation: spawn it with a non-interactive
 * prompt flag (LocalRuntimeSpec.nonInteractiveArgs), capture whatever it
 * prints to stdout as the agent's response, and resolve when the process
 * exits.
 *
 * This is deliberately a much thinner integration than CodexRuntimeBackend:
 * no bidirectional protocol, no per-command/per-file-change approval
 * round-trip, and no persistent process kept alive between turns. That is
 * an explicit, user-requested tradeoff -- most of these ~25 catalog tools
 * have no publicly documented way to intercept individual tool calls the
 * way Codex's app-server (or Claude Code's --permission-prompt-tool, or
 * OpenCode's `opencode serve` permission endpoint) do, and the user asked
 * to run them anyway rather than wait for that to be verified/built one
 * tool at a time. Whatever permission behavior a given tool falls back to
 * on its own when run non-interactively (auto-approve, silently decline,
 * hang) is between the user and that tool -- MedScience does not mediate
 * it here, and the UI says so (see ModelConfigView.tsx's per-runtime note).
 *
 * Because there is no persistent session/thread on the tool's side, every
 * turn is a fresh process: conversation continuity across turns depends
 * entirely on whatever that tool's own on-disk session storage does by
 * default. This is a known limitation, not an oversight.
 */
export class GenericCliRuntimeBackend implements ExecutionBackend {
  public readonly mode: ExecutionMode = 'local-runtime';
  private activeRuns: Map<string, RunHandle> = new Map();

  constructor(
    private executionProfileManager: ExecutionProfileManager = globalExecutionProfileManager,
    private detector: GenericRuntimeDetector = globalGenericRuntimeDetector,
    private sessionManager: SessionManager = globalSessionManager,
    private eventBus: EventBus = globalEventBus
  ) {}

  private getActiveLocalProfile(executionProfileId?: string): LocalRuntimeExecutionProfile {
    const profile = executionProfileId
      ? this.executionProfileManager.getProfile(executionProfileId)
      : this.executionProfileManager.getActiveProfile();
    if (!profile || profile.mode !== 'local-runtime') {
      throw new Error('No local runtime profile is active.');
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

  private emitEvent(sessionId: string, event: Parameters<EventBus['emit']>[0], callbacks?: ExecutionCallbacks): void {
    this.eventBus.emit(event);
    callbacks?.onEvent?.(event);
  }

  public async execute(request: ExecutionRequest, callbacks?: ExecutionCallbacks): Promise<ExecutionResult> {
    const sessionId = request.sessionId || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const profile = this.getActiveLocalProfile(request.executionProfileId);
    const spec = findRuntimeSpec(profile.runtime);
    if (!spec) {
      throw new Error(`Unknown local runtime: ${profile.runtime}`);
    }

    const existingSession = this.sessionManager.getSession(sessionId);
    const cwd = this.resolveCwd(profile, request.cwd, sessionId);
    const session =
      existingSession ||
      this.sessionManager.createSession(
        request.prompt.slice(0, 60),
        request.workspaceId || 'proj-1',
        request.agentId || DEFAULT_AGENT_ID,
        profile.id,
        profile.model,
        sessionId,
        request.sessionType || 'research',
        request.researchProfileId || 'general'
      );

    const resolved = await this.detector.resolveExecutablePath(spec, profile.executablePath);
    if (!resolved.path) {
      const now = new Date().toISOString();
      const turn: Turn = {
        index: session.turns.length,
        userInput: request.prompt,
        toolCalls: [],
        toolResults: [],
        agentResponse: `${spec.displayName} could not be found on this machine (checked PATH, its usual install locations, and your login shell). Re-check it under Settings -> Bind Local Runtime.`,
        status: 'error',
        startedAt: now,
        completedAt: now,
        backend: 'local-runtime',
      };
      this.sessionManager.addTurn(sessionId, turn);
      this.sessionManager.updateSessionStatus(sessionId, 'error');
      return { session: this.sessionManager.getSession(sessionId)!, turn, backend: 'local-runtime' };
    }

    const runId = request.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isolation = prepareRuntimeIsolation(profile.runtime, sessionId);
    const buildArgs = spec.nonInteractiveArgs || DEFAULT_NON_INTERACTIVE_ARGS;
    const args = buildArgs(request.prompt);

    this.sessionManager.patchSession(sessionId, {
      executionMode: 'local-runtime',
      executionProfileId: profile.id,
      runtimeKind: profile.runtime,
      runtimeCwd: cwd,
    });

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

    const supervisor = new ChildProcessSupervisor(resolved.path, args, {
      cwd,
      env: { ...process.env, ...isolation.env },
    });
    this.activeRuns.set(runId, { supervisor });

    try {
      let output = '';
      let idleTimedOut = false;
      let idleTimer: NodeJS.Timeout | undefined;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleTimedOut = true;
          void supervisor.terminate();
        }, IDLE_TIMEOUT_MS);
      };

      const child = supervisor.start();
      resetIdleTimer();

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        if (output.length < STDOUT_KEEP_LIMIT) output += text;
        resetIdleTimer();
        callbacks?.onDelta?.(text);
        this.emitEvent(
          sessionId,
          {
            type: 'agent.message.delta',
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { messageId: runId, delta: text },
          },
          callbacks
        );
      });

      let totalTimedOut = false;
      const totalTimeoutPromise = new Promise<'timeout'>((resolve) => {
        setTimeout(() => {
          totalTimedOut = true;
          resolve('timeout');
        }, TOTAL_TIMEOUT_MS);
      });

      const exitReason = await Promise.race([supervisor.waitForExit(), totalTimeoutPromise]);
      if (idleTimer) clearTimeout(idleTimer);

      let status: Turn['status'];
      let agentResponse: string;

      if (totalTimedOut || exitReason === 'timeout') {
        await supervisor.terminate();
        status = 'error';
        agentResponse =
          output.trim() ||
          `${spec.displayName} did not finish within ${Math.round(TOTAL_TIMEOUT_MS / 60000)} minutes and was stopped.`;
      } else if (typeof exitReason === 'object' && exitReason.kind === 'spawn-error') {
        status = 'error';
        agentResponse = `Failed to start ${spec.displayName}: ${exitReason.error.message}`;
      } else if (idleTimedOut) {
        status = 'error';
        agentResponse =
          output.trim() ||
          `${spec.displayName} produced no output for ${Math.round(IDLE_TIMEOUT_MS / 60000)} minutes and was stopped -- it may be waiting on a prompt or approval this backend cannot answer (see this runtime's note in Settings).`;
      } else if (typeof exitReason === 'object' && exitReason.kind === 'exited' && exitReason.code === 0) {
        status = 'completed';
        agentResponse = output.trim() || '(no output)';
      } else {
        status = 'error';
        const code = typeof exitReason === 'object' && exitReason.kind === 'exited' ? exitReason.code : null;
        const stderrTail = supervisor.getStderrTail();
        agentResponse = `${spec.displayName} exited with code ${code}.${stderrTail ? `\n\n${stderrTail}` : ''}${
          output.trim() ? `\n\n${output.trim()}` : ''
        }`;
      }

      const now = new Date().toISOString();
      const turn: Turn = {
        index: session.turns.length,
        userInput: request.prompt,
        toolCalls: [],
        toolResults: [],
        agentResponse,
        status,
        startedAt: now,
        completedAt: now,
        backend: 'local-runtime',
      };

      this.sessionManager.addTurn(sessionId, turn);
      this.sessionManager.updateSessionStatus(sessionId, status === 'error' ? 'error' : 'completed');

      this.emitEvent(
        sessionId,
        {
          type: 'agent.message.completed',
          sessionId,
          timestamp: now,
          payload: { messageId: runId, fullContent: agentResponse },
        },
        callbacks
      );
      this.emitEvent(
        sessionId,
        {
          type: 'runtime.turn.completed',
          sessionId,
          timestamp: now,
          payload: { runId, status: status === 'error' ? 'failed' : 'completed' },
        },
        callbacks
      );

      return { session: this.sessionManager.getSession(sessionId)!, turn, backend: 'local-runtime' };
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  public async cancel(runId: string): Promise<boolean> {
    const handle = this.activeRuns.get(runId);
    if (!handle) return false;
    await handle.supervisor.terminate();
    return true;
  }

  public async dispose(): Promise<void> {
    await Promise.all(Array.from(this.activeRuns.values()).map((h) => h.supervisor.terminate()));
    this.activeRuns.clear();
  }
}

export const globalGenericCliRuntimeBackend = new GenericCliRuntimeBackend();
