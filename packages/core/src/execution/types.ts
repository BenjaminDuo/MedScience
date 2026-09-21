import { RuntimeSession, Turn, ExecutionMode, LocalRuntimeKind } from '../types/runtime.js';
import type { RuntimeEvent } from '../types/events.js';

// ---------------------------------------------------------------------------
// Execution modes & profiles
// (ExecutionMode / LocalRuntimeKind live in types/runtime.ts since Turn and
// RuntimeSession need them too; re-exported here for anyone importing from
// execution/types.ts directly.)
// ---------------------------------------------------------------------------

export type { ExecutionMode, LocalRuntimeKind };

export interface ApiExecutionProfile {
  id: string;
  name: string;
  mode: 'api';
  modelProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalRuntimeExecutionProfile {
  id: string;
  name: string;
  mode: 'local-runtime';
  runtime: 'codex';
  executablePath?: string;
  model?: string;
  workingDirectoryMode: 'project' | 'session-workspace';
  sandboxPreset: 'read-only' | 'workspace-write';
  approvalPreset: 'prompt';
  networkAccess: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExecutionProfile = ApiExecutionProfile | LocalRuntimeExecutionProfile;

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

export type RuntimeErrorCode =
  | 'RUNTIME_NOT_FOUND'
  | 'RUNTIME_PATH_INVALID'
  | 'RUNTIME_VERSION_UNSUPPORTED'
  | 'RUNTIME_PROTOCOL_UNAVAILABLE'
  | 'RUNTIME_NOT_AUTHENTICATED'
  | 'RUNTIME_START_FAILED'
  | 'RUNTIME_HANDSHAKE_TIMEOUT'
  | 'RUNTIME_CRASHED'
  | 'RUNTIME_PROTOCOL_ERROR'
  | 'RUNTIME_APPROVAL_TIMEOUT'
  | 'RUNTIME_CANCELLED'
  | 'RUNTIME_CWD_INVALID';

export interface RuntimeProbeResult {
  runtime: LocalRuntimeKind;
  available: boolean;
  executablePath?: string;
  version?: string;
  protocolAvailable?: boolean;
  authenticated?: boolean;
  source?: 'configured' | 'path' | 'login-shell' | 'bundled';
  errorCode?: RuntimeErrorCode;
  message?: string;
}

// ---------------------------------------------------------------------------
// Execution requests / results
// ---------------------------------------------------------------------------

export interface ExecutionRequest {
  prompt: string;
  sessionId?: string;
  executionProfileId?: string;
  cwd?: string;
  /** Assigned by ExecutionRouter so cancel(runId) can route to the right backend without the caller needing to track which backend handled a request. A backend used directly (outside the router) may generate its own if absent. */
  runId?: string;
}

export interface ExecutionResult {
  session: RuntimeSession;
  turn: Turn;
  backend: ExecutionMode;
  runtimeThreadId?: string;
}

export interface ExecutionCallbacks {
  onDelta?: (delta: string) => void;
  onEvent?: (event: RuntimeEvent) => void;
  onApprovalRequest?: (request: RuntimeApprovalRequest) => void;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export interface RuntimeApprovalRequest {
  id: string;
  runId: string;
  sessionId: string;
  kind: 'command' | 'file-change' | 'permissions';
  title: string;
  summary: string;
  command?: string[];
  cwd?: string;
  files?: string[];
  createdAt: string;
  expiresAt: string;
}

export type RuntimeApprovalDecision = 'accept' | 'decline' | 'cancel';

// ---------------------------------------------------------------------------
// Sandbox presets exposed to the UI (decoupled from the Codex protocol enums)
// ---------------------------------------------------------------------------

export const SANDBOX_PRESET_SEMANTICS: Record<LocalRuntimeExecutionProfile['sandboxPreset'], string> = {
  'read-only': 'Allows reading the workspace; writes and dangerous operations are declined or require explicit approval.',
  'workspace-write': 'Allows writing inside the selected workspace; anything outside it or high-risk needs approval.',
};
