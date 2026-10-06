import fs from 'node:fs';
import * as P from '../../src/epistemic/InformationGainPlanner.ts';
process.chdir(new URL('.', import.meta.url).pathname);
const [inFile, outFile] = process.argv.slice(2).length ? process.argv.slice(2) : ['outcomes.json', 'estimate.json'];
const rows: any[] = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const H = ['supported', 'refuted'];
const defs = Object.fromEntries(P.DEFAULT_HYPOTHESIS_TOOL_MODELS.map((m) => [m.actionId, m]));
const key: Record<string, string> = { chembl_lookup: 'chembl', clinical_trials_lookup: 'trials', uniprot_lookup: 'uniprot' };
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const result: any = { n: { supported: 0, refuted: 0 }, actions: {} };
for (const h of H) result.n[h] = rows.filter((r) => r.label === h).length;
for (const [actionId, k] of Object.entries(key)) {
  const def = defs[actionId];
  const samples = rows.filter((r) => r[k] !== null).map((r) => ({ hypothesis: r.label, outcome: r[k] }));
  const failed = rows.filter((r) => r[k] === null).length;
  const counts: any = {};
  for (const h of H) counts[h] = Object.fromEntries(def.outcomes.map((o: string) => [o, samples.filter((s) => s.hypothesis === h && s.outcome === o).length]));
  const est = P.estimateOutcomeModel(actionId, 1, H, def.outcomes, samples, 1);
  const eig = P.expectedInformationGain(P.uniformBelief(H), est);
  const boots: number[] = [];
  for (let b = 0; b < 2000; b++) {
    const bs = H.flatMap((h) => { const g = samples.filter((s) => s.hypothesis === h); return g.map(() => g[Math.floor(rnd() * g.length)]); });
    boots.push(P.expectedInformationGain(P.uniformBelief(H), P.estimateOutcomeModel(actionId, 1, H, def.outcomes, bs, 1)));
  }
  boots.sort((a, b) => a - b);
  result.actions[actionId] = {
    failedCalls: failed, counts, likelihood: est.likelihood, handSet: def.likelihood,
    eig: +eig.toFixed(3), eigCI95: [+boots[49].toFixed(3), +boots[1949].toFixed(3)],
    eigHandSet: +P.expectedInformationGain(P.uniformBelief(H), def).toFixed(3),
  };
}
fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
