import { ExecutionBackend } from './ExecutionBackend.js';
import { ExecutionCallbacks, ExecutionMode, ExecutionRequest, ExecutionResult } from './types.js';
import { ResearchEngine, globalResearchEngine } from '../research-loop/ResearchEngine.js';

/**
 * Wraps the existing API research loop so it can sit behind ExecutionRouter
 * next to CodexRuntimeBackend as an equal, swappable backend. Deliberately
 * does not change ResearchEngine's own behavior (it still resolves the
 * globally active ModelProfile) -- see the implementation notes in the
 * final report about a follow-up to make that explicit per-request instead.
 */
export class ApiResearchBackend implements ExecutionBackend {
  public readonly mode: ExecutionMode = 'api';

  constructor(private engine: ResearchEngine = globalResearchEngine) {}

  public async execute(request: ExecutionRequest, callbacks?: ExecutionCallbacks): Promise<ExecutionResult> {
    const { session, turn } = await this.engine.executeInquiry(
      request.prompt,
      request.sessionId,
      (delta) => {
        callbacks?.onDelta?.(delta);
      },
      request.sessionType || 'research'
    );
    return { session, turn, backend: 'api' };
  }

  public async cancel(): Promise<boolean> {
    // The underlying AutonomousResearchEngine has no interrupt hook today.
    // Reporting false (rather than pretending to succeed) is the honest
    // answer; see final report for this as a documented limitation.
    return false;
  }

  public async dispose(): Promise<void> {
    // No persistent resources to release.
  }
}
