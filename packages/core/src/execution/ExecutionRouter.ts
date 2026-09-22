import { ExecutionBackend } from './ExecutionBackend.js';
import { ActiveLocalRuntimeSession, ExecutionCallbacks, ExecutionRequest, ExecutionResult, RuntimeApprovalDecision } from './types.js';
import { LocalRuntimeKind } from '../types/runtime.js';
import { ExecutionProfileManager, globalExecutionProfileManager } from '../config/ExecutionProfileManager.js';
import { ApiResearchBackend } from './ApiResearchBackend.js';
import { CodexRuntimeBackend } from './local/CodexRuntimeBackend.js';
import { UnimplementedLocalRuntimeBackend } from './local/UnimplementedLocalRuntimeBackend.js';
import { GenericCliRuntimeBackend } from './local/GenericCliRuntimeBackend.js';

/**
 * The single entry point both Electron IPC and the local Web bridge should
 * call through -- neither transport should decide "api vs local-runtime"
 * itself (see implementation guide section 4.2). It reads the active
 * ExecutionProfile, dispatches to the matching backend, and owns the
 * runId -> backend map so cancel() and approvals can be routed without the
 * caller needing to know which backend is currently in play.
 */
export class ExecutionRouter {
  private apiBackend: ApiResearchBackend;
  private codexBackend: CodexRuntimeBackend;
  // Kept around for tests/back-compat, but no longer wired into
  // backendFor() -- every non-Codex local runtime now runs through
  // genericBackend (see GenericCliRuntimeBackend's doc comment for why
  // that's a thinner, no-approval integration).
  private unimplementedBackend: UnimplementedLocalRuntimeBackend;
  // Claude Code / OpenCode / every other catalog runtime except Codex --
  // spawned as a plain one-shot CLI process, no per-action approval.
  private genericBackend: GenericCliRuntimeBackend;
  private activeRuns: Map<string, { backend: ExecutionBackend; sessionId?: string }> = new Map();

  constructor(
    private executionProfileManager: ExecutionProfileManager = globalExecutionProfileManager,
    apiBackend?: ApiResearchBackend,
    codexBackend?: CodexRuntimeBackend,
    unimplementedBackend?: UnimplementedLocalRuntimeBackend,
    genericBackend?: GenericCliRuntimeBackend
  ) {
    this.apiBackend = apiBackend || new ApiResearchBackend();
    this.codexBackend = codexBackend || new CodexRuntimeBackend();
    this.unimplementedBackend = unimplementedBackend || new UnimplementedLocalRuntimeBackend();
    this.genericBackend = genericBackend || new GenericCliRuntimeBackend();
  }

  public getCodexBackend(): CodexRuntimeBackend {
    return this.codexBackend;
  }

  /**
   * Dispatches by BOTH mode and, for 'local-runtime', which tool the active
   * profile names (profile.runtime). Codex gets its own richer app-server
   * backend (bidirectional protocol, real per-action approval); every other
   * catalog runtime -- Claude Code, OpenCode, and the rest -- runs through
   * GenericCliRuntimeBackend as a one-shot CLI invocation with NO per-action
   * approval step (explicit, user-requested tradeoff -- see that class's
   * doc comment). UnimplementedLocalRuntimeBackend is no longer used here.
   */
  private backendFor(mode: 'api' | 'local-runtime', runtime?: LocalRuntimeKind): ExecutionBackend {
    if (mode !== 'local-runtime') return this.apiBackend;
    return runtime === 'codex' || runtime === undefined ? this.codexBackend : this.genericBackend;
  }

  public async execute(request: ExecutionRequest, callbacks?: ExecutionCallbacks): Promise<ExecutionResult> {
    const profile = request.executionProfileId
      ? this.executionProfileManager.getProfile(request.executionProfileId)
      : this.executionProfileManager.getActiveProfile();

    if (!profile) {
      throw new Error('No execution profile is configured. Open Settings to configure one.');
    }

    const runId = request.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const backend = this.backendFor(profile.mode, profile.mode === 'local-runtime' ? profile.runtime : undefined);

    // Deliberately do NOT mint a sessionId here for a brand-new session:
    // both backends already have their own "no sessionId means start fresh"
    // path (ResearchEngine.executeInquiry / CodexRuntimeBackend.execute),
    // and each one mints the *actual* session record's id itself. Forcing a
    // synthetic id here would hand the backend a sessionId that no session
    // record exists for yet, which for the API backend makes
    // ResearchEngine.executeInquiry create a session under a *different*,
    // real id while everything downstream keeps referring to this fake one
    // -- silently dropping turns/status updates. Track by request.sessionId
    // (possibly undefined for a new session); it is only used here for
    // bookkeeping, never to gate cancel()/respondApproval(), which route by
    // runId/sessionId supplied directly by the caller once the real session
    // id is known from the ExecutionResult.
    this.activeRuns.set(runId, { backend, sessionId: request.sessionId });
    try {
      return await backend.execute({ ...request, runId, executionProfileId: profile.id }, callbacks);
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  public async cancel(runId: string): Promise<boolean> {
    const entry = this.activeRuns.get(runId);
    if (!entry) return false;
    return entry.backend.cancel(runId);
  }

  /** Delegates to CodexRuntimeBackend.listActiveSessions() -- see its doc comment. */
  public listActiveLocalSessions(): ActiveLocalRuntimeSession[] {
    return this.codexBackend.listActiveSessions();
  }

  public respondApproval(sessionId: string, approvalId: string, decision: RuntimeApprovalDecision): boolean {
    return this.codexBackend.respondApproval(sessionId, approvalId, decision);
  }

  public async dispose(): Promise<void> {
    await Promise.all([
      this.apiBackend.dispose(),
      this.codexBackend.dispose(),
      this.unimplementedBackend.dispose(),
      this.genericBackend.dispose(),
    ]);
  }
}

export const globalExecutionRouter = new ExecutionRouter();
