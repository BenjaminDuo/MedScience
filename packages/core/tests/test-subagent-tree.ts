import {
  SubagentTreeEngine,
  HypothesisNode,
  EvidenceTracker,
  ConformalThreeWayClassifier,
} from '../src/index.js';

/**
 * The scoring path is tested against a deterministic tool registry, not the
 * live databases: what is under test is how evidence becomes a status, and
 * a ChEMBL response that changes from one minute to the next says nothing
 * about that. The targets are deliberately synthetic (TARGET-A/B/C) so no
 * test can pass because the engine recognises a name -- the old engine gave
 * TYK2 a perfect score by name, which is exactly what this guards against.
 * The numbers below are synthetic test inputs, not claims about any real
 * compound.
 */
type Profile = {
  sequenceLength: number;
  activities: { type: string; relation: string; value: string; units: string }[];
  maxPhase?: string;
  trial?: { nctId: string; title: string };
};

const PROFILES: Record<string, Profile> = {
  // Strong profile: nanomolar potency, late clinical phase, registered trial.
  'TARGET-A': {
    sequenceLength: 1000,
    activities: [{ type: 'IC50', relation: '=', value: '2 nM', units: 'nM' }],
    maxPhase: 'Phase 4',
    trial: { nctId: 'NCT00000000', title: 'Synthetic trial record for test' },
  },
  // Weak profile: only micromolar potency, no clinical data.
  'TARGET-B': {
    sequenceLength: 800,
    activities: [{ type: 'IC50', relation: '=', value: '3 uM', units: 'uM' }],
  },
  // Contradicting profile: measured, and even the best value is inactive.
  'TARGET-C': {
    sequenceLength: 900,
    activities: [
      { type: 'IC50', relation: '=', value: '50000 nM', units: 'nM' },
      { type: 'IC50', relation: '>', value: '100000 nM', units: 'nM' },
    ],
  },
};

const callLog: string[] = [];

const fakeRegistry: any = {
  get: (name: string) => ['uniprot_lookup', 'chembl_lookup', 'clinical_trials_lookup'].includes(name),
  execute: async (name: string, args: any) => {
    const entity = args.accessionOrGene || args.targetOrCompound || args.interventionOrDrug;
    callLog.push(`${entity}:${name}`);
    const p = PROFILES[entity];
    if (!p) return { success: false, error: `No entry found for "${entity}"` };
    if (name === 'uniprot_lookup') {
      return { success: true, output: { primaryAccession: `SYN-${entity}`, geneName: entity, sequenceLength: p.sequenceLength } };
    }
    if (name === 'chembl_lookup') {
      return {
        success: true,
        output: {
          molecule: p.maxPhase ? { prefName: entity, maxPhase: p.maxPhase } : null,
          target: { name: entity },
          activities: p.activities,
        },
      };
    }
    return { success: true, output: { trials: p.trial ? [p.trial] : [] } };
  },
};

function hyp(id: string, entity: string): HypothesisNode {
  return {
    id,
    title: `Hypothesis about ${entity}`,
    statement: `${entity} is a relevant target.`,
    targetEntity: entity,
    status: 'pending',
    confidenceScore: 0,
    evidenceIds: [],
  };
}

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

