import { EvidenceVerifier, globalEvidenceVerifier } from '../research-loop/EvidenceVerifier.js';
import { containsLikelyRawClinicalData } from '../privacy/ClinicalDataGate.js';
import { EvidenceLedger, LedgerEntry, LedgerState, TransitionResult } from './EvidenceLedger.js';
import { RetractionIndex } from './RetractionIndex.js';

/**
 * Decides whether a candidate evidence entry may become verified.
 *
 * Statistical significance is not one of the checks, on purpose: a p-value
 * says nothing about whether the source is identifiable, current, allowed
 * to be stored, or still standing. Every check either blocks (the entry is
 * quarantined, with the reason recorded) or warns (it is admitted, and the
 * warning is kept in the ledger's reason for the transition).
 */

export interface GateCheck {
  name: 'provenance' | 'source-version' | 'verifier' | 'temporal' | 'privacy' | 'retraction';
  passed: boolean;
  severity: 'block' | 'warn';
  message: string;
}

export interface GateResult {
  decision: 'admit' | 'quarantine';
  checks: GateCheck[];
}

export interface AdmissionGateOptions {
  verifier?: EvidenceVerifier;
  retractions?: RetractionIndex;
  /** Quarantine evidence without a source version instead of only warning. */
  requireSourceVersion?: boolean;
  /** Evidence retrieved longer ago than this is admitted with a staleness warning. */
  maxAgeDays?: number;
  now?: () => Date;
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Tools whose input can be the user's own clinical material (notes, EHR exports, images, local analyses). */
const PATIENT_DATA_TOOL = /clinical_nlp|ehr|dicom|patient|medical_imag|python_runner|data_analysis/i;

export class AdmissionGate {
  private verifier: EvidenceVerifier;
  private retractions?: RetractionIndex;
  private requireSourceVersion: boolean;
  private maxAgeDays: number;
  private now: () => Date;

  constructor(options: AdmissionGateOptions = {}) {
    this.verifier = options.verifier ?? globalEvidenceVerifier;
    this.retractions = options.retractions;
    this.requireSourceVersion = options.requireSourceVersion ?? false;
    this.maxAgeDays = options.maxAgeDays ?? 365;
    this.now = options.now ?? (() => new Date());
  }

  public evaluate(entry: LedgerEntry, context: { rawOutput?: unknown } = {}): GateResult {
    const checks: GateCheck[] = [];
    const now = this.now();

    const hasProvenance = Boolean(entry.toolName && entry.query && entry.retrievedAt);
    checks.push({
      name: 'provenance',
      passed: hasProvenance,
      severity: 'block',
      message: hasProvenance ? `From ${entry.toolName} (query "${entry.query}")` : 'Missing tool, query or retrieval time.',
    });

    checks.push({
      name: 'source-version',
      passed: Boolean(entry.sourceVersion),
      severity: this.requireSourceVersion ? 'block' : 'warn',
      message: entry.sourceVersion ? `Source version ${entry.sourceVersion}` : 'Source did not report a version; the result cannot be pinned to a release.',
    });

    if (context.rawOutput !== undefined) {
      const v = this.verifier.verify(entry.toolName ?? 'unknown', entry.category ?? 'unknown', entry.query ?? '', context.rawOutput);
      checks.push({
        name: 'verifier',
        passed: v.verdict !== 'REJECTED' && v.verdict !== 'FLAGGED_WITH_WARNING',
        severity: v.verdict === 'REJECTED' ? 'block' : 'warn',
        message: v.reasonSummary,
      });
    }

    const retrieved = entry.retrievedAt ? Date.parse(entry.retrievedAt) : NaN;
    const validUntil = entry.validUntil ? Date.parse(entry.validUntil) : NaN;
    if (Number.isFinite(retrieved) && retrieved > now.getTime() + FUTURE_TOLERANCE_MS) {
      checks.push({ name: 'temporal', passed: false, severity: 'block', message: `Retrieved in the future (${entry.retrievedAt}).` });
    } else if (Number.isFinite(validUntil) && validUntil < now.getTime()) {
      checks.push({ name: 'temporal', passed: false, severity: 'block', message: `Expired on ${entry.validUntil}.` });
    } else if (Number.isFinite(retrieved) && now.getTime() - retrieved > this.maxAgeDays * 86_400_000) {
      checks.push({ name: 'temporal', passed: false, severity: 'warn', message: `Retrieved more than ${this.maxAgeDays} days ago; re-query before relying on it.` });
    } else {
      checks.push({ name: 'temporal', passed: true, severity: 'block', message: 'Within its validity window.' });
    }

    // Content scanning applies to tools that take the user's own clinical
    // material. Public registries (trials, literature) describe patients in
    // the abstract all the time, and scanning them would quarantine every
    // trial record.
    const rawText = context.rawOutput === undefined ? '' : typeof context.rawOutput === 'string' ? context.rawOutput : JSON.stringify(context.rawOutput);
    const handlesPatientData = PATIENT_DATA_TOOL.test(entry.toolName ?? '');
    const phi = Boolean(entry.containsPHI) || (handlesPatientData && containsLikelyRawClinicalData(`${entry.summary}\n${rawText}`));
    checks.push({
      name: 'privacy',
      passed: !phi || Boolean(entry.phiAuthorized),
      severity: 'block',
      message: !phi ? 'No patient data detected.' : entry.phiAuthorized ? 'Patient data present, storage authorised.' : 'Likely patient data without authorisation to store it.',
    });

    if (this.retractions) {
      const notice = this.retractions.effectiveNotice(entry.identifiers, now.toISOString().slice(0, 10));
      checks.push({
        name: 'retraction',
        passed: !notice,
        severity: 'block',
        message: notice
          ? `${notice.nature === 'retraction' ? 'Retracted' : 'Expression of concern'}${notice.date ? ` on ${notice.date}` : ''}${notice.reason ? `: ${notice.reason}` : ''}`
          : 'No retraction notice for its identifiers.',
      });
    }

    const blocked = checks.some((c) => !c.passed && c.severity === 'block');
    return { decision: blocked ? 'quarantine' : 'admit', checks };
  }

