/**
 * Disagreement-driven evidence acquisition.
 *
 * Instead of running a fixed number of debate rounds, the disagreement
 * between experts is represented as a belief over competing hypotheses, and
 * the next evidence request is the tool call with the largest expected
 * reduction of that belief's entropy per unit cost (Bayesian experimental
 * design, Lindley 1956; greedy myopic selection).
 *
 *   prior     p(h)       from expert stances (Dirichlet-smoothed, weighted)
 *   model     P(o|h,a)   outcome likelihood of action a under hypothesis h
 *   EIG(a)  = H(p) - sum_o P(o|a) H(p(.|o,a)),  P(o|a) = sum_h p(h) P(o|h,a)
 *   choose    argmax_a EIG(a) / cost(a)   within the remaining budget
 *
 * Outcomes of different actions are assumed conditionally independent given
 * the hypothesis. The default likelihood tables are priors chosen by hand
 * for the bundled tools; `estimateOutcomeModel` replaces them with counts
 * from labelled runs, and that is what a reported experiment should use.
 */

export interface Belief {
  hypotheses: string[];
  probs: number[];
}

export interface ExpertStance {
  agentId: string;
  /** Must be one of the belief's hypotheses. */
  stance: string;
  /** Self-reported or calibrated confidence in [0, 1]; weights the vote. */
  confidence?: number;
}

export interface ActionOutcomeModel {
  actionId: string;
  cost: number;
  outcomes: string[];
  /** likelihood[h][o] = P(outcome o | hypothesis h); each row sums to 1. */
  likelihood: Record<string, number[]>;
}

export interface PlannedAction {
  actionId: string;
  expectedGainBits: number;
  gainPerCost: number;
  cost: number;
}

export interface PlanStep {
  actionId: string;
  outcome: string | null;
  entropyBefore: number;
  entropyAfter: number;
  expectedGainBits: number;
  beliefAfter: number[];
}

export interface EvidenceLoopResult {
  belief: Belief;
  steps: PlanStep[];
  spent: number;
  stopReason: 'converged' | 'budget' | 'no-informative-action' | 'exhausted';
}

const EPS = 1e-12;

export function entropyBits(probs: number[]): number {
  return -probs.reduce((acc, p) => (p > EPS ? acc + p * Math.log2(p) : acc), 0);
}

function normalize(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= EPS) return values.map(() => 1 / values.length);
  return values.map((v) => v / sum);
}

export function uniformBelief(hypotheses: string[]): Belief {
  return { hypotheses: [...hypotheses], probs: hypotheses.map(() => 1 / hypotheses.length) };
}

/**
 * Belief from expert stances: p(h) proportional to pseudoCount + sum of the
 * confidences of the experts holding h. Stances naming an unknown
 * hypothesis are ignored rather than silently mapped.
 */
export function beliefFromStances(hypotheses: string[], stances: ExpertStance[], pseudoCount = 1): Belief {
  const mass = hypotheses.map(() => pseudoCount);
  for (const s of stances) {
    const idx = hypotheses.indexOf(s.stance);
    if (idx < 0) continue;
    mass[idx] += Math.max(0, Math.min(1, s.confidence ?? 1));
  }
  return { hypotheses: [...hypotheses], probs: normalize(mass) };
}

/** Normalised disagreement in [0, 1]: entropy divided by its maximum, log2(k). */
export function disagreement(belief: Belief): number {
  const k = belief.hypotheses.length;
  return k > 1 ? entropyBits(belief.probs) / Math.log2(k) : 0;
}

function validateModel(belief: Belief, model: ActionOutcomeModel): void {
  for (const h of belief.hypotheses) {
    const row = model.likelihood[h];
    if (!row || row.length !== model.outcomes.length) {
      throw new Error(`Outcome model for ${model.actionId} has no likelihood row for hypothesis "${h}"`);
    }
  }
}

export function outcomeDistribution(belief: Belief, model: ActionOutcomeModel): number[] {
  validateModel(belief, model);
  return model.outcomes.map((_, o) =>
    belief.hypotheses.reduce((acc, h, i) => acc + belief.probs[i] * model.likelihood[h][o], 0)
  );
}

export function posterior(belief: Belief, model: ActionOutcomeModel, outcome: string): Belief {
  validateModel(belief, model);
  const o = model.outcomes.indexOf(outcome);
  if (o < 0) throw new Error(`Unknown outcome "${outcome}" for ${model.actionId}`);
  const unnormalized = belief.hypotheses.map((h, i) => belief.probs[i] * model.likelihood[h][o]);
  return { hypotheses: [...belief.hypotheses], probs: normalize(unnormalized) };
}

export function expectedInformationGain(belief: Belief, model: ActionOutcomeModel): number {
  const prior = entropyBits(belief.probs);
  const po = outcomeDistribution(belief, model);
  let expectedPosterior = 0;
  model.outcomes.forEach((outcome, o) => {
    if (po[o] <= EPS) return;
    expectedPosterior += po[o] * entropyBits(posterior(belief, model, outcome).probs);
  });
  return Math.max(0, prior - expectedPosterior);
}

