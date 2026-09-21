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
export type LocalRuntimeKind = 'codex';

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
  projectId: string;
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
  /** All fields below are optional so existing on-disk sessions (pre-local-runtime) keep loading unchanged. */
  executionMode?: ExecutionMode;
  executionProfileId?: string;
  runtimeKind?: LocalRuntimeKind;
  runtimeThreadId?: string;
  runtimeCwd?: string;
}
