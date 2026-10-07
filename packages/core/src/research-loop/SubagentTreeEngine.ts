import { ModelProvider } from '../client/ModelProvider.js';
import { fallbackMockProvider } from '../client/ScientificMockProvider.js';
import { ToolRegistry, globalToolRegistry } from '../tools/ToolRegistry.js';
import { EvidenceTracker } from './EvidenceTracker.js';
import { EvidenceVerifier, globalEvidenceVerifier } from './EvidenceVerifier.js';
import { HypothesisTree, HypothesisNode, HypothesisStatus } from './HypothesisTree.js';
import { SessionManager, globalSessionManager } from '../core/SessionManager.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { SubagentOrchestrator } from '../subagents/SubagentOrchestrator.js';
import { SUBAGENT_RUNTIME_LIMITS, SubagentTask } from '../subagents/types.js';
import { ToolCategory } from '../types/runtime.js';

export interface SubagentBranchResult {
  hypothesisId: string;
  targetEntity: string;
  success: boolean;
  status: HypothesisStatus;
  confidenceScore: number;
  findings: string;
  metrics: Record<string, string | number>;
  evidenceIds: string[];
  logs: string[];
}

/**
 * Compatibility facade for the old public runHypothesisTree API. Hypotheses
 * now describe tasks for real SubAgents; the tree only compares their
 * structured handoffs and no longer performs domain lookups itself.
 */
export class SubagentTreeEngine {
  private readonly toolRegistry: ToolRegistry;
  private readonly sessionManager: SessionManager;
  private readonly eventBus: EventBus;
  private readonly evidenceVerifier: EvidenceVerifier;
  private readonly orchestrator: SubagentOrchestrator;
  private modelProvider: ModelProvider;

  constructor(
    toolRegistry: ToolRegistry = globalToolRegistry,
    sessionManager: SessionManager = globalSessionManager,
    eventBus: EventBus = globalEventBus,
    evidenceVerifier: EvidenceVerifier = globalEvidenceVerifier,
    modelProvider: ModelProvider = fallbackMockProvider,
    orchestrator?: SubagentOrchestrator
  ) {
    this.toolRegistry = toolRegistry;
    this.sessionManager = sessionManager;
    this.eventBus = eventBus;
    this.evidenceVerifier = evidenceVerifier;
    this.modelProvider = modelProvider;
    this.orchestrator = orchestrator || new SubagentOrchestrator({ modelProvider, toolRegistry, eventBus, evidenceVerifier });
  }

  public setModelProvider(provider: ModelProvider): void {
    this.modelProvider = provider;
    this.orchestrator.setModelProvider(provider);
  }

  public getOrchestrator(): SubagentOrchestrator {
    return this.orchestrator;
  }

  public async exploreHypothesesParallel(
    parentSessionId: string,
    hypotheses: HypothesisNode[],
    parentEvidenceTracker: EvidenceTracker,
    maxConcurrency: number = 3,
    onBranchProgress?: (branchName: string, log: string) => void
  ): Promise<{ hypothesisTree: HypothesisTree; branchResults: SubagentBranchResult[]; comparisonMatrix: string }> {
    const tree = new HypothesisTree(hypotheses);
    const branchResults: SubagentBranchResult[] = [];
    const effectiveConcurrency = Math.min(
      SUBAGENT_RUNTIME_LIMITS.maxConcurrentSubagents,
      Math.max(1, Number.isFinite(maxConcurrency) ? Math.floor(maxConcurrency) : 1)
    );
    this.eventBus.emit({
      type: 'agent.thinking',
      sessionId: parentSessionId,
      timestamp: new Date().toISOString(),
      payload: {
        thought: `[Subagent Tree Strategy] Delegating ${hypotheses.length} hypothesis tasks: ${hypotheses.map((h) => h.title).join(', ')}.`,
        phase: 'Parallel Hypothesis Exploration',
      },
    });

    for (let i = 0; i < hypotheses.length; i += effectiveConcurrency) {
      const batch = hypotheses.slice(i, i + effectiveConcurrency);
      const results = await Promise.all(batch.map((hypothesis) => this.runSingleBranch(parentSessionId, hypothesis, parentEvidenceTracker, onBranchProgress)));
      for (const result of results) {
        branchResults.push(result);
        const node = tree.getHypothesis(result.hypothesisId);
        if (node) node.childSubagentSessionId = `${parentSessionId}:${result.hypothesisId}`;
        tree.updateStatus(result.hypothesisId, result.status, result.confidenceScore, result.findings, result.evidenceIds, result.metrics);
      }
    }

    return { hypothesisTree: tree, branchResults, comparisonMatrix: tree.generateComparisonMatrix() };
  }

