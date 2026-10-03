import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Class-conditional (Mondrian) split-conformal three-way decision for
 * hypothesis evaluation.
 *
 * Ground truth for a hypothesis is binary -- it is either supported or
 * refuted by the evidence -- so the conformal layer predicts a *set* of
 * those two labels instead of a point label:
 *
 *   Gamma(x) = { y in {supported, refuted} : s_y(x) <= q_y }
 *
 * with nonconformity s_y(x) = 1 - p_y(x) and q_y the ceil((n_y+1)(1-alpha))-th
 * smallest calibration score among examples whose true label is y. Under
 * exchangeability of calibration and test points this gives class-conditional
 * coverage P(y in Gamma(X) | Y = y) >= 1 - alpha for both labels (Vovk et al.,
 * 2005; the Mondrian variant of split conformal).
 *
 * The third status is not a third class; it is what the set size says:
 *   |Gamma| = 1 -> that label, |Gamma| = 2 -> inconclusive (the evidence is
 *   compatible with both), |Gamma| = 0 -> inconclusive and atypical (the
 *   point looks unlike any calibration example of either class).
 *
 * Without a calibration set nothing is guaranteed, and the classifier says
 * so: decisions come from the prior scorer with conservative cut-offs and
 * carry `calibrated: false`. No coverage number is ever reported for them.
 */

export type BinaryLabel = 'supported' | 'refuted';
export type ThreeWayStatus = 'supported' | 'refuted' | 'inconclusive';

export const HYPOTHESIS_FEATURES = ['sequence', 'bioactivity', 'clinical', 'literature', 'contradiction'] as const;
export type HypothesisFeatureName = (typeof HYPOTHESIS_FEATURES)[number];

/** Feature vector in HYPOTHESIS_FEATURES order, every entry in [0, 1]. */
export type FeatureVector = number[];

export interface LabeledExample {
  features: FeatureVector;
  label: BinaryLabel;
  /** Optional free-text id, kept for audit of the calibration set. */
  id?: string;
}

export interface LogisticParams {
  weights: number[];
  bias: number;
}

/**
 * The scorer the conformal layer wraps. Any probabilistic model works; this
 * one is a logistic regression so the weights stay inspectable.
 */
export class LogisticScorer {
  public params: LogisticParams;

  /**
   * Prior weights used before any data has been fitted. They encode the
   * direction of each feature (more potency, more anchors -> more support;
   * contradiction -> less) and nothing more; they are not estimated from
   * data and must not be reported as if they were.
   */
  public static readonly PRIOR: LogisticParams = {
    weights: [1.0, 3.0, 2.0, 1.0, -5.0],
    bias: -2.5,
  };

  constructor(params: LogisticParams = LogisticScorer.PRIOR) {
    this.params = { weights: [...params.weights], bias: params.bias };
  }

  public probabilitySupported(x: FeatureVector): number {
    const z = this.params.bias + this.params.weights.reduce((acc, w, i) => acc + w * (x[i] ?? 0), 0);
    return 1 / (1 + Math.exp(-z));
  }

  public probability(x: FeatureVector, label: BinaryLabel): number {
    const p = this.probabilitySupported(x);
    return label === 'supported' ? p : 1 - p;
  }

  /**
   * Full-batch gradient descent on L2-regularised log loss. Deterministic:
   * starts from the prior and takes a fixed number of steps.
   */
  public fit(examples: LabeledExample[], options: { epochs?: number; learningRate?: number; l2?: number } = {}): void {
    if (examples.length === 0) return;
    const epochs = options.epochs ?? 2000;
    const lr = options.learningRate ?? 0.1;
    const l2 = options.l2 ?? 0.01;
    const d = this.params.weights.length;
    const w = [...this.params.weights];
    let b = this.params.bias;
    const n = examples.length;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const gw = new Array(d).fill(0);
      let gb = 0;
      for (const ex of examples) {
        const z = b + w.reduce((acc, wi, i) => acc + wi * (ex.features[i] ?? 0), 0);
        const p = 1 / (1 + Math.exp(-z));
        const err = p - (ex.label === 'supported' ? 1 : 0);
        for (let i = 0; i < d; i++) gw[i] += err * (ex.features[i] ?? 0);
        gb += err;
      }
      for (let i = 0; i < d; i++) w[i] -= lr * (gw[i] / n + l2 * w[i]);
      b -= lr * (gb / n);
    }
    this.params = { weights: w, bias: b };
  }
}

export interface ConformalCalibration {
  version: 1;
  alpha: number;
  scorer: LogisticParams;
  /** Per-class score threshold; null means the class has too few examples and is always included. */
  thresholds: Record<BinaryLabel, number | null>;
  counts: Record<BinaryLabel, number>;
  /** sha256 of the calibration examples, so a reported result can be tied to its data. */
  datasetHash: string;
  createdAt: string;
}

