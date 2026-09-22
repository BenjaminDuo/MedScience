export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'tool_calling'
  | 'executing'
  | 'generating'
  | 'waiting_for_permission'
  | 'completed'
  | 'error'
  | 'cancelled';

export type ToolCategory =
  | 'literature'
  | 'analysis'
  | 'code'
  | 'experiment'
  | 'molecule'
  | 'databases'
  | 'execution'
  | 'artifacts'
  | 'medical';

export interface ToolExecution {
  id: string;
  toolName: string;
  category: ToolCategory;
  description: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  logs: string[];
  duration?: string;
  resultSummary?: string;
}

export interface Artifact {
  id: string;
  type: 'figure' | 'dataset' | 'table' | 'protein' | 'molecule' | 'code' | 'report';
  title: string;
  description: string;
  metadata?: Record<string, string | number>;
  generatedFrom?: string;
}

export interface Citation {
  id: string;
  index: number;
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi?: string;
  pmid?: string;
  abstractSnippet?: string;
  url?: string;
}

export type AgentId =
  | 'research'
  | 'biology'
  | 'chemistry'
  | 'ml'
  | 'critic'
  | 'literature-reviewer'
  | 'plan';

export type OperationType =
  | 'READ'
  | 'WRITE'
  | 'EXECUTE'
  | 'NETWORK'
  | 'INSTALL'
  | 'DELETE';

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionRequest {
  id: string;
  operation: OperationType;
  target: string;
  reason: string;
  timestamp: string;
  decision?: PermissionDecision;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  callId: string;
  name: string;
  output: any;
  error?: string;
  execution: ToolExecution;
}

export type ExecutionMode = 'api' | 'local-runtime';
/**
 * Which local CLI tool a 'local-runtime' ExecutionProfile drives. Each kind
 * has its own ExecutionBackend (see execution/local/) and its own isolated
 * home directory strategy (see execution/local/runtimeIsolation.ts) so a
 * MedScience-driven conversation never mixes into the user's personal
 * history for that tool -- see runtimeCatalog.ts for the full picture
 * (display name, detection spec, isolation confidence) of each one.
 */
// The full identity list mirrors Multica's own 26-tool catalog (server/pkg/agent/*.go,
// server/internal/daemon/agents_probe.go, cloned and read directly from
// github.com/multica-ai/multica while building this) so MedScience can detect the
// same breadth of local coding-agent CLIs. 'codex' keeps its own pre-existing
// detector/backend (RuntimeDetector.ts/CodexRuntimeBackend.ts); every other id here
// is detected generically via GenericRuntimeDetector.ts + runtimeCatalog.ts, and can
// be "bound" as a profile, but only Codex can currently execute a research turn --
// see UnimplementedLocalRuntimeBackend.ts.
export type LocalRuntimeKind =
  | 'codex'
  | 'claude-code'
  | 'opencode'
  | 'cursor'
  | 'copilot'
  | 'qwen'
  | 'qwenpaw'
  | 'grok'
  | 'kimi'
  | 'codebuddy'
  | 'codearts'
  | 'deveco'
  | 'openclaw'
  | 'hermes'
  | 'pi'
  | 'omp'
  | 'reasonix'
  | 'dsh'
  | 'kiro'
  | 'antigravity'
  | 'qoder'
  | 'qoderclicn'
  | 'traecli'
  | 'dim'
  | 'mcode'
  | 'zeroclaw';

export interface Turn {
  index: number;
  userInput: string;
  thought?: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  agentResponse: string;
  status: AgentStatus;
  startedAt: string;
  completedAt?: string;
  /** Which execution backend produced this turn. Absent means API (pre-existing sessions). */
  backend?: ExecutionMode;
  /** The local runtime's own turn id (e.g. Codex's turn/start result), for diagnostics/export. */
  runtimeTurnId?: string;
}

export type SessionType = 'chat' | 'research';

export interface RuntimeSession {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeAgent: AgentId;
  activeProfileId?: string;
  activeModel: string;
  status: AgentStatus;
  turns: Turn[];
  artifacts: Artifact[];
  citations: Citation[];
  metadata: Record<string, any>;
  /**
   * Fixed at session creation and never changed afterwards. 'research'
   * routes every turn through AutonomousResearchEngine's full
   * hypothesize/retrieve/verify pipeline (mandatory tool use, evidence
   * tracking, the CritiqueEngine gate); 'chat' routes through the
   * lightweight ChatEngine instead (plain conversation, no forced tool use
   * or evidence gate). Deciding this once per session -- rather than
   * per-message -- is deliberate: inferring intent message-by-message
   * (from a model-emitted tag, or from whether tools happened to get
   * called) is exactly what used to make a plain "你好" kick off a full
   * research run. Optional so existing on-disk sessions from before this
   * field existed keep loading unchanged; treat a missing value as
   * 'research' (the prior, only behavior).
   */
  sessionType?: SessionType;
  /**
   * Which ResearchProfile (research-loop/ResearchProfiles.ts) this
   * session's AutonomousResearchEngine runs use -- 'literature-review',
   * 'molecular-target', 'clinical-evidence', or the default 'general'.
   * Fixed at creation, same rationale as sessionType: the plan template
   * and tool-routing a profile selects should not shift mid-conversation.
   * Irrelevant for 'chat' sessions (ChatEngine ignores it). Optional so
   * existing on-disk sessions keep loading unchanged; treat a missing
   * value as 'general'.
   */
  researchProfileId?: string;
  /** All fields below are optional so existing on-disk sessions (pre-local-runtime) keep loading unchanged. */
  executionMode?: ExecutionMode;
  executionProfileId?: string;
  runtimeKind?: LocalRuntimeKind;
  runtimeThreadId?: string;
  runtimeCwd?: string;
}
