import { ExecutionMode, ExecutionRequest, ExecutionResult, ExecutionCallbacks } from './types.js';

export interface ExecutionBackend {
  readonly mode: ExecutionMode;
  execute(request: ExecutionRequest, callbacks?: ExecutionCallbacks): Promise<ExecutionResult>;
  cancel(runId: string): Promise<boolean>;
  dispose(): Promise<void>;
}