  /** Evaluates a candidate and moves it to verified or quarantined, recording why. */
  public admit(ledger: EvidenceLedger, id: string, context: { rawOutput?: unknown; actor?: string } = {}): GateResult & { transition?: TransitionResult } {
    const entry = ledger.get(id);
    if (!entry || entry.kind !== 'evidence') throw new Error(`${id} is not evidence in this ledger`);
    const result = this.evaluate(entry, context);
    if (entry.state !== 'candidate') return result;
    const failed = result.checks.filter((c) => !c.passed);
    const reason =
      result.decision === 'admit'
        ? `admitted${failed.length ? ` with warnings: ${failed.map((c) => c.message).join('; ')}` : ''}`
        : `quarantined: ${failed.filter((c) => c.severity === 'block').map((c) => c.message).join('; ')}`;
    const to: LedgerState = result.decision === 'admit' ? 'verified' : 'quarantined';
    return { ...result, transition: ledger.transition(id, to, reason, context.actor ?? 'admission-gate') };
  }
}

export interface RetractionSweepChange {
  id: string;
  from: LedgerState;
  to: LedgerState;
  notice: string;
  cascaded: { id: string; from: LedgerState; to: LedgerState }[];
}

/**
 * Applies the retraction index to evidence already in the ledger:
 * a retraction revokes it, an expression of concern contests verified
 * evidence and quarantines candidates. Claims follow through the ledger's
 * cascade. Re-running the sweep is a no-op for entries already moved.
 */
export function sweepRetractions(ledger: EvidenceLedger, index: RetractionIndex, options: { asOf?: string; actor?: string } = {}): RetractionSweepChange[] {
  const changes: RetractionSweepChange[] = [];
  const actor = options.actor ?? 'retraction-sweep';
  for (const entry of ledger.list({ kind: 'evidence' })) {
    if (entry.state === 'revoked' || entry.state === 'superseded') continue;
    const notice = index.effectiveNotice(entry.identifiers, options.asOf);
    if (!notice) continue;
    const label = `${notice.nature}${notice.date ? ` (${notice.date})` : ''}${notice.reason ? `: ${notice.reason}` : ''}`;
    let to: LedgerState | undefined;
    if (notice.nature === 'retraction') to = 'revoked';
    else if (entry.state === 'verified') to = 'contested';
    else if (entry.state === 'candidate') to = 'quarantined';
    if (!to || to === entry.state) continue;
    const res = ledger.transition(entry.id, to, `source ${label}`, actor);
    if (res.ok) changes.push({ id: entry.id, from: entry.state, to, notice: label, cascaded: res.cascaded });
  }
  return changes;
}
