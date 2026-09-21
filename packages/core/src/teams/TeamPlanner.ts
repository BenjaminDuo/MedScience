import { ResearchTeamDefinition, TeamTask, TeamAgentId } from './types.js';
import { TeamAgentRegistry, globalTeamAgentRegistry } from './TeamRegistry.js';

/**
 * The structured tool the team leader must call to propose a task graph
 * (design doc section 6.1: "队长不能通过自由文本决定任务... 提供一个受控工具:
 * team_plan_submit"). Not a real domain tool registered in ToolRegistry --
 * ApiAgentRunner intercepts a tool call by this name directly instead of
 * routing it through tool execution.
 */
export const PLAN_SUBMIT_TOOL_NAME = 'team_plan_submit';

export interface RawPlanTaskSubmission {
  localId: string; // leader-chosen id, scoped to this submission only (e.g. "t1")
  title: string;
  objective: string;
  assignedAgentId: string;
  dependencyLocalIds: string[];
  acceptanceCriteria: string[];
  expectedOutputs: { kind: string; description: string }[];
}

export interface RawPlanSubmission {
  summary: string;
  tasks: RawPlanTaskSubmission[];
}

export function buildPlanSubmitToolSpec(team: ResearchTeamDefinition): { name: string; description: string; parameters: Record<string, any> } {
  const memberIds = team.members.map((m) => m.agentId);
  return {
    name: PLAN_SUBMIT_TOOL_NAME,
    description:
      'Submit the structured research task graph for this team run. This is the ONLY way to propose tasks -- do not describe a plan in free text instead of calling this tool. Every task must be assigned to a real team member and have concrete acceptance criteria.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One or two sentences on the overall approach.' },
        tasks: {
          type: 'array',
          description: 'The task graph. Keep it as small as covers the inquiry -- do not pad it with busywork tasks.',
          items: {
            type: 'object',
            properties: {
              localId: { type: 'string', description: 'A short id you choose for this task, unique within this submission (e.g. "t1"). Used only to express dependencies below.' },
              title: { type: 'string' },
              objective: { type: 'string', description: 'What this task must accomplish, specific enough for the assigned specialist to act on without further clarification.' },
              assignedAgentId: { type: 'string', enum: memberIds, description: 'Must be one of this team\'s member agent ids.' },
              dependencyLocalIds: { type: 'array', items: { type: 'string' }, description: 'localIds of other tasks in this same submission that must complete first. Empty array if none.' },
              acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'Concrete, checkable conditions for this task to count as done. Must not be empty.' },
              expectedOutputs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['evidence', 'artifact', 'finding', 'dataset', 'report-section'] },
                    description: { type: 'string' },
                  },
                  required: ['kind', 'description'],
                },
                description: 'What this task must produce. Must not be empty.',
              },
            },
            required: ['localId', 'title', 'objective', 'assignedAgentId', 'dependencyLocalIds', 'acceptanceCriteria', 'expectedOutputs'],
          },
        },
      },
      required: ['summary', 'tasks'],
    },
  };
}

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  tasks?: TeamTask[];
}

/**
 * Validates a leader's raw plan submission against the team roster and
 * budget (design doc section 6.1's TeamPlanner rules), and converts it into
 * real TeamTask records with generated ids and resolved dependency task ids.
 * Rejects (does not silently fix): unassigned/unknown agents, dependencies
 * that don't resolve within this submission, cycles, an empty task list, a
 * task with no acceptance criteria or expected outputs, and a task count
 * over the team's budget.
 */
export function validatePlanSubmission(
  raw: RawPlanSubmission,
  team: ResearchTeamDefinition,
  teamRunId: string,
  agentRegistry: TeamAgentRegistry = globalTeamAgentRegistry
): PlanValidationResult {
  const errors: string[] = [];
  const memberIds = new Set(team.members.map((m) => m.agentId));

  if (!raw || !Array.isArray(raw.tasks) || raw.tasks.length === 0) {
    return { valid: false, errors: ['The plan must include at least one task.'] };
  }
  if (raw.tasks.length > team.maxTasks) {
    errors.push(`The plan proposes ${raw.tasks.length} tasks, exceeding this team's budget of ${team.maxTasks}.`);
  }

  const seenLocalIds = new Set<string>();
  for (const t of raw.tasks) {
    if (!t.localId || seenLocalIds.has(t.localId)) {
      errors.push(`Task "${t.title || '(untitled)'}" has a missing or duplicate localId.`);
      continue;
    }
    seenLocalIds.add(t.localId);
    if (!t.title?.trim()) errors.push(`Task "${t.localId}" is missing a title.`);
    if (!t.objective?.trim()) errors.push(`Task "${t.localId}" is missing an objective.`);
    if (!memberIds.has(t.assignedAgentId)) {
      errors.push(`Task "${t.localId}" is assigned to "${t.assignedAgentId}", which is not a member of this team.`);
    }
    if (!Array.isArray(t.acceptanceCriteria) || t.acceptanceCriteria.length === 0) {
      errors.push(`Task "${t.localId}" has no acceptance criteria.`);
    }
    if (!Array.isArray(t.expectedOutputs) || t.expectedOutputs.length === 0) {
      errors.push(`Task "${t.localId}" has no expected outputs.`);
    }
  }

  // Dependency resolution + cycle detection (only meaningful once every localId is known-good).
  if (errors.length === 0) {
    const graph = new Map<string, string[]>();
    for (const t of raw.tasks) {
      for (const dep of t.dependencyLocalIds || []) {
        if (!seenLocalIds.has(dep)) {
          errors.push(`Task "${t.localId}" depends on unknown task "${dep}".`);
        }
      }
      graph.set(t.localId, t.dependencyLocalIds || []);
    }

    if (errors.length === 0) {
      const WHITE = 0;
      const GRAY = 1;
      const BLACK = 2;
      const state = new Map<string, number>();
      raw.tasks.forEach((t) => state.set(t.localId, WHITE));
      let cyclic = false;
      const visit = (id: string): void => {
        if (cyclic) return;
        state.set(id, GRAY);
        for (const dep of graph.get(id) || []) {
          const depState = state.get(dep);
          if (depState === GRAY) {
            cyclic = true;
            return;
          }
          if (depState === WHITE) visit(dep);
        }
        state.set(id, BLACK);
      };
      for (const t of raw.tasks) {
        if (state.get(t.localId) === WHITE) visit(t.localId);
      }
      if (cyclic) errors.push('The task graph contains a dependency cycle.');
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  // Convert to real TeamTask records with generated ids, resolving local->real dependency ids.
  const localToRealId = new Map<string, string>();
  raw.tasks.forEach((t, idx) => {
    localToRealId.set(t.localId, `task-${teamRunId}-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`);
  });

  const now = new Date().toISOString();
  const tasks: TeamTask[] = raw.tasks.map((t) => ({
    id: localToRealId.get(t.localId)!,
    teamRunId,
    title: t.title,
    objective: t.objective,
    assignedAgentId: t.assignedAgentId as TeamAgentId,
    dependencyTaskIds: (t.dependencyLocalIds || []).map((dep) => localToRealId.get(dep)!),
    acceptanceCriteria: t.acceptanceCriteria,
    expectedOutputs: t.expectedOutputs.map((o) => ({ kind: o.kind as any, description: o.description })),
    status: 'proposed',
    attempt: 0,
    evidenceIds: [],
    artifactIds: [],
    createdAt: now,
  }));

  return { valid: true, errors: [], tasks };
}
