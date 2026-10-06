import { ModelProvider } from '../client/ModelProvider.js';
import { EvidenceTracker } from '../research-loop/EvidenceTracker.js';
import { EvidenceVerifier, globalEvidenceVerifier } from '../research-loop/EvidenceVerifier.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { SkillRegistry, globalSkillRegistry } from '../skills/SkillRegistry.js';
import { ToolCategory } from '../types/runtime.js';
import { ToolRegistry, globalToolRegistry } from '../tools/ToolRegistry.js';
import { HookRegistry, globalHookRegistry } from '../hooks/HookRegistry.js';
import { SubagentRunner } from './SubagentRunner.js';
import { EvidenceAdoption, SubagentContext, SubagentFailure, SubagentHandoff, SubagentOrchestrationResult, SubagentTask } from './types.js';

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
    this.defaultMaxConcurrent = Math.max(1, options.maxConcurrentSubagents || 3);
  }

  public setModelProvider(provider: ModelProvider): void {
    this.modelProvider = provider;
  }

  public setModel(model: string | undefined): void {
    this.model = model;
  }

  public async run(params: SubagentOrchestrationParams): Promise<SubagentOrchestrationResult> {
    const pending = new Map(params.tasks.map((task) => [task.id, task]));
    const handoffs: SubagentHandoff[] = [];
    const failures: SubagentFailure[] = [];
    const evidenceAdoptions: EvidenceAdoption[] = [];
    const unresolvedQuestions: string[] = [];
    const maxConcurrent = Math.max(1, params.maxConcurrentSubagents || this.defaultMaxConcurrent);

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
}
