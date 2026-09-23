import { ExecutionBackend } from '../ExecutionBackend.js';
import { ExecutionCallbacks, ExecutionMode, ExecutionRequest, ExecutionResult, LocalRuntimeExecutionProfile } from '../types.js';
import { SessionManager, globalSessionManager } from '../../core/SessionManager.js';
import { Turn } from '../../types/runtime.js';
import { findRuntimeSpec } from './runtimeCatalog.js';

/**
 * Placeholder backend for a local runtime that MedScience can detect and
 * bind (see GenericRuntimeDetector.ts / runtimeIsolation.ts) but cannot yet
 * actually run a research turn through -- driving Claude Code's or
 * OpenCode's headless protocol end-to-end (streaming, tool-call mapping,
 * an approval-relay UX on par with CodexRuntimeBackend's) is real,
 * separate follow-on work, not something to fake here.
 *
 * Rather than let ExecutionRouter dispatch to nothing (hanging) or throw an
 * opaque error, this reports a clean, honest turn: the user picked a real,
 * detected, isolated runtime, and gets told plainly that running through it
 * isn't wired up yet, instead of silent failure.
 */
export class UnimplementedLocalRuntimeBackend implements ExecutionBackend {
  public readonly mode: ExecutionMode = 'local-runtime';

  constructor(private sessionManager: SessionManager = globalSessionManager) {}

  public async execute(request: ExecutionRequest, _callbacks?: ExecutionCallbacks): Promise<ExecutionResult> {
    const sessionId = request.sessionId || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existingSession = this.sessionManager.getSession(sessionId);
    const session =
      existingSession ||
      this.sessionManager.createSession(
        request.prompt.slice(0, 60),
        request.workspaceId || 'proj-1',
        request.agentId || 'general-expert'
      );

    const now = new Date().toISOString();
    const turn: Turn = {
      index: session.turns.length,
      userInput: request.prompt,
      toolCalls: [],
      toolResults: [],
      agentResponse:
        'This local runtime is bound and isolated, but MedScience does not yet support running research turns through it -- only Local Codex executes turns today. Pick a different execution profile, or watch for support to land here.',
      status: 'error',
      startedAt: now,
      completedAt: now,
      backend: 'local-runtime',
    };

    this.sessionManager.addTurn(sessionId, turn);
    this.sessionManager.updateSessionStatus(sessionId, 'error');
    const refreshed = this.sessionManager.getSession(sessionId)!;

    return { session: refreshed, turn, backend: 'local-runtime' };
  }

  public async cancel(_runId: string): Promise<boolean> {
    return false;
  }

  public async dispose(): Promise<void> {
    // Nothing to dispose -- this backend never starts a process.
  }
}

export function describeUnimplementedRuntime(runtime: LocalRuntimeExecutionProfile['runtime']): string {
  const spec = findRuntimeSpec(runtime);
  return spec?.displayName || runtime;
}
