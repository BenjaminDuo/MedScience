import { ToolCategory } from '../types/runtime.js';

/**
 * Research Teams domain model (Phase 1: types + read-only registries only).
 *
 * This is a deliberately separate module from ../agents/AgentRegistry.ts and
 * its fixed `AgentId` union. Refactoring the existing, shipped, single-agent
 * system in place would be risky for no benefit right now; instead, "team"
 * agents live in their own namespace with a string id, and the existing
 * single-agent system is untouched. If/when the two are unified, that is a
 * deliberate later migration, not a byproduct of adding this feature.
 *
 * See JunScience_RESEARCH_TEAMS_DESIGN.md sections 5-9 for the full design
 * this file implements. Phase 1 (this file + BuiltInAgents.ts +
 * BuiltInTeamTemplates.ts + TeamProfileManager.ts) only covers definitions
 * and a read-only/clonable registry -- no TeamOrchestrator, TeamPlanner,
 * TeamScheduler, or AgentRunner exist yet, and nothing here executes a team.
 */

/** The 11 built-in team-scoped agent roles (design doc section 7). */
export type BuiltInAgentId =
  | 'principal-investigator'
  | 'research-planner'
  | 'literature-reviewer'
  | 'biology-specialist'
  | 'chemistry-specialist'
  | 'clinical-specialist'
  | 'biostatistician'
  | 'ml-specialist'
  | 'reproducibility-engineer'
  | 'scientific-critic'
  | 'scientific-writer';

/** Team-scoped agent ids are plain strings so custom agents can be added later without a type change. */
export type TeamAgentId = string;

export interface AgentDefinition {
  id: TeamAgentId;
  name: string;
  title: string;
  description: string;
  /** Chinese display strings for the frontend's language toggle -- optional so a
   *  user-created custom agent (no Chinese given) just falls back to the English
   *  fields; systemPrompt is deliberately NOT translated (stays English for the
   *  model regardless of UI language). */
  nameZh?: string;
  titleZh?: string;
  descriptionZh?: string;
  systemPrompt: string;
  capabilityTags: string[];
  allowedToolCategories: ToolCategory[];
  defaultSkillIds: string[];
  defaultExecutionProfileId?: string;
  privacyClass: 'standard' | 'sensitive-clinical';
  builtIn: boolean;
  enabled: boolean;
  version: number;
}

export interface ResearchTeamMember {
  agentId: TeamAgentId;
  role: string;
  /** Chinese display string for `role` -- see AgentDefinition.nameZh for the same optional-fallback rule. */
  roleZh?: string;
  capabilityOverrides?: string[];
  executionProfileId?: string;
  required: boolean;
  canLead: boolean;
}

export interface ResearchTeamDefinition {
  id: string;
  name: string;
  description: string;
  scenario: string;
  /** Chinese display strings -- see AgentDefinition.nameZh for the same optional-fallback rule. */
  nameZh?: string;
  descriptionZh?: string;
  scenarioZh?: string;
  leaderAgentId: TeamAgentId;
  instructions: string;
  members: ResearchTeamMember[];
  defaultExecutionProfileId?: string;
  maxConcurrency: number;
  maxTasks: number;
  maxRevisionsPerTask: number;
  planningMode: 'review-first' | 'automatic';
  builtIn: boolean;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Set only on a user-owned team created by cloning a built-in template. */
  clonedFromTemplateId?: string;
}

/**
 * Why a Team Run (or task, or the whole run) failed or stalled. Kept distinct
 * from a scientific "negative result": tool/network/permission failures must
 * never be recorded as if they were a finding about the world (design doc
 * section 5.6 / 17).
 */
export interface StructuredRunError {
  code: string;
  message: string;
  cause?:
    | 'no-evidence'
    | 'insufficient-evidence'
    | 'evidence-contradicted'
    | 'tool-failure'
    | 'permission-denied'
    | 'user-cancelled';
}

