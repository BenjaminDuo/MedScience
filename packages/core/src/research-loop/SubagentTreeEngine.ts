import { ToolRegistry, globalToolRegistry } from '../tools/ToolRegistry.js';
import { EvidenceTracker } from './EvidenceTracker.js';
import { EvidenceVerifier, globalEvidenceVerifier } from './EvidenceVerifier.js';
import { HypothesisTree, HypothesisNode, HypothesisStatus } from './HypothesisTree.js';
import { SessionManager, globalSessionManager } from '../core/SessionManager.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { ConformalThreeWayClassifier, ThreeWayDecision, loadDefaultClassifier } from '../epistemic/ConformalClassifier.js';
import {
  HypothesisObservations,
  INACTIVE_POTENCY_NM,
  bestPotencyNm,
  featuresAsRecord,
  featuresFromObservations,
  parseMaxPhase,
} from '../epistemic/HypothesisFeatures.js';
import {
  ActionOutcomeModel,
  DEFAULT_HYPOTHESIS_TOOL_MODELS,
  PlanStep,
  runEvidenceLoop,
  uniformBelief,
} from '../epistemic/InformationGainPlanner.js';

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
  /** How the status was decided, including whether it is calibrated. */
  decision?: ThreeWayDecision;
  /** The tool calls in the order the information-gain planner chose them. */
  evidencePlan?: PlanStep[];
}

export interface SubagentTreeOptions {
  /** Decides supported / refuted / inconclusive from the evidence features. */
  classifier: ConformalThreeWayClassifier;
  /** Outcome models of the lookups, for ordering them by expected information gain. */
  toolModels: ActionOutcomeModel[];
  /** Maximum total cost of lookups per branch. */
  toolBudget: number;
  /** Stop a branch early once the belief entropy is at or below this (0 = never stop early). */
  stopEntropyBits: number;
}

export class SubagentTreeEngine {
  private toolRegistry: ToolRegistry;
  private sessionManager: SessionManager;
  private eventBus: EventBus;
  private evidenceVerifier: EvidenceVerifier;
  private options: SubagentTreeOptions;

  constructor(
    toolRegistry: ToolRegistry = globalToolRegistry,
    sessionManager: SessionManager = globalSessionManager,
    eventBus: EventBus = globalEventBus,
    evidenceVerifier: EvidenceVerifier = globalEvidenceVerifier,
    options: Partial<SubagentTreeOptions> = {}
  ) {
    this.toolRegistry = toolRegistry;
    this.sessionManager = sessionManager;
    this.eventBus = eventBus;
    this.evidenceVerifier = evidenceVerifier;
    this.options = {
      // Picks up a stored calibration when one exists; otherwise decisions
      // are marked uncalibrated and claim no coverage.
      classifier: options.classifier ?? loadDefaultClassifier(),
      toolModels: options.toolModels ?? DEFAULT_HYPOTHESIS_TOOL_MODELS,
      toolBudget: options.toolBudget ?? 3,
      stopEntropyBits: options.stopEntropyBits ?? 0,
    };
  }

  public getClassifier(): ConformalThreeWayClassifier {
    return this.options.classifier;
  }

  public setClassifier(classifier: ConformalThreeWayClassifier): void {
    this.options.classifier = classifier;
  }

  /**
   * Concurrently explore multiple hypothesis branches using dedicated child subagents.
   */
  public async exploreHypothesesParallel(
    parentSessionId: string,
    hypotheses: HypothesisNode[],
    parentEvidenceTracker: EvidenceTracker,
    maxConcurrency: number = 3,
    onBranchProgress?: (branchName: string, log: string) => void
  ): Promise<{
    hypothesisTree: HypothesisTree;
    branchResults: SubagentBranchResult[];
    comparisonMatrix: string;
  }> {
    const tree = new HypothesisTree(hypotheses);
    const branchResults: SubagentBranchResult[] = [];

    // Notify event bus of Subagent Tree Initialization
    this.eventBus.emit({
      type: 'agent.thinking',
      sessionId: parentSessionId,
      timestamp: new Date().toISOString(),
      payload: {
        thought: `[Subagent Tree Fork] Initializing ${hypotheses.length} parallel hypothesis branches: ${hypotheses.map((h) => h.targetEntity).join(', ')}...`,
        phase: 'Parallel Hypothesis Exploration',
      },
    });

    // Execute in batches up to maxConcurrency
    for (let i = 0; i < hypotheses.length; i += maxConcurrency) {
      const batch = hypotheses.slice(i, i + maxConcurrency);
      const batchPromises = batch.map((hyp) =>
        this.runSingleBranch(parentSessionId, hyp, parentEvidenceTracker, onBranchProgress)
      );

      const batchResults = await Promise.all(batchPromises);
      for (const res of batchResults) {
        branchResults.push(res);
        // Dynamically update tree node with computed confidence and status
        tree.updateStatus(
          res.hypothesisId,
          res.status,
          res.confidenceScore,
          res.findings,
          res.evidenceIds,
          res.metrics
        );
      }
    }

    const comparisonMatrix = tree.generateComparisonMatrix();

    return {
      hypothesisTree: tree,
      branchResults,
      comparisonMatrix,
    };
  }

