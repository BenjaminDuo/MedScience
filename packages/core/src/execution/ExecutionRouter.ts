import { ExecutionBackend } from './ExecutionBackend.js';
import { ExecutionCallbacks, ExecutionRequest, ExecutionResult, RuntimeApprovalDecision } from './types.js';
import { ExecutionProfileManager, globalExecutionProfileManager } from '../config/ExecutionProfileManager.js';
import { ApiResearchBackend } from './ApiResearchBackend.js';
import { CodexRuntimeBackend } from './local/CodexRuntimeBackend.js';

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
  private activeRuns: Map<string, { backend: ExecutionBackend; sessionId?: string }> = new Map();

  constructor(
    private executionProfileManager: ExecutionProfileManager = globalExecutionProfileManager,
    apiBackend?: ApiResearchBackend,
    codexBackend?: CodexRuntimeBackend
  ) {
    this.apiBackend = apiBackend || new ApiResearchBackend();
    this.codexBackend = codexBackend || new CodexRuntimeBackend();
  }

  public getCodexBackend(): CodexRuntimeBackend {
    return this.codexBackend;
  }

  private backendFor(mode: 'api' | 'local-runtime'): ExecutionBackend {
    return mode === 'local-runtime' ? this.codexBackend : this.apiBackend;
  }

  public async execute(request: ExecutionRequest, callbacks?: ExecutionCallbacks): Promise<ExecutionResult> {
    const profile = request.executionProfileId
      ? this.executionProfileManager.getProfile(request.executionProfileId)
      : this.executionProfileManager.getActiveProfile();

    if (!profile) {
      throw new Error('No execution profile is configured. Open Settings to configure one.');
    }

    const runId = request.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const backend = this.backendFor(profile.mode);

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

  public respondApproval(sessionId: string, approvalId: string, decision: RuntimeApprovalDecision): boolean {
    return this.codexBackend.respondApproval(sessionId, approvalId, decision);
  }

  public async dispose(): Promise<void> {
    await Promise.all([this.apiBackend.dispose(), this.codexBackend.dispose()]);
  }
}

export const globalExecutionRouter = new ExecutionRouter();
