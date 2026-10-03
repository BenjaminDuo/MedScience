import { ToolExecution, Artifact, Citation, ExecutionMode } from './runtime.js';
import type { RuntimeApprovalRequest } from '../execution/types.js';

export interface BaseEvent<T extends string, P> {
  type: T;
  sessionId: string;
  timestamp: string;
  payload: P;
}

export type SessionCreatedEvent = BaseEvent<
  'session.created',
  { sessionId: string; title: string; agentId: string }
>;

export type SessionResumedEvent = BaseEvent<
  'session.resumed',
  { sessionId: string }
>;

export type SessionDeletedEvent = BaseEvent<
  'session.deleted',
  { sessionId: string }
>;

export type SessionRenamedEvent = BaseEvent<
  'session.renamed',
  { sessionId: string; title: string }
>;

export type AgentStartedEvent = BaseEvent<
  'agent.started',
  { agentId: string; objective: string }
>;

export type AgentThinkingEvent = BaseEvent<
  'agent.thinking',
  { thought: string; phase?: string }
>;

export type AgentMessageDeltaEvent = BaseEvent<
  'agent.message.delta',
  { messageId: string; delta: string }
>;

export type AgentMessageCompletedEvent = BaseEvent<
  'agent.message.completed',
  { messageId: string; fullContent: string }
>;

export type ToolStartedEvent = BaseEvent<
  'tool.started',
  { toolId: string; toolName: string; category: string; input: Record<string, any> }
>;

export type ToolProgressEvent = BaseEvent<
  'tool.progress',
  { toolId: string; log: string; percent?: number }
>;

export type ToolCompletedEvent = BaseEvent<
  'tool.completed',
  { toolId: string; execution: ToolExecution }
>;

export type ToolErrorEvent = BaseEvent<
  'tool.error',
  { toolId: string; error: string }
>;

export type ArtifactCreatedEvent = BaseEvent<
  'artifact.created',
  { artifact: Artifact }
>;

export type CitationCreatedEvent = BaseEvent<
  'citation.created',
  { citation: Citation }
>;

export type JobCreatedEvent = BaseEvent<
  'job.created',
  { jobId: string; name: string; target: string }
>;

export type JobProgressEvent = BaseEvent<
  'job.progress',
  { jobId: string; progress: number; statusText: string }
>;

export type JobCompletedEvent = BaseEvent<
  'job.completed',
  { jobId: string; resultSummary: string }
>;

export type PermissionRequestedEvent = BaseEvent<
  'permission.requested',
  { permissionId: string; operation: string; target: string; reason: string }
>;

export type PlanCreatedEvent = BaseEvent<
  'plan.created',
  { planId: string; inquiry: string; tasks: any[] }
>;

export type PlanTaskUpdatedEvent = BaseEvent<
  'plan.task.updated',
  { planId: string; taskId: string; status: string; task: any }
>;

export type PlanTaskCompletedEvent = BaseEvent<
  'plan.task.completed',
  { planId: string; taskId: string; evidenceIds: string[]; resultNote?: string }
>;

export type RuntimeTurnStartedEvent = BaseEvent<
  'runtime.turn.started',
  { runId: string; backend: ExecutionMode; runtimeTurnId?: string }
>;

export type RuntimeTurnCompletedEvent = BaseEvent<
  'runtime.turn.completed',
  { runId: string; status: 'completed' | 'failed' | 'cancelled'; error?: string }
>;

export type RuntimeApprovalRequestedEvent = BaseEvent<
  'runtime.approval.requested',
  { request: RuntimeApprovalRequest }
>;

export type RuntimeErrorEvent = BaseEvent<
  'runtime.error',
  { code: string; message: string }
>;

export type FileChangeStartedEvent = BaseEvent<
  'file.change.started',
  { itemId: string; files?: string[] }
>;

export type FileChangeCompletedEvent = BaseEvent<
  'file.change.completed',
  { itemId: string; files?: string[]; status: 'completed' | 'failed' }
>;

export type TeamRunStartedEvent = BaseEvent<
  'team.run.started',
  { teamRunId: string; teamId: string; leaderAgentId: string }
>;

export type TeamRunStatusEvent = BaseEvent<
  'team.run.status',
  { teamRunId: string; status: string }
>;

export type TeamPlanReadyEvent = BaseEvent<
  'team.plan.ready',
  { teamRunId: string; taskIds: string[] }
>;

export type TeamTaskStatusEvent = BaseEvent<
  'team.task.status',
  { teamRunId: string; taskId: string; agentId: string; status: string }
>;

export type TeamHandoffSubmittedEvent = BaseEvent<
  'team.handoff.submitted',
  { teamRunId: string; taskId: string; handoffId: string; agentId: string }
>;

export type TeamRunCompletedEvent = BaseEvent<
  'team.run.completed',
  { teamRunId: string; status: 'completed' | 'failed' | 'cancelled'; error?: { code: string; message: string } }
>;

export type EvidenceLedgerUpdatedEvent = BaseEvent<
  'evidence.ledger.updated',
  {
    source: 'research-turn' | 'hypothesis-tree' | 'team-run' | 'retraction-sweep' | 'curator';
    admitted: number;
    quarantined: number;
    claims?: number;
    /** State changes made by a sweep or a curator action, including cascades. */
    transitions?: number;
    error?: string;
  }
>;

export type RuntimeEvent =
  | SessionCreatedEvent
  | SessionResumedEvent
  | SessionDeletedEvent
  | SessionRenamedEvent
  | AgentStartedEvent
  | AgentThinkingEvent
  | AgentMessageDeltaEvent
  | AgentMessageCompletedEvent
  | ToolStartedEvent
  | ToolProgressEvent
  | ToolCompletedEvent
  | ToolErrorEvent
  | ArtifactCreatedEvent
  | CitationCreatedEvent
  | JobCreatedEvent
  | JobProgressEvent
  | JobCompletedEvent
  | PermissionRequestedEvent
  | PlanCreatedEvent
  | PlanTaskUpdatedEvent
  | PlanTaskCompletedEvent
  | RuntimeTurnStartedEvent
  | RuntimeTurnCompletedEvent
  | RuntimeApprovalRequestedEvent
  | RuntimeErrorEvent
  | FileChangeStartedEvent
  | FileChangeCompletedEvent
  | TeamRunStartedEvent
  | TeamRunStatusEvent
  | TeamPlanReadyEvent
  | TeamTaskStatusEvent
  | TeamHandoffSubmittedEvent
  | TeamRunCompletedEvent
  | EvidenceLedgerUpdatedEvent;

export type EventType = RuntimeEvent['type'];