export interface ThreeWayDecision {
  status: ThreeWayStatus;
  /** p(supported | x) from the scorer. */
  pSupported: number;
  calibrated: boolean;
  method: 'mondrian-conformal' | 'uncalibrated-prior';
  alpha?: number;
  predictionSet?: BinaryLabel[];
  /** True when the prediction set is empty: the point is atypical for both classes. */
  atypical?: boolean;
  rationale: string;
}

export interface UncalibratedRule {
  /** p(supported) at or above which (with enough evidence) the prior calls a hypothesis supported. */
  supportThreshold: number;
  /** p(supported) at or below which (with any evidence) the prior calls it refuted. */
  refuteThreshold: number;
  minEvidenceForSupport: number;
  minEvidenceForRefute: number;
}

const DEFAULT_UNCALIBRATED: UncalibratedRule = {
  supportThreshold: 0.8,
  refuteThreshold: 0.2,
  minEvidenceForSupport: 2,
  minEvidenceForRefute: 1,
};

const LABELS: BinaryLabel[] = ['supported', 'refuted'];

/** Order statistic used by split conformal; null when n is too small for the requested alpha. */
export function conformalQuantile(scores: number[], alpha: number): number | null {
  const n = scores.length;
  if (n === 0) return null;
  const rank = Math.ceil((n + 1) * (1 - alpha));
  if (rank > n) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  return sorted[rank - 1];
}

export function hashExamples(examples: LabeledExample[]): string {
  const canonical = examples.map((e) => `${e.label}:${e.features.map((f) => f.toFixed(6)).join(',')}`).join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class ConformalThreeWayClassifier {
  private scorer: LogisticScorer;
  private calibration?: ConformalCalibration;
  private uncalibratedRule: UncalibratedRule;

  constructor(options: { scorer?: LogisticScorer; calibration?: ConformalCalibration; uncalibratedRule?: Partial<UncalibratedRule> } = {}) {
    this.calibration = options.calibration;
    this.scorer = options.scorer ?? new LogisticScorer(options.calibration?.scorer ?? LogisticScorer.PRIOR);
    this.uncalibratedRule = { ...DEFAULT_UNCALIBRATED, ...(options.uncalibratedRule ?? {}) };
  }

  public isCalibrated(): boolean {
    return Boolean(this.calibration);
  }

  public getCalibration(): ConformalCalibration | undefined {
    return this.calibration;
  }

  public getScorer(): LogisticScorer {
    return this.scorer;
  }

  /**
   * Split conformal: `train` fits the scorer, `calibration` sets the
   * thresholds. The two sets must be disjoint for the guarantee to hold; an
   * empty `train` keeps the current scorer (the prior, by default).
   */
  public calibrate(train: LabeledExample[], calibration: LabeledExample[], alpha = 0.1): ConformalCalibration {
    if (!(alpha > 0 && alpha < 1)) throw new Error(`alpha must be in (0, 1), got ${alpha}`);
    if (train.length > 0) this.scorer.fit(train);

    const thresholds = {} as Record<BinaryLabel, number | null>;
    const counts = {} as Record<BinaryLabel, number>;
    for (const label of LABELS) {
      const scores = calibration.filter((e) => e.label === label).map((e) => 1 - this.scorer.probability(e.features, label));
      counts[label] = scores.length;
      thresholds[label] = conformalQuantile(scores, alpha);
    }

    this.calibration = {
      version: 1,
      alpha,
      scorer: { weights: [...this.scorer.params.weights], bias: this.scorer.params.bias },
      thresholds,
      counts,
      datasetHash: hashExamples([...train, ...calibration]),
      createdAt: new Date().toISOString(),
    };
    return this.calibration;
  }

  public predictSet(x: FeatureVector): BinaryLabel[] {
    if (!this.calibration) throw new Error('predictSet requires a calibrated classifier');
    return LABELS.filter((label) => {
      const q = this.calibration!.thresholds[label];
      // Too few calibration examples of this class to bound its score: keep
      // it in the set, which is the conservative (coverage-preserving) choice.
      if (q === null) return true;
      return 1 - this.scorer.probability(x, label) <= q;
    });
  }

  public decide(x: FeatureVector, evidenceCount: number): ThreeWayDecision {
    const pSupported = this.scorer.probabilitySupported(x);

    if (this.calibration) {
      const set = this.predictSet(x);
      const alpha = this.calibration.alpha;
      if (set.length === 1) {
        return {
          status: set[0],
          pSupported,
          calibrated: true,
          method: 'mondrian-conformal',
          alpha,
          predictionSet: set,
          rationale: `Conformal prediction set {${set[0]}} at alpha=${alpha}: only "${set[0]}" is consistent with the calibration data.`,
        };
      }
      return {
        status: 'inconclusive',
        pSupported,
        calibrated: true,
        method: 'mondrian-conformal',
        alpha,
        predictionSet: set,
        atypical: set.length === 0,
        rationale:
          set.length === 0
            ? `Conformal prediction set is empty at alpha=${alpha}: this evidence profile is atypical for both outcomes.`
            : `Conformal prediction set {supported, refuted} at alpha=${alpha}: the evidence does not separate the two outcomes.`,
      };
    }

    const rule = this.uncalibratedRule;
    let status: ThreeWayStatus = 'inconclusive';
    if (pSupported >= rule.supportThreshold && evidenceCount >= rule.minEvidenceForSupport) status = 'supported';
    else if (pSupported <= rule.refuteThreshold && evidenceCount >= rule.minEvidenceForRefute) status = 'refuted';
    return {
      status,
      pSupported,
      calibrated: false,
      method: 'uncalibrated-prior',
      rationale: `Uncalibrated prior scorer (no coverage guarantee): p(supported)=${pSupported.toFixed(2)} with ${evidenceCount} evidence anchor(s).`,
    };
  }

  /** Empirical per-class coverage and set-size distribution on held-out data. */
  public evaluate(test: LabeledExample[]): {
    coverage: Record<BinaryLabel, number | null>;
    singletonRate: number;
    emptyRate: number;
    fullRate: number;
    n: number;
  } {
    if (!this.calibration) throw new Error('evaluate requires a calibrated classifier');
    const hits: Record<BinaryLabel, [number, number]> = { supported: [0, 0], refuted: [0, 0] };
    let singleton = 0;
    let empty = 0;
    let full = 0;
    for (const ex of test) {
      const set = this.predictSet(ex.features);
      hits[ex.label][1]++;
      if (set.includes(ex.label)) hits[ex.label][0]++;
      if (set.length === 1) singleton++;
      else if (set.length === 0) empty++;
      else full++;
    }
    const n = test.length || 1;
    return {
      coverage: {
        supported: hits.supported[1] ? hits.supported[0] / hits.supported[1] : null,
        refuted: hits.refuted[1] ? hits.refuted[0] / hits.refuted[1] : null,
      },
      singletonRate: singleton / n,
      emptyRate: empty / n,
      fullRate: full / n,
      n: test.length,
    };
  }
}

export function defaultCalibrationPath(): string {
  const base = process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
  return path.join(base, 'calibration', 'hypothesis-conformal.json');
}

export function saveCalibration(calibration: ConformalCalibration, file = defaultCalibrationPath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(calibration, null, 2), 'utf8');
}

