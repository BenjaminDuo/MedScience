import { ModelProvider } from '../client/ModelProvider.js';
import { EvidenceTracker } from '../research-loop/EvidenceTracker.js';
import { EvidenceVerifier, globalEvidenceVerifier } from '../research-loop/EvidenceVerifier.js';
import { ToolRegistry, globalToolRegistry } from '../tools/ToolRegistry.js';
import { ToolCategory } from '../types/runtime.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { HookRegistry, globalHookRegistry } from '../hooks/HookRegistry.js';
import { SkillRegistry, globalSkillRegistry } from '../skills/SkillRegistry.js';
import { ScopedAgentRunner, globalScopedAgentRunner, ScopedToolSpec, ScopedAgentRunResult } from '../agents/runtime/ScopedAgentRunner.js';
import { SubagentContextBuilder, globalSubagentContextBuilder } from './SubagentContextBuilder.js';
import { SubagentOutputValidator, globalSubagentOutputValidator, ValidatedSubagentSubmission } from './SubagentOutputValidator.js';
import { SubagentContext, SubagentHandoff, SubagentTask } from './types.js';

export interface SubagentRunnerOptions {
  modelProvider: ModelProvider;
  model?: string;
  toolRegistry?: ToolRegistry;
  skillRegistry?: SkillRegistry;
  eventBus?: EventBus;
  hookRegistry?: HookRegistry;
  evidenceVerifier?: EvidenceVerifier;
  scopedRunner?: ScopedAgentRunner;
  contextBuilder?: SubagentContextBuilder;
  outputValidator?: SubagentOutputValidator;
  defaultMaxTurns?: number;
}

export interface SubagentRunResult {
  status: 'completed' | 'inconclusive' | 'failed' | 'timeout' | 'cancelled';
  handoff?: SubagentHandoff;
  evidenceTracker: EvidenceTracker;
  runtime: ScopedAgentRunResult<ValidatedSubagentSubmission>;
  error?: string;
}

function buildSubmitTool(availableEvidenceIds: string[]): ScopedToolSpec {
  const evidenceHint = availableEvidenceIds.length > 0 ? `Available evidence ids from this branch: ${availableEvidenceIds.join(', ')}` : 'No branch evidence has been recorded yet.';
  return {
    name: 'subagent_submit_handoff',
    description: `Submit a structured scientific handoff and finish the task. ${evidenceHint} Non-hypothesis findings must cite ids returned by your own tool calls. Tool/network failures must be execution_error findings.`,
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        methods: { type: 'array', items: { type: 'string' } },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['observation', 'inference', 'hypothesis', 'negative_result', 'execution_error'] },
              statement: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['kind', 'statement', 'evidenceIds'],
          },
        },
        limitations: { type: 'array', items: { type: 'string' } },
        unresolvedQuestions: { type: 'array', items: { type: 'string' } },
        recommendedNextActions: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['summary', 'methods', 'findings', 'limitations', 'unresolvedQuestions', 'recommendedNextActions', 'confidence'],
    },
  };
}

export class SubagentRunner {
  private readonly options: Required<Pick<SubagentRunnerOptions, 'toolRegistry' | 'skillRegistry' | 'eventBus' | 'evidenceVerifier' | 'scopedRunner' | 'contextBuilder' | 'outputValidator'>> & SubagentRunnerOptions;

  constructor(options: SubagentRunnerOptions) {
    this.options = {
      ...options,
      toolRegistry: options.toolRegistry || globalToolRegistry,
      skillRegistry: options.skillRegistry || globalSkillRegistry,
      eventBus: options.eventBus || globalEventBus,
      hookRegistry: options.hookRegistry || globalHookRegistry,
      evidenceVerifier: options.evidenceVerifier || globalEvidenceVerifier,
      scopedRunner: options.scopedRunner || globalScopedAgentRunner,
      contextBuilder: options.contextBuilder || globalSubagentContextBuilder,
      outputValidator: options.outputValidator || globalSubagentOutputValidator,
    };
  }

