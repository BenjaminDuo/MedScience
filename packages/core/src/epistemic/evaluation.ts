import { EvidenceLedger, LedgerState } from './EvidenceLedger.js';
import { RetractionIndex } from './RetractionIndex.js';
import { sweepRetractions } from './AdmissionGate.js';

/**
 * Statistics for equal-budget, paired comparisons of two system variants on
 * the same tasks, plus the retraction-replay measurement for the ledger.
 * Deterministic given a seed, so a reported number can be reproduced.
 */

/** mulberry32: small, fast, seeded PRNG (not for cryptography). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/**
 * Exact two-sided McNemar test on paired binary outcomes.
 * b = cases A got right and B got wrong; c = the reverse. Under H0 the
 * discordant pairs split Binomial(b + c, 1/2).
 */
export function mcnemarExact(b: number, c: number): { b: number; c: number; n: number; pValue: number } {
  const n = b + c;
  if (n === 0) return { b, c, n, pValue: 1 };
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2);
  return { b, c, n, pValue: Math.min(1, 2 * tail) };
}

/** McNemar from two aligned arrays of per-task correctness. */
export function mcnemarFromPairs(a: boolean[], bArr: boolean[]): ReturnType<typeof mcnemarExact> {
  if (a.length !== bArr.length) throw new Error('Paired outcomes must have the same length');
  let b = 0;
  let c = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && !bArr[i]) b++;
    else if (!a[i] && bArr[i]) c++;
  }
  return mcnemarExact(b, c);
}

/**
 * Paired bootstrap of the mean difference (a - b) on per-task scores:
 * percentile confidence interval and the share of resamples whose
 * difference has the opposite sign of the observed one (x2, two-sided).
 */
export function pairedBootstrap(
  a: number[],
  b: number[],
  options: { resamples?: number; confidence?: number; seed?: number } = {}
): { meanDiff: number; ciLow: number; ciHigh: number; pValue: number; resamples: number } {
  if (a.length !== b.length || a.length === 0) throw new Error('Paired scores must be non-empty and of equal length');
  const B = options.resamples ?? 10_000;
  const conf = options.confidence ?? 0.95;
  const rand = seededRandom(options.seed ?? 1);
  const diffs = a.map((x, i) => x - b[i]);
  const n = diffs.length;
  const observed = diffs.reduce((s, d) => s + d, 0) / n;
  const stats: number[] = new Array(B);
  for (let r = 0; r < B; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += diffs[Math.floor(rand() * n)];
    stats[r] = s / n;
  }
  stats.sort((x, y) => x - y);
  const lo = stats[Math.floor(((1 - conf) / 2) * B)];
  const hi = stats[Math.min(B - 1, Math.ceil((1 - (1 - conf) / 2) * B) - 1)];
  const opposite = stats.filter((s) => (observed >= 0 ? s <= 0 : s >= 0)).length;
  return { meanDiff: observed, ciLow: lo, ciHigh: hi, pValue: Math.min(1, (2 * opposite) / B), resamples: B };
}

export interface RetractionReplayReport {
  asOf: string;
  /** Evidence entries whose source has a retraction or EoC on or before asOf. */
  affectedEvidence: number;
  /** Verified claims resting on affected evidence before the sweep: the exposure the ledger exists to remove. */
  exposedClaimsBefore: number;
  exposedClaimsAfter: number;
  /** I1 holds after the sweep (no verified claim rests on non-verified evidence). */
  invariantHolds: boolean;
  transitions: { id: string; from: LedgerState; to: LedgerState }[];
}

/**
 * Retraction replay: given a ledger built from past runs and a retraction
 * index, measure how many verified claims rest on evidence that was
 * retracted (or flagged) by `asOf`, apply the sweep, and measure again.
 * Run on a copy if the original must stay untouched -- the sweep writes.
 */
export function retractionReplay(ledger: EvidenceLedger, index: RetractionIndex, asOf: string): RetractionReplayReport {
  const affected = new Set(
    ledger
      .list({ kind: 'evidence' })
      .filter((e) => index.effectiveNotice(e.identifiers, asOf))
      .map((e) => e.id)
  );
  const exposed = () =>
    ledger.list({ kind: 'claim', state: 'verified' }).filter((c) => (c.supports ?? []).some((s) => affected.has(s))).length;
  const before = exposed();
  const changes = sweepRetractions(ledger, index, { asOf, actor: 'retraction-replay' });
  const after = exposed();
  return {
    asOf,
    affectedEvidence: affected.size,
    exposedClaimsBefore: before,
    exposedClaimsAfter: after,
    invariantHolds: !ledger.checkInvariants().some((v) => v.invariant === 'I1'),
    transitions: changes.flatMap((c) => [{ id: c.id, from: c.from, to: c.to }, ...c.cascaded]),
  };
}