/** Loads a stored calibration, or undefined if there is none or it is unreadable. */
export function loadCalibration(file = defaultCalibrationPath()): ConformalCalibration | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ConformalCalibration;
    if (parsed?.version !== 1 || !parsed.scorer || !parsed.thresholds) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** A classifier that uses the stored calibration when one exists, and says so when it does not. */
export function loadDefaultClassifier(): ConformalThreeWayClassifier {
  return new ConformalThreeWayClassifier({ calibration: loadCalibration() });
}

export interface CalibrationFileReport {
  calibration: ConformalCalibration;
  train: number;
  calibrationSize: number;
  /** Coverage measured on the calibration split itself is not reported: it is not held out. */
  note: string;
}

/**
 * Builds and stores a calibration from a labelled file: either a JSON array
 * or JSON lines, each item `{ "features": [5 numbers], "label": "supported" |
 * "refuted" }`. Items are shuffled with a fixed seed and split in half --
 * one half fits the scorer, the other sets the conformal thresholds -- so
 * the same file always gives the same calibration.
 */
export function calibrateFromFile(file: string, alpha = 0.1, seed = 1): CalibrationFileReport {
  const text = fs.readFileSync(file, 'utf8').trim();
  const items: any[] = text.startsWith('[') ? JSON.parse(text) : text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const examples: LabeledExample[] = items.map((it, i) => {
    const label = it?.label;
    const features = it?.features;
    if ((label !== 'supported' && label !== 'refuted') || !Array.isArray(features) || features.length !== HYPOTHESIS_FEATURES.length) {
      throw new Error(`Item ${i + 1} must have label "supported"|"refuted" and ${HYPOTHESIS_FEATURES.length} features (${HYPOTHESIS_FEATURES.join(', ')}).`);
    }
    return { features: features.map(Number), label, id: it.id };
  });
  if (examples.length < 20) throw new Error(`Need at least 20 labelled examples to calibrate, got ${examples.length}.`);

  // Seeded Fisher-Yates, so the split is reproducible.
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...examples];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const half = Math.floor(shuffled.length / 2);
  const train = shuffled.slice(0, half);
  const cal = shuffled.slice(half);
  const clf = new ConformalThreeWayClassifier({ scorer: new LogisticScorer() });
  const calibration = clf.calibrate(train, cal, alpha);
  saveCalibration(calibration);
  return {
    calibration,
    train: train.length,
    calibrationSize: cal.length,
    note: 'Report coverage on a separate held-out set, not on these examples.',
  };
}