export function planNextAction(
  belief: Belief,
  models: ActionOutcomeModel[],
  remainingBudget: number,
  exclude: Set<string> = new Set(),
  minGainPerCost = 0
): PlannedAction | null {
  let best: PlannedAction | null = null;
  for (const model of models) {
    if (exclude.has(model.actionId) || model.cost > remainingBudget) continue;
    const gain = expectedInformationGain(belief, model);
    const gainPerCost = gain / Math.max(model.cost, EPS);
    if (gainPerCost < minGainPerCost) continue;
    // Ties keep the first model, so the order of `models` is a stable tiebreak.
    if (!best || gainPerCost > best.gainPerCost + 1e-12) {
      best = { actionId: model.actionId, expectedGainBits: gain, gainPerCost, cost: model.cost };
    }
  }
  return best;
}

/** True when the experts disagree enough that cross-domain review is warranted. */
export function shouldEscalate(belief: Belief, threshold = 0.8): boolean {
  return disagreement(belief) >= threshold;
}

/**
 * Greedy acquisition loop. `execute` runs the tool and maps its result to
 * one of the model's outcomes, or returns null when the tool failed -- a
 * failed call spends budget but carries no information, so the belief is
 * left unchanged (it is never read as evidence against a hypothesis).
 */
export async function runEvidenceLoop(options: {
  belief: Belief;
  models: ActionOutcomeModel[];
  budget: number;
  execute: (actionId: string) => Promise<string | null>;
  stopEntropyBits?: number;
  minGainPerCost?: number;
}): Promise<EvidenceLoopResult> {
  let belief = options.belief;
  const steps: PlanStep[] = [];
  const used = new Set<string>();
  let spent = 0;
  const stopEntropy = options.stopEntropyBits ?? 0;

  for (;;) {
    const h = entropyBits(belief.probs);
    if (stopEntropy > 0 && h <= stopEntropy) return { belief, steps, spent, stopReason: 'converged' };
    if (used.size === options.models.length) return { belief, steps, spent, stopReason: 'exhausted' };

    const next = planNextAction(belief, options.models, options.budget - spent, used, options.minGainPerCost ?? 0);
    if (!next) {
      const anyAffordable = options.models.some((m) => !used.has(m.actionId) && m.cost <= options.budget - spent);
      return { belief, steps, spent, stopReason: anyAffordable ? 'no-informative-action' : 'budget' };
    }

    used.add(next.actionId);
    spent += next.cost;
    const outcome = await options.execute(next.actionId);
    const model = options.models.find((m) => m.actionId === next.actionId)!;
    if (outcome !== null) belief = posterior(belief, model, outcome);
    steps.push({
      actionId: next.actionId,
      outcome,
      entropyBefore: h,
      entropyAfter: entropyBits(belief.probs),
      expectedGainBits: next.expectedGainBits,
      beliefAfter: [...belief.probs],
    });
  }
}

/**
 * Maximum-likelihood outcome table with Laplace smoothing, from labelled
 * runs (hypothesis known, outcome observed). This is how the hand-set
 * defaults below should be replaced before reporting results.
 */
export function estimateOutcomeModel(
  actionId: string,
  cost: number,
  hypotheses: string[],
  outcomes: string[],
  samples: { hypothesis: string; outcome: string }[],
  laplace = 1
): ActionOutcomeModel {
  const likelihood: Record<string, number[]> = {};
  for (const h of hypotheses) {
    const counts = outcomes.map(() => laplace);
    for (const s of samples) {
      if (s.hypothesis !== h) continue;
      const o = outcomes.indexOf(s.outcome);
      if (o >= 0) counts[o]++;
    }
    likelihood[h] = normalize(counts);
  }
  return { actionId, cost, outcomes: [...outcomes], likelihood };
}

/**
 * Hand-set priors for the three lookups the hypothesis tree runs. Rows are
 * P(outcome | supported) and P(outcome | refuted). They only say which
 * outcomes favour which hypothesis and roughly how strongly; they are not
 * measured, and the planner's docs say so.
 */
export const DEFAULT_HYPOTHESIS_TOOL_MODELS: ActionOutcomeModel[] = [
  {
    actionId: 'chembl_lookup',
    cost: 1,
    outcomes: ['potent', 'weak', 'inactive', 'none'],
    likelihood: {
      supported: [0.6, 0.15, 0.05, 0.2],
      refuted: [0.1, 0.15, 0.35, 0.4],
    },
  },
  {
    actionId: 'clinical_trials_lookup',
    cost: 1,
    outcomes: ['trial', 'none'],
    likelihood: {
      supported: [0.5, 0.5],
      refuted: [0.15, 0.85],
    },
  },
  {
    actionId: 'uniprot_lookup',
    cost: 1,
    outcomes: ['resolved', 'unresolved'],
    likelihood: {
      supported: [0.95, 0.05],
      refuted: [0.8, 0.2],
    },
  },
];