async function testSubagentTree() {
  console.log('=== Running Subagent Tree Evidence-Only Scoring Suite ===\n');

  // An explicit uncalibrated classifier, so a calibration file in the
  // developer's own profile can never change what this test sees.
  const engine = new SubagentTreeEngine(fakeRegistry, undefined, undefined, undefined, {
    classifier: new ConformalThreeWayClassifier(),
  });
  const tracker = new EvidenceTracker();

  console.log('[Phase 1: Uncalibrated decisions follow the evidence, not the name]');
  const { hypothesisTree, branchResults, comparisonMatrix } = await engine.exploreHypothesesParallel(
    `sub-test-${Date.now()}`,
    [hyp('hyp-a', 'TARGET-A'), hyp('hyp-b', 'TARGET-B'), hyp('hyp-c', 'TARGET-C')],
    tracker,
    3
  );
  console.log(comparisonMatrix);

  const a = hypothesisTree.getHypothesis('hyp-a')!;
  const b = hypothesisTree.getHypothesis('hyp-b')!;
  const c = hypothesisTree.getHypothesis('hyp-c')!;
  console.log(`  • A: ${a.status} p=${a.confidenceScore}  B: ${b.status} p=${b.confidenceScore}  C: ${c.status} p=${c.confidenceScore}`);

  assert(branchResults.length === 3, `Expected 3 branch results, got ${branchResults.length}`);
  assert(a.status === 'supported', `TARGET-A (strong evidence) should be supported, got ${a.status}`);
  assert(b.status === 'inconclusive', `TARGET-B (weak evidence) should be inconclusive, got ${b.status}`);
  assert(c.status === 'refuted', `TARGET-C (inactive potency) should be refuted, got ${c.status}`);
  assert(a.confidenceScore > b.confidenceScore && b.confidenceScore > c.confidenceScore, 'p(supported) should order A > B > C');
  for (const r of branchResults) {
    assert(r.decision && r.decision.calibrated === false, 'Without a calibration set every decision must say it is uncalibrated');
    assert(r.decision!.method === 'uncalibrated-prior', 'Uncalibrated decisions must name their method');
  }
  console.log('  ✔ Statuses follow the evidence profile and are marked uncalibrated.');

  console.log('\n[Phase 2: A renamed target scores identically]');
  // Same evidence under a different name must give the same score; this is
  // the regression test for the name-based scoring that was removed.
  PROFILES['TYK2'] = PROFILES['TARGET-B'];
  const renamed = await engine.exploreHypothesesParallel(`rename-${Date.now()}`, [hyp('hyp-r', 'TYK2')], new EvidenceTracker(), 1);
  const r = renamed.hypothesisTree.getHypothesis('hyp-r')!;
  assert(r.status === b.status && r.confidenceScore === b.confidenceScore, `Renaming TARGET-B to TYK2 changed the result: ${r.status}/${r.confidenceScore} vs ${b.status}/${b.confidenceScore}`);
  console.log('  ✔ The name of the target has no effect on the score.');

  console.log('\n[Phase 3: The planner orders lookups by expected information gain]');
  const planA = branchResults.find((x) => x.hypothesisId === 'hyp-a')!.evidencePlan!.map((s) => s.actionId);
  console.log(`  • Plan for A: ${planA.join(' > ')}`);
  assert(planA[0] === 'chembl_lookup', `The most informative lookup (ChEMBL) should run first, got ${planA[0]}`);
  assert(planA[planA.length - 1] === 'uniprot_lookup', 'The least informative lookup (UniProt) should run last');

  const budgeted = new SubagentTreeEngine(fakeRegistry, undefined, undefined, undefined, {
    classifier: new ConformalThreeWayClassifier(),
    toolBudget: 1,
  });
  callLog.length = 0;
  await budgeted.exploreHypothesesParallel(`budget-${Date.now()}`, [hyp('hyp-a', 'TARGET-A')], new EvidenceTracker(), 1);
  assert(callLog.length === 1 && callLog[0] === 'TARGET-A:chembl_lookup', `A budget of 1 should run only the best lookup, ran: ${callLog.join(', ')}`);
  console.log('  ✔ Order and budget are respected.');

  console.log('\n[Phase 4: A calibrated classifier decides by conformal prediction set]');
  const calibrated = new ConformalThreeWayClassifier();
  const examples = [];
  for (let i = 0; i < 40; i++) {
    examples.push({ features: [1, 0.9 - (i % 5) * 0.02, 0.8, 1, 0], label: 'supported' as const });
    // Refuted examples span the region an inactive-potency profile lands in.
    examples.push({ features: [1, (i % 6) * 0.03, 0, i % 2 ? 0.67 : 0.33, 1], label: 'refuted' as const });
  }
  calibrated.calibrate([], examples, 0.1);
  const calEngine = new SubagentTreeEngine(fakeRegistry, undefined, undefined, undefined, { classifier: calibrated });
  const calRes = await calEngine.exploreHypothesesParallel(
    `cal-${Date.now()}`,
    [hyp('hyp-a', 'TARGET-A'), hyp('hyp-b', 'TARGET-B'), hyp('hyp-c', 'TARGET-C')],
    new EvidenceTracker(),
    3
  );
  for (const res of calRes.branchResults) {
    assert(res.decision?.calibrated === true && res.decision.method === 'mondrian-conformal', 'Calibrated decisions must say so');
    assert(Array.isArray(res.decision.predictionSet), 'Calibrated decisions must carry their prediction set');
  }
  assert(calRes.hypothesisTree.getHypothesis('hyp-a')!.status === 'supported', 'TARGET-A should be supported under calibration');
  assert(calRes.hypothesisTree.getHypothesis('hyp-c')!.status === 'refuted', 'TARGET-C should be refuted under calibration');
  // TARGET-B looks like neither calibration class: an empty prediction set,
  // reported as inconclusive and atypical rather than forced into a label.
  const calB = calRes.branchResults.find((x) => x.hypothesisId === 'hyp-b')!;
  assert(calB.status === 'inconclusive' && calB.decision?.atypical === true, `TARGET-B should be inconclusive and atypical, got ${calB.status} (atypical=${calB.decision?.atypical})`);
  console.log('  ✔ Conformal decisions carry alpha and their prediction set.');

  console.log('\n[Phase 5: Network & Tool Outage Distinction Verification (BUG-06 Fix)]');
  const brokenToolRegistry: any = {
    get: () => true,
    execute: async () => ({
      success: false,
      error: 'FetchError: connect ETIMEDOUT 128.175.241.13:443 (Simulated Network Disconnection)',
    }),
  };
  const offlineEngine = new SubagentTreeEngine(brokenToolRegistry, undefined, undefined, undefined, {
    classifier: new ConformalThreeWayClassifier(),
  });
  const offlineRes = await offlineEngine.exploreHypothesesParallel(`offline-${Date.now()}`, [hyp('hyp-offline', 'TARGET-A')], new EvidenceTracker(), 1);
  const offlineNode = offlineRes.hypothesisTree.getHypothesis('hyp-offline');
  console.log(`  • Network Failure Node Status: "${offlineNode?.status}"`);
  assert(offlineNode?.status !== 'refuted', 'CRITICAL BUG-06 FAILURE: Network failure was falsely classified as "refuted"!');
  assert(offlineNode?.status === 'error', `Expected status "error" on network outage, got "${offlineNode?.status}"`);
  assert(offlineNode?.findingsSummary?.includes('communication/tool failure'), 'Findings must clarify communication failure.');
  console.log('  ✔ Network failure correctly marked as "error" with zero false-refutations.');

  console.log('\n✔ ALL SUBAGENT TREE EVIDENCE-ONLY SCORING TESTS PASSED\n');
}

testSubagentTree().catch((err) => {
  console.error('\n✖ Subagent tree test failed:', err);
  process.exit(1);
});