  private async runSingleBranch(
    parentSessionId: string,
    hypothesis: HypothesisNode,
    parentEvidenceTracker: EvidenceTracker,
    onProgress?: (branchName: string, log: string) => void
  ): Promise<SubagentBranchResult> {
    const branchName = `Branch-${hypothesis.id} (${hypothesis.targetEntity})`;
    const task: SubagentTask = {
      id: hypothesis.id,
      parentSessionId,
      type: 'hypothesis',
      objective: `${hypothesis.title}: ${hypothesis.statement}`,
      context: hypothesis.targetEntity,
      acceptanceCriteria: [
        'Identify supporting evidence and contradictory evidence.',
        'State key uncertainties and falsification conditions.',
        'Return a structured handoff with evidence-backed findings.',
      ],
    };
    onProgress?.(branchName, `Starting isolated SubAgent for: "${hypothesis.statement}"`);

    const registeredTools = typeof (this.toolRegistry as unknown as { list?: () => unknown[] }).list === 'function' ? this.toolRegistry.list() : [];
    const parentAllowedToolCategories = new Set<ToolCategory>(registeredTools.map((tool) => (tool as { category: ToolCategory }).category));
    const parentAllowedToolNames = new Set(registeredTools.map((tool) => (tool as { name: string }).name));
    const result = await this.orchestrator.run({
      parentSessionId,
      tasks: [task],
      context: { originalInquiry: hypothesis.statement, objective: task.objective, parentSummary: hypothesis.findingsSummary },
      parentEvidenceTracker,
      parentAllowedToolCategories: parentAllowedToolCategories.size > 0 ? parentAllowedToolCategories : undefined,
      parentAllowedToolNames: parentAllowedToolNames.size > 0 ? parentAllowedToolNames : undefined,
      maxConcurrentSubagents: 1,
    });

    const handoff = result.handoffs[0];
    if (!handoff) {
      const error = result.failures[0]?.error || 'No structured SubAgent handoff was produced.';
      const findings = `Subagent execution failed for "${hypothesis.title}" due to communication/tool failure or bounded runtime failure: ${error}`;
      onProgress?.(branchName, findings);
      return {
        hypothesisId: hypothesis.id,
        targetEntity: hypothesis.targetEntity,
        success: false,
        status: result.failures[0]?.status === 'cancelled' ? 'error' : 'error',
        confidenceScore: 0,
        findings,
        metrics: { EvidenceCount: 0 },
        evidenceIds: [],
        logs: result.failures.map((failure) => failure.error),
      };
    }

    const evidenceIds = handoff.evidenceIds;
    const hasContradiction = handoff.findings.some((finding) => finding.kind === 'negative_result');
    const status: HypothesisStatus = hasContradiction && handoff.confidence >= 0.6
      ? 'refuted'
      : evidenceIds.length > 0 && handoff.confidence >= 0.7
      ? 'supported'
      : 'inconclusive';
    const confidenceScore = Number(Math.max(0, Math.min(1, handoff.confidence)).toFixed(2));
    const findings = `${handoff.summary} (SubAgent confidence: ${(confidenceScore * 100).toFixed(0)}%, ${evidenceIds.length} adopted evidence anchors).`;
    const metrics: Record<string, string | number> = {
      EvidenceCount: evidenceIds.length,
      ToolCalls: result.failures.length === 0 ? 'dynamic' : 'partial',
    };
    onProgress?.(branchName, findings);
    return {
      hypothesisId: hypothesis.id,
      targetEntity: hypothesis.targetEntity,
      success: status === 'supported',
      status,
      confidenceScore,
      findings,
      metrics,
      evidenceIds,
      logs: handoff.methods,
    };
  }
}

export const globalSubagentTreeEngine = new SubagentTreeEngine();
