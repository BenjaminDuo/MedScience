import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AdmissionGate,
  EvidenceLedger,
  EvidenceTracker,
  RetractionIndex,
  ingestEvidenceTracker,
  parseCsv,
  recordSupportedHypotheses,
  retractionReplay,
  sweepRetractions,
} from '../src/index.js';

/**
 * Evidence ledger: state machine, invariants, hash chain, admission gate,
 * retraction import and sweep. The identifiers in sections 1-7 are synthetic
 * (10.9999/... DOIs, 9xxxxxxx PMIDs) -- they exist to be matched against a
 * synthetic retraction file, not to refer to real papers. Section 8 replays a
 * real case with verified identifiers.
 */

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'medscience-ledger-'));
}

const T0 = new Date('2026-01-01T00:00:00Z');
const fixedNow = () => T0;

function evidence(ledger: EvidenceLedger, n: number, extra: Record<string, unknown> = {}) {
  return ledger.recordEvidence({
    toolName: 'pubmed_search',
    category: 'literature',
    query: `synthetic query ${n}`,
    summary: `Synthetic finding ${n}`,
    identifiers: { doi: [`10.9999/synthetic.${n}`], pmid: [`9000000${n}`] },
    retrievedAt: T0.toISOString(),
    ...extra,
  }).entry;
}

