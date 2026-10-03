import { EvidenceRecord, EvidenceTracker } from '../research-loop/EvidenceTracker.js';
import { EvidenceLedger, LedgerEntry, SourceIdentifiers, getGlobalEvidenceLedger } from './EvidenceLedger.js';
import { AdmissionGate, GateResult } from './AdmissionGate.js';
import { getGlobalRetractionIndex } from './RetractionIndex.js';
import { EventBus } from '../core/EventBus.js';

/**
 * Connects the per-session EvidenceTracker (EV-1, EV-2, ... valid only
 * inside one run) to the durable ledger. Every tracked record becomes a
 * candidate and goes through the admission gate; nothing reaches the ledger
 * in the verified state by any other route.
 */

const NCT = /\bNCT\d{8}\b/g;
const DOI = /\b10\.\d{4,9}\/[^\s"'<>]+/g;

function collect(target: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.trim()) target.add(value.trim());
  else if (typeof value === 'number' && Number.isFinite(value)) target.add(String(value));
}

/** Pulls PMIDs, DOIs, NCT ids and accessions out of a record's citations and raw output. */
export function identifiersFromRecord(record: Pick<EvidenceRecord, 'citations' | 'rawOutput'>): SourceIdentifiers {
  const pmid = new Set<string>();
  const doi = new Set<string>();
  const nct = new Set<string>();
  const accession = new Set<string>();

  for (const c of record.citations ?? []) {
    collect(pmid, (c as any).pmid);
    collect(doi, (c as any).doi);
  }

  const raw = record.rawOutput;
  if (raw && typeof raw === 'object') {
    const visit = (node: any, depth: number) => {
      if (!node || typeof node !== 'object' || depth > 4) return;
      for (const [k, v] of Object.entries(node)) {
        const key = k.toLowerCase();
        if (key === 'pmid' || key === 'pubmedid') collect(pmid, v);
        else if (key === 'doi') collect(doi, v);
        else if (key === 'nctid') collect(nct, v);
        else if (key === 'primaryaccession' || key === 'chemblid' || key === 'pdbid' || key === 'cid') collect(accession, v);
        else if (typeof v === 'object') visit(v, depth + 1);
      }
    };
    visit(raw, 0);
  }
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  for (const m of text.match(NCT) ?? []) nct.add(m);
  for (const m of text.match(DOI) ?? []) doi.add(m.replace(/[.,;)\]]+$/, ''));

  const out: SourceIdentifiers = {};
  if (pmid.size) out.pmid = [...pmid];
  if (doi.size) out.doi = [...doi].map((d) => d.toLowerCase());
  if (nct.size) out.nct = [...nct];
  if (accession.size) out.accession = [...accession];
  return out;
}

export interface IngestOutcome {
  sessionEvidenceId: string;
  ledgerId: string;
  created: boolean;
  state: LedgerEntry['state'];
  gate?: GateResult;
}

export interface IngestContext {
  ledger?: EvidenceLedger;
  gate?: AdmissionGate;
  sessionId?: string;
  workspaceId?: string;
  actor?: string;
}

function defaultGate(): AdmissionGate {
  return new AdmissionGate({ retractions: getGlobalRetractionIndex() });
}

/**
 * Records every tracked evidence item as a ledger candidate and admits it.
 * Re-ingesting the same tracker is idempotent: existing entries are left
 * where they are. Returns a map from session ids (EV-n) to ledger ids.
 */
export function ingestEvidenceTracker(tracker: EvidenceTracker, ctx: IngestContext = {}): { outcomes: IngestOutcome[]; idMap: Map<string, string> } {
  const ledger = ctx.ledger ?? getGlobalEvidenceLedger();
  const gate = ctx.gate ?? defaultGate();
  const outcomes: IngestOutcome[] = [];
  const idMap = new Map<string, string>();
  for (const rec of tracker.list()) {
    const { entry, created } = ledger.recordEvidence(
      {
        toolName: rec.toolName,
        category: rec.category,
        query: rec.query,
        summary: rec.summary,
        identifiers: identifiersFromRecord(rec),
        retrievedAt: rec.timestamp,
        workspaceId: ctx.workspaceId,
        sessionId: ctx.sessionId,
        sessionEvidenceId: rec.id,
      },
      ctx.actor ?? 'ingest'
    );
    idMap.set(rec.id, entry.id);
    if (entry.state !== 'candidate') {
      outcomes.push({ sessionEvidenceId: rec.id, ledgerId: entry.id, created, state: entry.state });
      continue;
    }
    const gateResult = gate.admit(ledger, entry.id, { rawOutput: rec.rawOutput, actor: 'admission-gate' });
    outcomes.push({ sessionEvidenceId: rec.id, ledgerId: entry.id, created, state: ledger.get(entry.id)!.state, gate: gateResult });
  }
  return { outcomes, idMap };
}

