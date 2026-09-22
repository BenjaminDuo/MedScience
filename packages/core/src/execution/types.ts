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
  /** Which local CLI tool this profile drives -- see LocalRuntimeKind's doc comment (types/runtime.ts). */
  runtime: LocalRuntimeKind;
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

/**
 * One entry per session that currently has a live local-runtime (Codex)
 * child process running in THIS process -- see
 * CodexRuntimeBackend.listActiveSessions(). Powers the Settings "Runtime"
 * status card's active-session list (ModelConfigView.tsx); process-local,
 * not persisted.
 */
export interface ActiveLocalRuntimeSession {
  sessionId: string;
  cwd: string;
  /** This session's isolated CODEX_HOME -- separate from the user's own ~/.codex. */
  codexHome: string;
  threadId?: string;
  activeRunId?: string;
  pendingApprovalCount: number;
  /** Which bound execution profile (ModelConfigView.tsx's Bound Runtimes list) owns this session, so the UI can show a per-row active-session count instead of one lumped total. Undefined for sessions started before this field existed. */
  profileId?: string;
}

/**
 * A single token-usage delta reported for one turn (or one
 * thread/tokenUsage/updated notification, for Codex). All fields are
 * optional because not every backend/protocol reports every breakdown --
 * only totalTokens is guaranteed to be summed when present; the others are
 * kept for a more detailed future breakdown but are not required today.
 */
export interface RuntimeUsageDelta {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
}

/**
 * Cumulative token usage for one bound local-runtime execution profile,
 * persisted across app restarts (see RuntimeUsageStore.ts). Today this is
 * only ever populated for Codex, the one local runtime that can actually
 * execute turns -- see the "not yet supported" note wherever this is
 * surfaced in the UI (ModelConfigView.tsx).
 */
export interface RuntimeUsageRecord {
  runtime: LocalRuntimeKind;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
  lastUpdated: string;
}

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
  /**
   * Only consulted by ApiResearchBackend, and only when this request starts
   * a brand-new session (no session record yet for sessionId) -- an
   * existing session already has its sessionType fixed from creation and
   * ignores this. Defaults to 'research' when omitted, matching prior
   * behavior. See RuntimeSession.sessionType.
   */
  sessionType?: 'chat' | 'research';
  /**
   * Which Workspace this conversation belongs to (see Workspace /
   * WorkspaceManager). Only consulted, like sessionType, when this request
   * starts a brand-new session; an existing session keeps the workspace it
   * was created under. Defaults to 'proj-1' (the self-initializing
   * "Uncategorized" workspace) when omitted.
   */
  workspaceId?: string;
  /**
   * Which ResearchProfile (see research-loop/ResearchProfiles.ts) this
   * session's AutonomousResearchEngine runs use -- only consulted, like
   * sessionType/workspaceId, when this request starts a brand-new session.
   * Defaults to 'general' when omitted. Irrelevant for 'chat' sessions.
   */
  researchProfileId?: string;
  /**
   * The frontend's current UI language at submission time. Per-turn, unlike
   * sessionType/workspaceId/researchProfileId above -- it's read fresh on
   * every request rather than fixed at session creation, since a user can
   * flip the language toggle mid-conversation. Only ApiResearchBackend's
   * AutonomousResearchEngine path consults it (for the plan checklist);
   * defaults to 'en' when omitted.
   */
  language?: 'en' | 'zh';
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