async function main() {
  console.log('=== Evidence Ledger Suite ===\n');

  console.log('[1] Transitions follow the state machine');
  {
    const ledger = new EvidenceLedger({ persist: false, now: fixedNow });
    const e = evidence(ledger, 1);
    assert(e.state === 'candidate', 'New evidence starts as candidate');
    assert(ledger.recordEvidence({ toolName: 'pubmed_search', category: 'literature', query: 'synthetic query 1', summary: 'Synthetic finding 1', identifiers: { doi: ['10.9999/synthetic.1'], pmid: ['90000001'] } }).created === false, 'Same content is deduplicated');
    assert(!ledger.transition(e.id, 'superseded', 'x').ok, 'candidate -> superseded must be refused');
    assert(ledger.transition(e.id, 'verified', 'ok').ok, 'candidate -> verified is legal');
    assert(ledger.transition(e.id, 'revoked', 'gone').ok, 'verified -> revoked is legal');
    assert(!ledger.transition(e.id, 'verified', 'back').ok, 'revoked is terminal');
    console.log('  ✔ legal transitions applied, illegal ones refused, revoked is terminal');
  }

  console.log('[2] I1: a claim is verified only on verified support, and falls when its support falls');
  {
    const ledger = new EvidenceLedger({ persist: false, now: fixedNow });
    const e1 = evidence(ledger, 1);
    const e2 = evidence(ledger, 2);
    const claim = ledger.createClaim({ statement: 'Synthetic claim', supports: [e1.id, e2.id] }).entry;
    assert(!ledger.promoteClaim(claim.id).ok, 'Promotion must fail while support is unverified');
    assert(!ledger.transition(claim.id, 'verified', 'force').ok, 'Direct verification must also be refused');
    ledger.transition(e1.id, 'verified', 'ok');
    ledger.transition(e2.id, 'verified', 'ok');
    assert(ledger.promoteClaim(claim.id).ok && ledger.get(claim.id)!.state === 'verified', 'Claim verifies once support is verified');
    const res = ledger.transition(e2.id, 'quarantined', 'source problem');
    assert(res.cascaded.length === 1 && res.cascaded[0].id === claim.id, 'Losing support must cascade to the claim');
    assert(ledger.get(claim.id)!.state === 'contested', 'Claim must become contested');
    assert(ledger.checkInvariants().length === 0, `Invariants must hold: ${JSON.stringify(ledger.checkInvariants())}`);
    console.log('  ✔ promotion checks support; losing support contests the claim; invariants hold');
  }

  console.log('[3] Refutation keeps disagreement; supersession retires the old claim');
  {
    const ledger = new EvidenceLedger({ persist: false, now: fixedNow });
    const [e1, e2, e3] = [1, 2, 3].map((n) => evidence(ledger, n));
    [e1, e2, e3].forEach((e) => ledger.transition(e.id, 'verified', 'ok'));
    const c1 = ledger.createClaim({ statement: 'Old synthetic claim', supports: [e1.id] }).entry;
    ledger.promoteClaim(c1.id);
    ledger.addRefutation(c1.id, e2.id);
    assert(ledger.get(c1.id)!.state === 'contested', 'Verified refutation contests a verified claim');
    const c2 = ledger.createClaim({ statement: 'Revised synthetic claim', supports: [e3.id], supersedes: c1.id }).entry;
    const promoted = ledger.promoteClaim(c2.id);
    assert(promoted.ok && ledger.get(c2.id)!.state === 'verified', 'Successor verifies');
    assert(ledger.get(c1.id)!.state === 'superseded' && ledger.get(c1.id)!.supersededBy === c2.id, 'Predecessor is superseded and linked');
    const c3 = ledger.createClaim({ statement: 'Claim with live counter-evidence', supports: [e1.id], refutes: [e2.id] }).entry;
    ledger.promoteClaim(c3.id);
    assert(ledger.get(c3.id)!.state === 'contested', 'A claim with verified refutation is promoted to contested, not verified');
    assert(ledger.checkInvariants().length === 0, 'Invariants hold (I3 included)');
    console.log('  ✔ contested on refutation, superseded with a link to the successor');
  }

  console.log('[4] Hash chain persists, replays, and detects tampering');
  {
    const dir = tmpDir();
    const ledger = new EvidenceLedger({ dir, now: fixedNow });
    const e = evidence(ledger, 1);
    ledger.transition(e.id, 'verified', 'ok');
    const reopened = new EvidenceLedger({ dir, now: fixedNow });
    assert(reopened.get(e.id)?.state === 'verified', 'State survives a reload');
    assert(reopened.verifyChain().ok, 'Chain verifies after reload');
    assert(reopened.history(e.id).length === 2, 'History has create + transition');

    const file = path.join(dir, 'events.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[1]);
    tampered.to = 'revoked';
    lines[1] = JSON.stringify(tampered);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const broken = new EvidenceLedger({ dir, now: fixedNow });
    assert(!broken.chainStatus().ok && broken.chainStatus().brokenAt === 2, `Tampering must be detected at event 2: ${JSON.stringify(broken.chainStatus())}`);
    assert(!broken.verifyChain().ok, 'verifyChain must not clear a load failure');
    assert(!broken.transition(e.id, 'contested', 'x').ok, 'A broken ledger is read-only');
    assert(broken.checkInvariants().some((v) => v.invariant === 'I4'), 'I4 is reported');
    console.log('  ✔ reload replays state; an edited event breaks the chain and freezes writes');
  }

  console.log('[5] Admission gate');
  {
    const ledger = new EvidenceLedger({ persist: false, now: fixedNow });
    const gate = new AdmissionGate({ now: fixedNow });
    const ok = evidence(ledger, 1);
    assert(gate.admit(ledger, ok.id).decision === 'admit' && ledger.get(ok.id)!.state === 'verified', 'Clean evidence is admitted');
    assert(/Source did not report a version/.test(ledger.get(ok.id)!.lastReason ?? ''), 'Missing source version is kept as a warning');

    const future = evidence(ledger, 2, { retrievedAt: '2027-01-01T00:00:00Z' });
    assert(gate.admit(ledger, future.id).decision === 'quarantine', 'Evidence from the future is quarantined');
    const expired = evidence(ledger, 3, { validUntil: '2025-06-01T00:00:00Z' });
    assert(gate.admit(ledger, expired.id).decision === 'quarantine', 'Expired evidence is quarantined');
    const phi = evidence(ledger, 4, { toolName: 'clinical_nlp_analyze', summary: 'Patient was admitted with chest pain; MRN: 12345' });
    assert(gate.admit(ledger, phi.id).decision === 'quarantine', 'Unauthorised patient data is quarantined');
    const trial = evidence(ledger, 5, { toolName: 'clinical_trials_lookup', summary: 'Trial enrolling patients diagnosed with a synthetic condition' });
    assert(gate.admit(ledger, trial.id).decision === 'admit', 'Public trial descriptions are not treated as patient data');
    const bad = evidence(ledger, 6, { toolName: 'data_analysis', category: 'execution' });
    assert(gate.admit(ledger, bad.id, { rawOutput: { pValue: 1.7 } }).decision === 'quarantine', 'Verifier-rejected output (p > 1) is quarantined');
    assert(gate.evaluate(ledger.get(ok.id)!).checks.every((c) => c.name !== 'retraction'), 'No retraction check without an index');
    console.log('  ✔ future, expired, PHI and verifier failures quarantine; public trial text does not');
  }

  console.log('[6] Retraction import, admission and sweep');
  {
    const dir = tmpDir();
    const csv = [
      'Record ID,Title,RetractionDate,RetractionNature,Reason,OriginalPaperDOI,OriginalPaperPubMedID',
      '1,"Synthetic, retracted",03/15/2025 0:00,Retraction,+Fabrication;,10.9999/synthetic.2,0',
      '2,Synthetic concern,04/01/2025 0:00,Expression of concern,+Data concerns;,,90000003',
      '3,Synthetic reinstated,01/01/2024 0:00,Retraction,+Error;,10.9999/synthetic.4,',
      '4,Synthetic reinstated,06/01/2024 0:00,Reinstatement,,10.9999/synthetic.4,',
      '5,Synthetic corrected,05/01/2025 0:00,Correction,,10.9999/synthetic.5,',
      '6,No identifiers,05/01/2025 0:00,Retraction,,,0',
    ].join('\r\n');
    assert(parseCsv('a,"b ""q"", c"\n1,2').length === 2 && parseCsv('a,"b ""q"", c"')[0][1] === 'b "q", c', 'CSV parser handles quotes');
    const index = new RetractionIndex({ file: path.join(dir, 'retractions.json') });
    const imported = index.importCsv(csv, 'synthetic.csv');
    assert(imported.imported === 5 && imported.skipped === 1, `Expected 5 imported / 1 skipped, got ${JSON.stringify(imported)}`);
    assert(new RetractionIndex({ file: path.join(dir, 'retractions.json') }).size() === 5, 'Index persists');
    assert(index.effectiveNotice({ doi: ['https://doi.org/10.9999/SYNTHETIC.2'] })?.nature === 'retraction', 'DOI matching is normalised');
    assert(!index.effectiveNotice({ doi: ['10.9999/synthetic.4'] }), 'A later reinstatement clears a retraction');
    assert(!index.effectiveNotice({ doi: ['10.9999/synthetic.5'] }), 'Corrections do not change standing');
    assert(!index.effectiveNotice({ doi: ['10.9999/synthetic.2'] }, '2025-01-01'), 'asOf before the notice ignores it');
    assert(index.effectiveNotice({ doi: ['10.9999/synthetic.2'] })?.reason === 'Fabrication', 'Retraction Watch "+Reason;" format is cleaned');

    const ledger = new EvidenceLedger({ persist: false, now: fixedNow });
    const gate = new AdmissionGate({ retractions: index, now: fixedNow });
    const evs = [1, 2, 3, 5].map((n) => evidence(ledger, n));
    // Admit without the index first, as if the evidence predates the import.
    const plainGate = new AdmissionGate({ now: fixedNow });
    evs.forEach((e) => plainGate.admit(ledger, e.id));
    const claimA = ledger.createClaim({ statement: 'Rests on retracted paper', supports: [evs[0].id, evs[1].id] }).entry;
    const claimB = ledger.createClaim({ statement: 'Rests on paper under concern', supports: [evs[2].id] }).entry;
    const claimC = ledger.createClaim({ statement: 'Rests on corrected paper', supports: [evs[3].id] }).entry;
    [claimA, claimB, claimC].forEach((c) => ledger.promoteClaim(c.id));

    const report = retractionReplay(ledger, index, '2026-01-01');
    assert(report.affectedEvidence === 2, `Two evidence entries are affected, got ${report.affectedEvidence}`);
    assert(report.exposedClaimsBefore === 2 && report.exposedClaimsAfter === 0, `Exposure should drop 2 -> 0, got ${report.exposedClaimsBefore} -> ${report.exposedClaimsAfter}`);
    assert(report.invariantHolds, 'I1 holds after the sweep');
    assert(ledger.get(evs[1].id)!.state === 'revoked', 'Retracted source is revoked');
    assert(ledger.get(evs[2].id)!.state === 'contested', 'Expression of concern contests');
    assert(ledger.get(claimA.id)!.state === 'contested' && ledger.get(claimB.id)!.state === 'contested', 'Dependent claims are contested');
    assert(ledger.get(claimC.id)!.state === 'verified', 'A correction leaves the claim standing');
    assert(sweepRetractions(ledger, index).length === 0, 'A second sweep is a no-op');

    const late = evidence(ledger, 2, { query: 'synthetic re-query 2' });
    assert(gate.admit(ledger, late.id).decision === 'quarantine', 'New evidence citing a retracted paper is quarantined at admission');
    console.log('  ✔ Retraction Watch-format import; replay drops exposed claims from 2 to 0');
  }

  console.log('[7] Session evidence is ingested through the gate, idempotently');
  {
    // The tracker stamps records with the real clock, so this section uses it too.
    const ledger = new EvidenceLedger({ persist: false });
    const gate = new AdmissionGate();
    const tracker = new EvidenceTracker();
    tracker.record('pubmed_search', 'literature', 'synthetic', 'Synthetic abstract', { pmid: '90000009' }, [
      { id: 'c1', title: 'Synthetic paper', pmid: '90000009', doi: '10.9999/synthetic.9' } as any,
    ]);
    tracker.record('clinical_trials_lookup', 'medical', 'synthetic', 'Synthetic trial', { nctId: 'NCT09999999' });
    const first = ingestEvidenceTracker(tracker, { ledger, gate, workspaceId: 'ws-test' });
    assert(first.outcomes.length === 2 && first.outcomes.every((o) => o.state === 'verified'), `Both records should verify: ${JSON.stringify(first.outcomes.map((o) => o.state))}`);
    const lit = ledger.get(first.idMap.get('EV-1')!)!;
    assert(lit.identifiers?.pmid?.includes('90000009') && lit.identifiers?.doi?.includes('10.9999/synthetic.9'), 'Identifiers are extracted from citations');
    assert(ledger.get(first.idMap.get('EV-2')!)!.identifiers?.nct?.includes('NCT09999999'), 'NCT ids are extracted from raw output');
    const second = ingestEvidenceTracker(tracker, { ledger, gate, workspaceId: 'ws-test' });
    assert(second.outcomes.every((o) => !o.created), 'Re-ingesting creates nothing new');
    const claims = recordSupportedHypotheses(
      [{ hypothesisId: 'h1', status: 'supported', findings: 'f', evidenceIds: ['EV-1', 'EV-2'], targetEntity: 'X' }, { hypothesisId: 'h2', status: 'refuted', findings: 'f', evidenceIds: ['EV-1'], targetEntity: 'Y' }],
      new Map([['h1', 'Synthetic supported hypothesis']]),
      first.idMap,
      { ledger, workspaceId: 'ws-test' }
    );
    assert(claims.length === 1 && claims[0].state === 'verified', 'Only the supported hypothesis becomes a verified claim');
    console.log('  ✔ ingest maps EV-n to ledger ids, extracts identifiers, and is idempotent');
  }

  console.log('[8] Case study: rofecoxib (Vioxx), 1999-2005');
  {
    // Real events, used as the worked example in docs/presentation. Unlike the
    // synthetic identifiers above, these were checked against PubMed/Crossref:
    //   VIGOR trial, N Engl J Med 2000;343:1520-8, PMID 11087881,
    //     DOI 10.1056/NEJM200011233432103 -- fewer upper-GI events than naproxen.
    //   Expression of concern on VIGOR, N Engl J Med, 2005-12-29.
    //   Market withdrawal by the manufacturer on 2004-09-30, after the APPROVe
    //     trial (PMID 15713943) showed raised cardiovascular risk.
    const ledger = new EvidenceLedger({ persist: false, now: fixedNow });
    const plainGate = new AdmissionGate({ now: fixedNow });
    const label = ledger.recordEvidence({
      toolName: 'openfda_lookup',
      category: 'medical',
      query: 'rofecoxib',
      summary: 'Rofecoxib (Vioxx) marketed in the US under an FDA-approved label since 1999',
      retrievedAt: T0.toISOString(),
    }).entry;
    const vigor = ledger.recordEvidence({
      toolName: 'pubmed_search',
      category: 'literature',
      query: 'rofecoxib naproxen gastrointestinal toxicity',
      summary: 'VIGOR: rofecoxib caused fewer upper-GI events than naproxen in rheumatoid arthritis',
      identifiers: { pmid: ['11087881'], doi: ['10.1056/NEJM200011233432103'] },
      retrievedAt: T0.toISOString(),
    }).entry;
    [label, vigor].forEach((e) => plainGate.admit(ledger, e.id));
    const longTerm = ledger.createClaim({ statement: 'Rofecoxib is a long-term analgesic option for arthritis', supports: [label.id, vigor.id] }).entry;
    const giSafety = ledger.createClaim({ statement: 'Rofecoxib causes fewer upper-GI events than naproxen', supports: [vigor.id] }).entry;
    [longTerm, giSafety].forEach((c) => ledger.promoteClaim(c.id));
    assert(ledger.list({ kind: 'claim', state: 'verified' }).length === 2, 'Both claims start verified');

    // 2004: a reviewer revokes the label evidence from the ledger page.
    const withdrawal = ledger.transition(label.id, 'revoked', 'Withdrawn from the market on 2004-09-30 after APPROVe (PMID 15713943) showed raised cardiovascular risk', 'reviewer');
    assert(withdrawal.cascaded.map((c) => c.id).join() === longTerm.id, 'Withdrawal contests only the claim resting on the label');
    assert(ledger.get(giSafety.id)!.state === 'verified', 'The GI-safety claim does not rest on the label and stands');

    // 2005: the expression of concern on VIGOR arrives through the retraction index.
    const index = new RetractionIndex({ file: path.join(tmpDir(), 'retractions.json') });
    index.importCsv(
      [
        'Record ID,Title,RetractionDate,RetractionNature,Reason,OriginalPaperDOI,OriginalPaperPubMedID',
        '1,VIGOR,12/29/2005 0:00,Expression of concern,+Concerns about data;,10.1056/NEJM200011233432103,11087881',
      ].join('\r\n'),
      'case-study.csv'
    );
    sweepRetractions(ledger, index);
    assert(ledger.get(vigor.id)!.state === 'contested', 'The expression of concern contests the VIGOR evidence');
    assert(ledger.get(giSafety.id)!.state === 'contested', 'and, through the cascade, the GI-safety claim');
    assert(ledger.list({ kind: 'claim', state: 'verified' }).length === 0, 'No verified claim is left resting on withdrawn or questioned evidence');
    assert(ledger.checkInvariants().length === 0, 'Invariants hold');
    assert(/APPROVe/.test(ledger.history(longTerm.id).at(-1)!.reason ?? ''), 'The claim history records why it was contested');
    console.log('  ✔ withdrawal contests 1 of 2 claims; the VIGOR concern contests the other; reasons are kept');
  }

  console.log('\n✔ ALL EVIDENCE LEDGER TESTS PASSED\n');
}

main().catch((err) => {
  console.error('\n✖ Evidence ledger test failed:', err);
  process.exit(1);
});