  private async runSingleBranch(
    parentSessionId: string,
    hypothesis: HypothesisNode,
    parentEvidenceTracker: EvidenceTracker,
    onProgress?: (branchName: string, log: string) => void
  ): Promise<SubagentBranchResult> {
    const branchName = `Branch-${hypothesis.id} (${hypothesis.targetEntity})`;
    const subSessionId = `${parentSessionId}-${hypothesis.id}`;
    const branchLogs: string[] = [];
    const localEvidenceIds: string[] = [];
    const metrics: Record<string, string | number> = {};
    const toolExecutionErrors: string[] = [];

    // Everything the score is computed from is collected here, from tool
    // results only. The target's name and the hypothesis wording never feed
    // the score -- see epistemic/HypothesisFeatures.ts.
    const obs: HypothesisObservations = {
      sequenceResolved: false,
      bestPotencyNm: null,
      bioactivityCount: 0,
      maxPhase: null,
      trialFound: false,
      evidenceCount: 0,
    };

    const log = (line: string) => {
      branchLogs.push(line);
      onProgress?.(branchName, line);
    };

    log(`Starting parallel investigation for: "${hypothesis.statement}"`);

    const record = (toolName: string, category: string, query: string, summary: string, output: any) => {
      try {
        const ev = parentEvidenceTracker.record(toolName, category, query, summary, output);
        localEvidenceIds.push(ev.id);
        obs.evidenceCount = localEvidenceIds.length;
      } catch (err: any) {
        // The verification gate rejected the output: it is not evidence, and
        // not a tool failure either.
        log(`Evidence from ${toolName} rejected by the verification gate: ${err.message || String(err)}`);
      }
    };

    // Each action runs one lookup, records what it found, and reports the
    // outcome class the planner's likelihood table is written in. null means
    // the call failed and carries no information.
    const actions: Record<string, () => Promise<string | null>> = {
      uniprot_lookup: async () => {
        const res = await this.toolRegistry.execute('uniprot_lookup', { accessionOrGene: hypothesis.targetEntity }, subSessionId, 'research', 0);
        if (!res.success || !res.output) {
          if (res.error) toolExecutionErrors.push(`UniProt: ${res.error}`);
          return null;
        }
        const seqLen = Number(res.output.sequenceLength) || 0;
        metrics['SequenceLength'] = `${seqLen} aa`;
        metrics['UniProtID'] = res.output.primaryAccession || 'N/A';
        obs.sequenceResolved = seqLen > 0;
        record(
          'uniprot_lookup',
          'databases',
          `[${hypothesis.targetEntity}] UniProt query`,
          `[Branch: ${hypothesis.targetEntity}] Resolved ${res.output.geneName || hypothesis.targetEntity} (${res.output.primaryAccession}), Length: ${seqLen} aa`,
          res.output
        );
        return obs.sequenceResolved ? 'resolved' : 'unresolved';
      },
      chembl_lookup: async () => {
        const res = await this.toolRegistry.execute('chembl_lookup', { targetOrCompound: hypothesis.targetEntity }, subSessionId, 'research', 0);
        if (!res.success || !res.output) {
          if (res.error) toolExecutionErrors.push(`ChEMBL: ${res.error}`);
          return null;
        }
        const activities: any[] = res.output.activities || [];
        obs.bioactivityCount = activities.length;
        obs.bestPotencyNm = bestPotencyNm(activities);
        const phase = parseMaxPhase(res.output.molecule?.maxPhase);
        if (phase !== null) obs.maxPhase = Math.max(obs.maxPhase ?? 0, phase);
        metrics['BioactivitiesCount'] = activities.length;
        if (obs.bestPotencyNm !== null) metrics['BestPotency'] = `${Number(obs.bestPotencyNm.toPrecision(3))} nM`;
        if (phase !== null) metrics['MaxPhase'] = `Phase ${phase}`;
        record(
          'chembl_lookup',
          'databases',
          `[${hypothesis.targetEntity}] ChEMBL bioactivities`,
          `[Branch: ${hypothesis.targetEntity}] Found ${activities.length} bioactivity records and ${res.output.target?.name || res.output.molecule?.prefName || 'target profile'}`,
          res.output
        );
        if (obs.bestPotencyNm === null) return 'none';
        if (obs.bestPotencyNm <= 1000) return 'potent';
        if (obs.bestPotencyNm <= INACTIVE_POTENCY_NM) return 'weak';
        return 'inactive';
      },
      clinical_trials_lookup: async () => {
        const res = await this.toolRegistry.execute('clinical_trials_lookup', { interventionOrDrug: hypothesis.targetEntity, limit: 1 }, subSessionId, 'research', 0);
        if (!res.success) {
          if (res.error) toolExecutionErrors.push(`ClinicalTrials: ${res.error}`);
          return null;
        }
        const topTrial = res.output?.trials?.[0];
        if (!topTrial) return 'none';
        obs.trialFound = true;
        metrics['ActiveClinicalTrial'] = topTrial.nctId;
        record(
          'clinical_trials_lookup',
          'medical',
          `[${hypothesis.targetEntity}] Clinical trials`,
          `[Branch: ${hypothesis.targetEntity}] Identified active trial [${topTrial.nctId}] ${topTrial.title}`,
          topTrial
        );
        return 'trial';
      },
    };

    // Only plan over tools this registry actually has.
    const models = this.options.toolModels.filter((m) => actions[m.actionId] && this.toolRegistry.get(m.actionId));
    const loop = await runEvidenceLoop({
      belief: uniformBelief(['supported', 'refuted']),
      models,
      budget: this.options.toolBudget,
      stopEntropyBits: this.options.stopEntropyBits,
      execute: async (actionId) => {
        try {
          return await actions[actionId]();
        } catch (err: any) {
          toolExecutionErrors.push(`${actionId} failed: ${err.message || String(err)}`);
          return null;
        }
      },
    });
    metrics['EvidencePlan'] = loop.steps.map((s) => `${s.actionId}=${s.outcome ?? 'failed'}`).join(' > ') || 'none';
    log(`Evidence plan (${loop.stopReason}): ${metrics['EvidencePlan']}`);

    const features = featuresFromObservations(obs);
    const decision = this.options.classifier.decide(features, localEvidenceIds.length);
    const confidenceScore = Number(decision.pSupported.toFixed(2));
    metrics['DecisionMethod'] = decision.calibrated ? `conformal (alpha=${decision.alpha})` : 'uncalibrated prior';
    if (decision.predictionSet) metrics['PredictionSet'] = `{${decision.predictionSet.join(', ')}}`;
    for (const [name, value] of Object.entries(featuresAsRecord(features))) metrics[`f_${name}`] = value;

    let status: HypothesisStatus;
    let findingsSummary: string;
    if (toolExecutionErrors.length > 0 && localEvidenceIds.length === 0) {
      // Tool or network failure: never read as refutation.
      status = 'error';
      findingsSummary = `Subagent query execution failed for "${hypothesis.title}" due to tool/network errors (${toolExecutionErrors.join('; ')}). Hypothesis remains UNVERIFIED due to communication/tool failure, NOT empirically refuted.`;
    } else {
      status = decision.status;
      findingsSummary = `Subagent completed empirical evaluation for "${hypothesis.title}" with status "${status}" (p(supported)=${(confidenceScore * 100).toFixed(0)}%, ${localEvidenceIds.length} evidence anchor(s)). ${decision.rationale}`;
    }

    log(findingsSummary);

    return {
      hypothesisId: hypothesis.id,
      targetEntity: hypothesis.targetEntity,
      success: status === 'supported',
      status,
      confidenceScore,
      findings: findingsSummary,
      metrics,
      evidenceIds: localEvidenceIds,
      logs: branchLogs,
      decision,
      evidencePlan: loop.steps,
    };
  }
}

export const globalSubagentTreeEngine = new SubagentTreeEngine();