export type TeamRunStatus =
  | 'planning'
  | 'awaiting-plan-approval'
  | 'running'
  | 'awaiting-user'
  | 'reviewing'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TeamRunBudget {
  maxConcurrency: number;
  maxTasks: number;
  maxRevisionsPerTask: number;
  maxModelTurns?: number;
  maxTokens?: number;
  maxLocalRuntimeProcesses?: number;
}

export interface TeamRun {
  id: string;
  teamId: string;
  teamVersion: number;
  sessionId: string;
  inquiry: string;
  status: TeamRunStatus;
  leaderAgentId: TeamAgentId;
  taskIds: string[];
  sharedEvidenceIds: string[];
  artifactIds: string[];
  budget: TeamRunBudget;
  startedAt: string;
  completedAt?: string;
  failure?: StructuredRunError;
  qualityGate?: TeamQualityGateResult;
  report?: TeamRunReport;
}

export type TeamTaskStatus =
  | 'proposed'
  | 'blocked'
  | 'ready'
  | 'running'
  | 'awaiting-review'
  | 'revision-requested'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TeamExpectedOutput {
  kind: 'evidence' | 'artifact' | 'finding' | 'dataset' | 'report-section';
  description: string;
}

export interface TeamTask {
  id: string;
  teamRunId: string;
  title: string;
  objective: string;
  assignedAgentId: TeamAgentId;
  dependencyTaskIds: string[];
  acceptanceCriteria: string[];
  expectedOutputs: TeamExpectedOutput[];
  status: TeamTaskStatus;
  attempt: number;
  evidenceIds: string[];
  artifactIds: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentRun {
  id: string;
  teamRunId: string;
  taskId: string;
  agentId: TeamAgentId;
  executionProfileId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  runtimeThreadId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: StructuredRunError;
}

/**
 * observation: a tool/data-direct observation.
 * inference: an evidence-based inference.
 * hypothesis: a not-yet-verified hypothesis.
 * negative_result: a negative result backed by a real experiment or data.
 * execution_error: a network/tool/permission/run failure -- never convertible to negative_result.
 */
export type ScientificFindingKind = 'observation' | 'inference' | 'hypothesis' | 'negative_result' | 'execution_error';

export interface ScientificFinding {
  id: string;
  kind: ScientificFindingKind;
  statement: string;
  evidenceIds: string[];
  confidence?: number;
}

export interface ScientificHandoff {
  id: string;
  teamRunId: string;
  taskId: string;
  agentRunId: string;
  agentId: TeamAgentId;
  summary: string;
  methods: string[];
  findings: ScientificFinding[];
  evidenceIds: string[];
  artifactIds: string[];
  limitations: string[];
  unresolvedQuestions: string[];
  recommendedNextActions: string[];
  confidence: number;
  createdAt: string;
}

export type TeamLeaderDecision =
  | 'dispatch'
  | 'request-revision'
  | 'request-user-input'
  | 'no-action'
  | 'start-review'
  | 'start-synthesis'
  | 'fail-run';

export type TeamQualityGateVerdict = 'passed' | 'revision_required' | 'blocked_by_missing_evidence' | 'failed_integrity_check';

export interface TeamQualityGateResult {
  verdict: TeamQualityGateVerdict;
  issues: string[];
  recommendations: string[];
  summary: string;
}

/** The team's final synthesized output, produced only after the quality gate has passed. */
export interface TeamRunReport {
  inquiry: string;
  methods: string[];
  keyFindings: ScientificFinding[];
  evidenceIds: string[];
  conflicts: ScientificConflict[];
  limitations: string[];
  failedOrIncompleteTaskIds: string[];
  reproducibilityNotes: string[];
  narrative: string;
}

export interface ScientificConflict {
  id: string;
  teamRunId: string;
  findingIds: string[];
  conflictType: 'data' | 'method' | 'interpretation' | 'citation';
  status: 'open' | 'under-review' | 'resolved' | 'unresolved';
  resolutionTaskId?: string;
  resolution?: string;
}
