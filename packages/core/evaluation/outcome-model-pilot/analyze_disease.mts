// EIG of disease-aware lookups, fitted with estimateOutcomeModel and a stratified
// bootstrap. "clinical" and "literature" are excluded: they contain the approvals
// and trials that define the labels.
import fs from 'node:fs';
import * as P from '../../src/epistemic/InformationGainPlanner.ts';
process.chdir(new URL('.', import.meta.url).pathname);
const all: any[] = JSON.parse(fs.readFileSync('disease_evidence.json', 'utf8'));
const BROAD = /^(cancer|neoplasm|carcinoma|immune system disease|infectious disease|cardiovascular disease|nervous system disease|metabolic disease)$/i;
const H = ['supported', 'refuted'];
const has = (r: any, k: string) => (r.datatypes[k] ?? 0) > 0 ? 'found' : 'none';
const lookups: Record<string, (r: any) => string> = {
  genetic_association: (r) => has(r, 'genetic_association'),
  animal_model: (r) => has(r, 'animal_model'),
  somatic_mutation: (r) => has(r, 'somatic_mutation'),
  genetic_or_animal: (r) => (has(r, 'genetic_association') === 'found' || has(r, 'animal_model') === 'found' ? 'found' : 'none'),
};
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const report: any = {};
for (const [subset, rows] of [['all', all], ['excluding broad diseases', all.filter((r) => !BROAD.test(r.diseaseName))]] as const) {
  report[subset] = { n: Object.fromEntries(H.map((h) => [h, rows.filter((r) => r.label === h).length])), lookups: {} };
  for (const [id, f] of Object.entries(lookups)) {
    const samples = rows.map((r) => ({ hypothesis: r.label, outcome: f(r) }));
    const counts = Object.fromEntries(H.map((h) => [h, samples.filter((s) => s.hypothesis === h && s.outcome === 'found').length]));
    const fit = (s: typeof samples) => P.estimateOutcomeModel(id, 1, H, ['found', 'none'], s, 1);
    const eig = P.expectedInformationGain(P.uniformBelief(H), fit(samples));
    const boots: number[] = [];
    for (let b = 0; b < 2000; b++) {
      const bs = H.flatMap((h) => { const g = samples.filter((s) => s.hypothesis === h); return g.map(() => g[Math.floor(rnd() * g.length)]); });
      boots.push(P.expectedInformationGain(P.uniformBelief(H), fit(bs)));
    }
    boots.sort((a, b) => a - b);
    report[subset].lookups[id] = { found: counts, likelihood: fit(samples).likelihood, eig: +eig.toFixed(3), eigCI95: [+boots[49].toFixed(3), +boots[1949].toFixed(3)] };
  }
}
fs.writeFileSync('estimate_disease.json', JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries<any>(report)) {
  console.log(k, v.n);
  for (const [id, x] of Object.entries<any>(v.lookups)) console.log('  ', id, x.found, x.eig, x.eigCI95);
}
