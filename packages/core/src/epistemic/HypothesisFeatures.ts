import { FeatureVector, HYPOTHESIS_FEATURES } from './ConformalClassifier.js';

/**
 * Raw observations a hypothesis branch collected, before any scoring. Every
 * field comes from a tool result; nothing here may depend on the name of the
 * target or the wording of the hypothesis -- that is what made the old
 * composite score leak its own test fixture.
 */
export interface HypothesisObservations {
  /** UniProt resolved the target to an accession with a non-empty sequence. */
  sequenceResolved: boolean;
  /** Best (lowest) measured IC50/Ki/Kd in nM among bioactivity records, if any. */
  bestPotencyNm: number | null;
  /** Number of bioactivity records returned. */
  bioactivityCount: number;
  /** Highest clinical phase reported (0-4), if any. */
  maxPhase: number | null;
  /** A registered clinical trial was found for the entity. */
  trialFound: boolean;
  /** Evidence records admitted for this branch. */
  evidenceCount: number;
}

/** Potency above this (10 uM) is conventionally treated as inactive. */
export const INACTIVE_POTENCY_NM = 10_000;

const POTENCY_TYPES = new Set(['IC50', 'KI', 'KD', 'EC50']);
const UNIT_TO_NM: Record<string, number> = { pm: 1e-3, nm: 1, um: 1e3, 'µm': 1e3, 'μm': 1e3, mm: 1e6, m: 1e9 };

/**
 * Reads one bioactivity record as a potency in nM, or null when it is not a
 * potency measurement or its value/unit cannot be read. Accepts the shape
 * chembl_lookup returns ({ type, relation, value: "0.2 nM", units }) as well
 * as a numeric `value`/`standardValue`.
 */
export function potencyNmFromActivity(activity: any): number | null {
  if (!activity || typeof activity !== 'object') return null;
  const type = String(activity.type ?? activity.standardType ?? '').toUpperCase();
  if (type && !POTENCY_TYPES.has(type)) return null;
  // ">" / ">=" means "weaker than this value": not a measured potency.
  const relation = String(activity.relation ?? activity.standardRelation ?? '=');
  if (relation.startsWith('>')) return null;

  const raw = activity.standardValue ?? activity.value;
  let value: number;
  let unit = String(activity.units ?? activity.standardUnits ?? '').trim();
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    const match = raw.trim().match(/^([0-9]*\.?[0-9]+(?:e[-+]?\d+)?)\s*([a-zA-Zµμ]+)?/i);
    if (!match) return null;
    value = Number(match[1]);
    if (match[2]) unit = match[2];
  } else {
    return null;
  }

  const factor = UNIT_TO_NM[(unit || 'nM').toLowerCase()];
  if (!factor || !Number.isFinite(value) || value <= 0) return null;
  return value * factor;
}

/** Best (lowest) potency in nM across a list of activities, or null if none is readable. */
export function bestPotencyNm(activities: any[] | undefined): number | null {
  let best: number | null = null;
  for (const act of activities ?? []) {
    const nm = potencyNmFromActivity(act);
    if (nm !== null && (best === null || nm < best)) best = nm;
  }
  return best;
}

/** "Phase 4", "4.0", 4 -> 4; anything unreadable -> null. */
export function parseMaxPhase(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Maps observations to the feature vector the conformal classifier scores,
 * in HYPOTHESIS_FEATURES order. Each mapping is monotone and documented so a
 * reader can check it without running anything:
 *
 * - sequence:      1 if the target resolved to a sequence, else 0.
 * - bioactivity:   (pX - 4) / 5 clipped to [0, 1], pX = 9 - log10(nM).
 *                  1 nM -> 1.0, 1 uM -> 0.4, 10 uM -> 0.2, >=100 uM -> 0.
 * - clinical:      maxPhase / 4; a registered trial with no phase -> 0.25.
 * - literature:    min(1, evidenceCount / 3).
 * - contradiction: 1 when potency was measured and even the best value is
 *                  inactive (> 10 uM); 0 otherwise. Absence of data is not
 *                  contradiction.
 */
export function featuresFromObservations(obs: HypothesisObservations): FeatureVector {
  const sequence = obs.sequenceResolved ? 1 : 0;

  let bioactivity = 0;
  if (obs.bestPotencyNm !== null && obs.bestPotencyNm > 0) {
    const pX = 9 - Math.log10(obs.bestPotencyNm);
    bioactivity = clamp01((pX - 4) / 5);
  }

  let clinical = 0;
  if (obs.maxPhase !== null && obs.maxPhase > 0) clinical = clamp01(obs.maxPhase / 4);
  else if (obs.trialFound) clinical = 0.25;

  const literature = clamp01(obs.evidenceCount / 3);
  const contradiction = obs.bestPotencyNm !== null && obs.bestPotencyNm > INACTIVE_POTENCY_NM ? 1 : 0;

  const vector = [sequence, bioactivity, clinical, literature, contradiction];
  if (vector.length !== HYPOTHESIS_FEATURES.length) {
    throw new Error('featuresFromObservations is out of step with HYPOTHESIS_FEATURES');
  }
  return vector;
}

export function featuresAsRecord(x: FeatureVector): Record<string, number> {
  const out: Record<string, number> = {};
  HYPOTHESIS_FEATURES.forEach((name, i) => {
    out[name] = Number((x[i] ?? 0).toFixed(3));
  });
  return out;
}
