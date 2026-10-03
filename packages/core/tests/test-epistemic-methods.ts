import {
  ConformalThreeWayClassifier,
  LabeledExample,
  LogisticScorer,
  beliefFromStances,
  conformalQuantile,
  disagreement,
  entropyBits,
  estimateOutcomeModel,
  expectedInformationGain,
  featuresFromObservations,
  mcnemarExact,
  mcnemarFromPairs,
  pairedBootstrap,
  posterior,
  potencyNmFromActivity,
  parseMaxPhase,
  runEvidenceLoop,
  seededRandom,
  shouldEscalate,
  uniformBelief,
  ActionOutcomeModel,
} from '../src/index.js';

/**
 * Properties of the three methods, checked on synthetic data with a fixed
 * seed. The conformal check is the empirical counterpart of the coverage
 * theorem: on exchangeable data, per-class coverage must be at least
 * 1 - alpha up to sampling error.
 */

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Two overlapping classes in the 5-feature space; overlap makes some points genuinely ambiguous. */
function synthetic(n: number, rand: () => number): LabeledExample[] {
  const clip = (v: number) => Math.max(0, Math.min(1, v));
  const out: LabeledExample[] = [];
  for (let i = 0; i < n; i++) {
    const supported = rand() < 0.5;
    const m = supported ? 0.65 : 0.35;
    out.push({
      label: supported ? 'supported' : 'refuted',
      features: [
        rand() < 0.9 ? 1 : 0,
        clip(m + 0.2 * gaussian(rand)),
        clip(m + 0.25 * gaussian(rand)),
        clip(m + 0.2 * gaussian(rand)),
        rand() < (supported ? 0.05 : 0.3) ? 1 : 0,
      ],
    });
  }
  return out;
}

function logLoss(scorer: LogisticScorer, data: LabeledExample[]): number {
  return -data.reduce((s, e) => s + Math.log(Math.max(1e-12, scorer.probability(e.features, e.label))), 0) / data.length;
}

