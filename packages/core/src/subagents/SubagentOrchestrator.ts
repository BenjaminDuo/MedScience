import { ModelProvider } from '../client/ModelProvider.js';
import { EvidenceTracker } from '../research-loop/EvidenceTracker.js';
import { EvidenceVerifier, globalEvidenceVerifier } from '../research-loop/EvidenceVerifier.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { SkillRegistry, globalSkillRegistry } from '../skills/SkillRegistry.js';
import { ToolCategory } from '../types/runtime.js';
import { ToolRegistry, globalToolRegistry } from '../tools/ToolRegistry.js';
import { HookRegistry, globalHookRegistry } from '../hooks/HookRegistry.js';
import { SubagentRunner } from './SubagentRunner.js';
import { EvidenceAdoption, SUBAGENT_RUNTIME_LIMITS, SubagentContext, SubagentFailure, SubagentHandoff, SubagentOrchestrationResult, SubagentTask } from './types.js';

export interface SubagentOrchestratorOptions {
  modelProvider: ModelProvider;
  model?: string;
  toolRegistry?: ToolRegistry;
  skillRegistry?: SkillRegistry;
  eventBus?: EventBus;
  evidenceVerifier?: EvidenceVerifier;
  hookRegistry?: HookRegistry;
  maxConcurrentSubagents?: number;
}

export interface SubagentOrchestrationParams {
  parentSessionId: string;
  tasks: SubagentTask[];
  context: SubagentContext;
  parentEvidenceTracker?: EvidenceTracker;
  parentAllowedToolCategories?: ReadonlySet<ToolCategory>;
  parentAllowedToolNames?: ReadonlySet<string>;
  maxConcurrentSubagents?: number;
  abortSignal?: AbortSignal;
}

export class SubagentOrchestrator {
  private modelProvider: ModelProvider;
  private model?: string;
  private readonly toolRegistry: ToolRegistry;
  private readonly skillRegistry: SkillRegistry;
  private readonly eventBus: EventBus;
  private readonly evidenceVerifier: EvidenceVerifier;
  private readonly hookRegistry: HookRegistry;
  private readonly defaultMaxConcurrent: number;

  constructor(options: SubagentOrchestratorOptions) {
    this.modelProvider = options.modelProvider;
    this.model = options.model;
    this.toolRegistry = options.toolRegistry || globalToolRegistry;
    this.skillRegistry = options.skillRegistry || globalSkillRegistry;
    this.eventBus = options.eventBus || globalEventBus;
    this.evidenceVerifier = options.evidenceVerifier || globalEvidenceVerifier;
    this.hookRegistry = options.hookRegistry || globalHookRegistry;
    this.defaultMaxConcurrent = this.boundConcurrent(options.maxConcurrentSubagents, 3);
  }

  public setModelProvider(provider: ModelProvider): void {
    this.modelProvider = provider;
  }

  public setModel(model: string | undefined): void {
    this.model = model;
  }

