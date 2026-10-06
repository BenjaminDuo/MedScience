import { EvidenceRecord } from '../research-loop/EvidenceTracker.js';
import { ScientificFinding, ScientificHandoff } from '../teams/types.js';
import { ToolCategory } from '../types/runtime.js';

export type SubagentTaskType = string;

export interface SubagentTask {
  id: string;
  parentSessionId: string;
  type: SubagentTaskType;
  objective: string;
  context?: string;
  acceptanceCriteria?: string[];
  allowedToolCategories?: ToolCategory[];
  allowedToolNames?: string[];
  maxTurns?: number;
  parentTaskId?: string;
  metadata?: Record<string, unknown>;
}

export interface SubagentContext {
  originalInquiry: string;
  objective: string;
  parentSummary?: string;
  relevantFindings?: ScientificFinding[];
  relevantEvidence?: EvidenceRecord[];
  dependencyHandoffs?: ScientificHandoff[];
  constraints?: string[];
  skillIds?: string[];
}

export interface SubagentHandoff extends ScientificHandoff {
  origin: 'subagent';
  parentSessionId: string;
  taskType: SubagentTaskType;
}

export interface SubagentFailure {
  taskId: string;
  status: 'failed' | 'timeout' | 'cancelled' | 'inconclusive';
  error: string;
}

export interface EvidenceAdoption {
  taskId: string;
  mapping: Record<string, string>;
  evidenceIds: string[];
}

export interface SubagentOrchestrationResult {
  handoffs: SubagentHandoff[];
  evidenceAdoptions: EvidenceAdoption[];
  failures: SubagentFailure[];
  unresolvedQuestions: string[];
}