/**
 * Proposes a claim for each supported hypothesis and promotes it; the
 * ledger decides whether it ends up verified (all support verified) or
 * stays a candidate. Inconclusive and refuted branches produce no claim --
 * absence of support is not written down as a positive statement.
 */
export function recordSupportedHypotheses(
  results: { hypothesisId: string; status: string; findings: string; evidenceIds: string[]; targetEntity: string }[],
  statements: Map<string, string>,
  idMap: Map<string, string>,
  ctx: { ledger?: EvidenceLedger; workspaceId?: string; actor?: string } = {}
): { hypothesisId: string; claimId: string; state: LedgerEntry['state']; error?: string }[] {
  const ledger = ctx.ledger ?? getGlobalEvidenceLedger();
  const out: { hypothesisId: string; claimId: string; state: LedgerEntry['state']; error?: string }[] = [];
  for (const r of results) {
    if (r.status !== 'supported') continue;
    const supports = r.evidenceIds.map((id) => idMap.get(id)).filter((x): x is string => Boolean(x));
    if (!supports.length) continue;
    const { entry } = ledger.createClaim(
      { statement: statements.get(r.hypothesisId) ?? r.findings, supports, workspaceId: ctx.workspaceId },
      ctx.actor ?? 'hypothesis-tree'
    );
    const promoted = ledger.promoteClaim(entry.id, ctx.actor ?? 'hypothesis-tree');
    out.push({ hypothesisId: r.hypothesisId, claimId: entry.id, state: ledger.get(entry.id)!.state, error: promoted.ok ? undefined : promoted.error });
  }
  return out;
}

/**
 * What the engines call at the end of a run: ingest, optionally record
 * supported hypotheses as claims, and announce the result. Ledger problems
 * are reported as an event and never fail the research run that produced
 * the evidence.
 */
export function commitRunEvidence(
  tracker: EvidenceTracker,
  ctx: IngestContext & {
    eventBus?: EventBus;
    source: 'research-turn' | 'hypothesis-tree' | 'team-run';
    hypotheses?: { results: Parameters<typeof recordSupportedHypotheses>[0]; statements: Map<string, string> };
  }
): { outcomes: IngestOutcome[]; idMap: Map<string, string>; claims: ReturnType<typeof recordSupportedHypotheses> } | undefined {
  if (tracker.count() === 0) return undefined;
  const emit = (payload: { admitted: number; quarantined: number; claims?: number; error?: string }) =>
    ctx.eventBus?.emit({
      type: 'evidence.ledger.updated',
      sessionId: ctx.sessionId ?? 'ledger',
      timestamp: new Date().toISOString(),
      payload: { source: ctx.source, ...payload },
    });
  try {
    const { outcomes, idMap } = ingestEvidenceTracker(tracker, ctx);
    const claims = ctx.hypotheses
      ? recordSupportedHypotheses(ctx.hypotheses.results, ctx.hypotheses.statements, idMap, {
          ledger: ctx.ledger,
          workspaceId: ctx.workspaceId,
          actor: ctx.source,
        })
      : [];
    emit({
      admitted: outcomes.filter((o) => o.created && o.state === 'verified').length,
      quarantined: outcomes.filter((o) => o.created && o.state === 'quarantined').length,
      claims: claims.length,
    });
    return { outcomes, idMap, claims };
  } catch (err: any) {
    emit({ admitted: 0, quarantined: 0, error: err?.message || String(err) });
    return undefined;
  }
}