  public async run(params: SubagentOrchestrationParams): Promise<SubagentOrchestrationResult> {
    this.validateTasks(params.tasks);
    const pending = new Map(params.tasks.map((task) => [task.id, task]));
    const handoffs: SubagentHandoff[] = [];
    const failures: SubagentFailure[] = [];
    const evidenceAdoptions: EvidenceAdoption[] = [];
    const unresolvedQuestions: string[] = [];
    const maxConcurrent = this.boundConcurrent(params.maxConcurrentSubagents, this.defaultMaxConcurrent);

    while (pending.size > 0) {
      if (params.abortSignal?.aborted) {
        for (const task of pending.values()) failures.push({ taskId: task.id, status: 'cancelled', error: 'Subagent orchestration cancelled.' });
        break;
      }

      const ready = Array.from(pending.values()).filter((task) =>
        !task.parentTaskId || handoffs.some((handoff) => handoff.taskId === task.parentTaskId)
      );
      if (ready.length === 0) {
        for (const task of pending.values()) failures.push({ taskId: task.id, status: 'inconclusive', error: `Dependency '${task.parentTaskId}' did not produce a handoff.` });
        break;
      }

      const batch = ready.slice(0, maxConcurrent);
      batch.forEach((task) => pending.delete(task.id));
      const results = await Promise.all(batch.map(async (task) => {
        const dependencyHandoffs = handoffs.filter((handoff) => task.parentTaskId === handoff.taskId);
        const taskContext: SubagentContext = {
          ...params.context,
          objective: task.objective,
          dependencyHandoffs,
        };
        const runner = new SubagentRunner({
          modelProvider: this.modelProvider,
          model: this.model,
          toolRegistry: this.toolRegistry,
          skillRegistry: this.skillRegistry,
          eventBus: this.eventBus,
          evidenceVerifier: this.evidenceVerifier,
          hookRegistry: this.hookRegistry,
        });
        return { task, result: await runner.run(task, taskContext, params.parentAllowedToolCategories, params.parentAllowedToolNames, params.abortSignal) };
      }));

      for (const { task, result } of results) {
        if (result.status !== 'completed' || !result.handoff) {
          failures.push({
            taskId: task.id,
            status: result.status === 'cancelled' ? 'cancelled' : result.status === 'timeout' ? 'timeout' : 'failed',
            error: result.error || 'Subagent failed without a handoff.',
          });
          continue;
        }

        let handoff = result.handoff;
        if (params.parentEvidenceTracker) {
          const adoption = params.parentEvidenceTracker.adoptFrom(result.evidenceTracker, handoff.evidenceIds);
          const rewrite = (id: string): string => adoption.mapping[`${result.evidenceTracker.scopeId}:${id}`] || id;
          handoff = {
            ...handoff,
            evidenceIds: handoff.evidenceIds.map(rewrite),
            findings: handoff.findings.map((finding) => ({ ...finding, evidenceIds: finding.evidenceIds.map(rewrite) })),
          };
          evidenceAdoptions.push({ taskId: task.id, mapping: adoption.mapping, evidenceIds: adoption.records.map((record) => record.id) });
        }
        handoffs.push(handoff);
        unresolvedQuestions.push(...handoff.unresolvedQuestions);
      }
    }

    return { handoffs, evidenceAdoptions, failures, unresolvedQuestions: Array.from(new Set(unresolvedQuestions)) };
  }

  private boundConcurrent(requested: number | undefined, fallback: number): number {
    const candidate = typeof requested === 'number' && Number.isFinite(requested) ? Math.floor(requested) : fallback;
    return Math.min(SUBAGENT_RUNTIME_LIMITS.maxConcurrentSubagents, Math.max(1, candidate));
  }

  /** Validate the one-parent dependency graph before any child starts. */
  private validateTasks(tasks: SubagentTask[]): void {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Subagent delegation requires at least one task.');
    }
    if (tasks.length > SUBAGENT_RUNTIME_LIMITS.maxTasks) {
      throw new Error(`Subagent delegation requested ${tasks.length} tasks; the runtime maximum is ${SUBAGENT_RUNTIME_LIMITS.maxTasks}.`);
    }

    const byId = new Map<string, SubagentTask>();
    for (const task of tasks) {
      if (!task || typeof task.id !== 'string' || task.id.trim() === '') {
        throw new Error('Every Subagent task must have a non-empty id.');
      }
      if (byId.has(task.id)) {
        throw new Error(`Duplicate Subagent task id '${task.id}'.`);
      }
      byId.set(task.id, task);
    }

    for (const task of tasks) {
      if (!task.parentTaskId) continue;
      if (task.parentTaskId === task.id) {
        throw new Error(`Subagent task '${task.id}' cannot depend on itself.`);
      }
      if (!byId.has(task.parentTaskId)) {
        throw new Error(`Subagent task '${task.id}' depends on missing task '${task.parentTaskId}'.`);
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Subagent task dependency cycle detected at '${id}'.`);
      visiting.add(id);
      const dependency = byId.get(id)?.parentTaskId;
      if (dependency) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const task of tasks) visit(task.id);
  }
}