  public async run(
    task: SubagentTask,
    context: SubagentContext,
    parentAllowedToolCategories?: ReadonlySet<ToolCategory>,
    parentAllowedToolNames?: ReadonlySet<string>,
    abortSignal?: AbortSignal
  ): Promise<SubagentRunResult> {
    const agentId = `subagent:${task.id}`;
    const branchTracker = new EvidenceTracker(this.options.evidenceVerifier, task.id);
    const discoveredSkills = this.options.skillRegistry.discover(`${task.type} ${task.objective}`, 3);
    const skillPrompt = this.options.skillRegistry.formatPromptForInquiry(`${task.type} ${task.objective}`);
    const taskContext = { ...context, skillIds: discoveredSkills.map((skill) => skill.id) };
    const systemPrompt = [
      'You are a short-lived MedScience internal SubAgent.',
      'You have an isolated context and evidence scope. You are not a Research Team member and must return one structured handoff to the parent agent.',
      'Choose tools dynamically based on the objective; do not follow a fixed domain pipeline.',
      'Never claim that an unavailable tool or failed request is a scientific negative result.',
      skillPrompt,
    ].filter(Boolean).join('\n\n');
    const taskPrompt = this.options.contextBuilder.format(taskContext, task);

    const registeredTools = typeof (this.options.toolRegistry as unknown as { list?: () => unknown[] }).list === 'function' ? this.options.toolRegistry.list() : [];
    const effectiveCategories = new Set<ToolCategory>(
      (task.allowedToolCategories || Array.from(parentAllowedToolCategories || new Set(registeredTools.map((tool) => tool.category))))
        .filter((category) => !parentAllowedToolCategories || parentAllowedToolCategories.has(category))
    );
    const domainTools = registeredTools.filter((tool) => {
      if (!effectiveCategories.has(tool.category)) return false;
      if (task.allowedToolNames && !task.allowedToolNames.includes(tool.name)) return false;
      if (parentAllowedToolNames && !parentAllowedToolNames.has(tool.name)) return false;
      return true;
    });
    const allowedNames = new Set(domainTools.map((tool) => tool.name));

    this.options.eventBus.emit({
      type: 'subagent.started',
      sessionId: task.parentSessionId,
      timestamp: new Date().toISOString(),
      payload: { agentId, taskId: task.id, objective: task.objective, parentSessionId: task.parentSessionId },
    });

    const runtime = await this.options.scopedRunner.run<ValidatedSubagentSubmission>({
      modelProvider: this.options.modelProvider,
      model: this.options.model,
      systemPrompt,
      taskPrompt,
      tools: domainTools,
      toolRegistry: this.options.toolRegistry,
      evidenceTracker: branchTracker,
      sessionId: `${task.parentSessionId}:${task.id}`,
      agentId,
      maxTurns: task.maxTurns || this.options.defaultMaxTurns || 8,
      submitTool: buildSubmitTool(branchTracker.list().map((record) => record.id)),
      allowedToolNames: allowedNames,
      allowedToolCategories: effectiveCategories,
      abortSignal,
      eventBus: this.options.eventBus,
      hookRegistry: this.options.hookRegistry,
      runtimeKind: 'subagent',
    });

    if (runtime.status === 'cancelled') {
      this.options.eventBus.emit({ type: 'subagent.cancelled', sessionId: task.parentSessionId, timestamp: new Date().toISOString(), payload: { agentId, taskId: task.id } });
      return { status: 'cancelled', evidenceTracker: branchTracker, runtime, error: runtime.error };
    }
    if (runtime.status === 'max_turns') {
      const error = runtime.error || `SubAgent exhausted its ${runtime.turns}-turn budget.`;
      this.options.eventBus.emit({ type: 'subagent.failed', sessionId: task.parentSessionId, timestamp: new Date().toISOString(), payload: { agentId, taskId: task.id, error } });
      return { status: 'timeout', evidenceTracker: branchTracker, runtime, error };
    }
    if (runtime.status !== 'completed' || !runtime.submission) {
      const error = runtime.error || 'SubAgent did not return a structured handoff.';
      this.options.eventBus.emit({ type: 'subagent.failed', sessionId: task.parentSessionId, timestamp: new Date().toISOString(), payload: { agentId, taskId: task.id, error } });
      return { status: 'failed', evidenceTracker: branchTracker, runtime, error };
    }

    const validation = this.options.outputValidator.validate(runtime.submission, task, new Set(branchTracker.list().map((record) => record.id)));
    if (!validation.valid) {
      const error = `Invalid SubAgent handoff: ${validation.errors.join('; ')}`;
      this.options.eventBus.emit({ type: 'subagent.failed', sessionId: task.parentSessionId, timestamp: new Date().toISOString(), payload: { agentId, taskId: task.id, error } });
      return { status: 'failed', evidenceTracker: branchTracker, runtime, error };
    }

    const submission = validation.value;
    const findings = submission.findings.map((finding, index) => ({
      id: `finding-${task.id}-${index + 1}`,
      kind: finding.kind,
      statement: finding.statement,
      evidenceIds: finding.evidenceIds,
      confidence: finding.confidence,
    }));
    const handoff: SubagentHandoff = {
      id: `handoff-${task.id}`,
      teamRunId: task.parentSessionId,
      taskId: task.id,
      agentRunId: `subagent-run-${task.id}`,
      agentId,
      summary: submission.summary,
      methods: submission.methods,
      findings,
      evidenceIds: Array.from(new Set(findings.flatMap((finding) => finding.evidenceIds))),
      artifactIds: [],
      limitations: submission.limitations,
      unresolvedQuestions: submission.unresolvedQuestions,
      recommendedNextActions: submission.recommendedNextActions,
      confidence: submission.confidence,
      createdAt: new Date().toISOString(),
      origin: 'subagent',
      parentSessionId: task.parentSessionId,
      taskType: task.type,
    };
    this.options.eventBus.emit({
      type: 'subagent.completed',
      sessionId: task.parentSessionId,
      timestamp: new Date().toISOString(),
      payload: { agentId, taskId: task.id, status: 'completed', evidenceIds: handoff.evidenceIds },
    });
    return { status: 'completed', handoff, evidenceTracker: branchTracker, runtime };
  }
}