async function main() {
  console.log('=== Epistemic Methods Suite ===\n');

  console.log('[1] Mondrian conformal: class-conditional coverage on held-out data');
  {
    const rand = seededRandom(20261003);
    const train = synthetic(600, rand);
    const calSet = synthetic(600, rand);
    const test = synthetic(6000, rand);
    for (const alpha of [0.05, 0.1, 0.2]) {
      const clf = new ConformalThreeWayClassifier();
      clf.calibrate(train, calSet, alpha);
      const ev = clf.evaluate(test);
      // Coverage is guaranteed in expectation over calibration draws; for one
      // draw it fluctuates with sd ~ sqrt(alpha(1-alpha)/(n_y+2)). Allow 3 sd.
      const cal = clf.getCalibration()!;
      const nMin = Math.min(cal.counts.supported, cal.counts.refuted);
      const tol = 3 * Math.sqrt((alpha * (1 - alpha)) / (nMin + 2));
      console.log(
        `  alpha=${alpha}: coverage supported=${ev.coverage.supported!.toFixed(3)} refuted=${ev.coverage.refuted!.toFixed(3)}  ` +
          `singleton=${ev.singletonRate.toFixed(2)} both=${ev.fullRate.toFixed(2)} empty=${ev.emptyRate.toFixed(2)}`
      );
      assert(ev.coverage.supported! >= 1 - alpha - tol, `supported coverage ${ev.coverage.supported} below ${1 - alpha} at alpha=${alpha}`);
      assert(ev.coverage.refuted! >= 1 - alpha - tol, `refuted coverage ${ev.coverage.refuted} below ${1 - alpha} at alpha=${alpha}`);
      assert(ev.fullRate + ev.emptyRate > 0, 'Overlapping classes must produce some non-singleton (inconclusive) sets');
    }
    const prior = new LogisticScorer();
    const fitted = new LogisticScorer();
    fitted.fit(train);
    assert(logLoss(fitted, test) < logLoss(prior, test), 'Fitting must lower held-out log loss relative to the prior');
    console.log('  ✔ coverage >= 1 - alpha for both classes at three alphas; fitting beats the prior');
  }

  console.log('[2] Conformal edge cases');
  {
    assert(conformalQuantile([0.1, 0.2, 0.3, 0.4, 0.5], 0.1) === null, 'n=5 cannot support alpha=0.1: threshold must be null');
    assert(conformalQuantile([0.1, 0.2, 0.3, 0.4, 0.5], 0.5) === 0.3, 'rank ceil(6*0.5)=3 -> third smallest');
    const clf = new ConformalThreeWayClassifier();
    clf.calibrate([], [{ features: [1, 1, 1, 1, 0], label: 'supported' }, { features: [0, 0, 0, 0, 1], label: 'refuted' }], 0.1);
    const d = clf.decide([1, 1, 1, 1, 0], 3);
    assert(d.status === 'inconclusive' && d.predictionSet!.length === 2, 'With too little calibration data every set is full: inconclusive, never a confident label');
    const un = new ConformalThreeWayClassifier().decide([1, 1, 1, 1, 0], 3);
    assert(un.calibrated === false && un.method === 'uncalibrated-prior' && un.alpha === undefined, 'Uncalibrated decisions carry no alpha');
    console.log('  ✔ small calibration sets are conservative; uncalibrated decisions claim nothing');
  }

  console.log('[3] Feature extraction reads real tool output shapes');
  {
    assert(potencyNmFromActivity({ type: 'IC50', relation: '=', value: '0.2 nM', units: 'nM' }) === 0.2, '"0.2 nM" -> 0.2');
    assert(potencyNmFromActivity({ type: 'Ki', value: '3 uM' }) === 3000, '"3 uM" -> 3000 nM');
    assert(potencyNmFromActivity({ type: 'IC50', relation: '>', value: '10000 nM' }) === null, '">" is not a measured potency');
    assert(potencyNmFromActivity({ type: 'Inhibition', value: '50 %' }) === null, 'Percent inhibition is not a potency');
    assert(parseMaxPhase('Phase 4') === 4 && parseMaxPhase('4.0') === 4 && parseMaxPhase('Preclinical/Research') === null, 'Phase parsing');
    const x = featuresFromObservations({ sequenceResolved: true, bestPotencyNm: 1, bioactivityCount: 1, maxPhase: 4, trialFound: true, evidenceCount: 3 });
    assert(close(x[1], 1) && x[2] === 1 && x[3] === 1 && x[4] === 0, `Strong profile features: ${x}`);
    const none = featuresFromObservations({ sequenceResolved: false, bestPotencyNm: null, bioactivityCount: 0, maxPhase: null, trialFound: false, evidenceCount: 0 });
    assert(none.every((v) => v === 0), 'Absence of data is all zeros, including no contradiction');
    console.log('  ✔ potency strings, units, relations and phases parse; missing data is not contradiction');
  }

  console.log('[4] Information-gain planner');
  {
    const H = ['supported', 'refuted'];
    const perfect: ActionOutcomeModel = { actionId: 'perfect', cost: 1, outcomes: ['yes', 'no'], likelihood: { supported: [1, 0], refuted: [0, 1] } };
    const useless: ActionOutcomeModel = { actionId: 'useless', cost: 1, outcomes: ['yes', 'no'], likelihood: { supported: [0.5, 0.5], refuted: [0.5, 0.5] } };
    const u = uniformBelief(H);
    assert(close(entropyBits(u.probs), 1), 'Uniform over two hypotheses has 1 bit');
    assert(close(expectedInformationGain(u, perfect), 1), 'A perfect test is worth 1 bit');
    assert(close(expectedInformationGain(u, useless), 0), 'An uninformative test is worth 0 bits');
    const noisy: ActionOutcomeModel = { actionId: 'noisy', cost: 1, outcomes: ['yes', 'no'], likelihood: { supported: [0.8, 0.2], refuted: [0.3, 0.7] } };
    const post = posterior(u, noisy, 'yes');
    assert(close(post.probs[0], 0.8 / 1.1), `Bayes update: ${post.probs[0]}`);

    const split = beliefFromStances(H, [
      { agentId: 'investigator', stance: 'supported', confidence: 0.9 },
      { agentId: 'falsifier', stance: 'refuted', confidence: 0.9 },
    ]);
    const agree = beliefFromStances(H, [
      { agentId: 'a', stance: 'supported', confidence: 1 },
      { agentId: 'b', stance: 'supported', confidence: 1 },
      { agentId: 'c', stance: 'supported', confidence: 1 },
    ]);
    assert(shouldEscalate(split) && !shouldEscalate(agree), 'Split experts escalate, unanimous ones do not');
    assert(disagreement(split) > disagreement(agree), 'Disagreement orders as expected');

    const loop = await runEvidenceLoop({ belief: u, models: [useless, noisy, perfect], budget: 3, stopEntropyBits: 0.01, execute: async () => 'yes' });
    assert(loop.steps[0].actionId === 'perfect' && loop.stopReason === 'converged' && loop.steps.length === 1, `Perfect test first, then converge: ${JSON.stringify(loop.steps.map((s) => s.actionId))} ${loop.stopReason}`);
    const failed = await runEvidenceLoop({ belief: u, models: [noisy], budget: 1, execute: async () => null });
    assert(close(failed.belief.probs[0], 0.5) && failed.spent === 1, 'A failed call spends budget and leaves the belief unchanged');
    const priced = await runEvidenceLoop({ belief: u, models: [{ ...perfect, cost: 5 }, noisy], budget: 2, execute: async () => 'yes' });
    assert(priced.steps.every((s) => s.actionId !== 'perfect'), 'Actions over budget are never chosen');

    const est = estimateOutcomeModel('t', 1, H, ['yes', 'no'], [
      { hypothesis: 'supported', outcome: 'yes' },
      { hypothesis: 'supported', outcome: 'yes' },
      { hypothesis: 'refuted', outcome: 'no' },
    ]);
    assert(close(est.likelihood.supported[0], 3 / 4) && close(est.likelihood.refuted[1], 2 / 3), 'Laplace-smoothed estimates');
    console.log('  ✔ EIG, Bayes update, escalation, budget, failure handling and estimation are correct');
  }

  console.log('[5] Paired statistics');
  {
    assert(close(mcnemarExact(0, 10).pValue, 2 / 1024), `McNemar(0,10) = 2/1024, got ${mcnemarExact(0, 10).pValue}`);
    assert(mcnemarExact(5, 5).pValue === 1 && mcnemarExact(0, 0).pValue === 1, 'Balanced or empty discordance gives p=1');
    const m = mcnemarFromPairs([true, true, false, true], [false, true, false, false]);
    assert(m.b === 2 && m.c === 0, 'Discordant pair counting');
    const a = Array.from({ length: 50 }, (_, i) => 0.6 + (i % 5) * 0.01);
    const b = a.map((x) => x - 0.1);
    const boot = pairedBootstrap(a, b, { resamples: 2000, seed: 7 });
    assert(close(boot.meanDiff, 0.1, 1e-9) && boot.ciLow <= 0.1 + 1e-9 && boot.ciHigh >= 0.1 - 1e-9 && boot.pValue === 0, `Constant shift: ${JSON.stringify(boot)}`);
    const same = pairedBootstrap(a, a, { resamples: 500, seed: 7 });
    assert(same.meanDiff === 0 && same.pValue === 1, 'Identical systems: no difference');
    const again = pairedBootstrap(a, b.map((x, i) => x + (i % 3) * 0.05), { resamples: 500, seed: 3 });
    const again2 = pairedBootstrap(a, b.map((x, i) => x + (i % 3) * 0.05), { resamples: 500, seed: 3 });
    assert(again.ciLow === again2.ciLow && again.ciHigh === again2.ciHigh, 'Same seed, same interval');
    console.log('  ✔ exact McNemar, paired bootstrap, and seeded reproducibility');
  }

  console.log('\n✔ ALL EPISTEMIC METHODS TESTS PASSED\n');
}

main().catch((err) => {
  console.error('\n✖ Epistemic methods test failed:', err);
  process.exit(1);
});
