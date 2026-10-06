// Runs the three hypothesis-tree lookups exactly as SubagentTreeEngine does and
// maps each result to the same outcome labels.
import fs from 'node:fs';
import { globalToolRegistry, initializeDefaultTools } from '../../src/index.ts';
import { bestPotencyNm, INACTIVE_POTENCY_NM } from '../../src/epistemic/HypothesisFeatures.ts';
initializeDefaultTools();
process.chdir(new URL('.', import.meta.url).pathname);
const data = JSON.parse(fs.readFileSync('dataset.json', 'utf8'));
const out: any[] = fs.existsSync('outcomes.json') ? JSON.parse(fs.readFileSync('outcomes.json', 'utf8')) : [];
const done = new Set(out.map((o) => o.symbol + o.label));
const exec = (tool: string, input: any) => globalToolRegistry.execute(tool, input, 'pilot', 'research', 0) as Promise<any>;
for (const d of data) {
  if (done.has(d.symbol + d.label)) continue;
  const q = d.symbol;
  const u = await exec('uniprot_lookup', { accessionOrGene: q });
  const uniprot = !u.success || !u.output ? null : Number(u.output.sequenceLength) > 0 ? 'resolved' : 'unresolved';
  const c = await exec('chembl_lookup', { targetOrCompound: q });
  let chembl: string | null = null;
  let best: number | null = null;
  if (c.success && c.output) {
    best = bestPotencyNm(c.output.activities || []);
    chembl = best === null ? 'none' : best <= 1000 ? 'potent' : best <= INACTIVE_POTENCY_NM ? 'weak' : 'inactive';
  } else if (/No ChEMBL targets/.test(c.error || '')) {
    chembl = null; // the tree treats any failed call as no information
  }
  const t = await exec('clinical_trials_lookup', { interventionOrDrug: q, limit: 1 });
  const trials = !t.success ? null : t.output?.trials?.[0] ? 'trial' : 'none';
  const row = {
    symbol: q, label: d.label, uniprot, chembl, trials, bestPotencyNm: best,
    chemblTarget: c.output?.target?.id ?? null, chemblTargetName: c.output?.target?.name ?? null,
    uniprotAcc: u.output?.primaryAccession ?? null, expectedAcc: d.accession,
    trialNct: t.output?.trials?.[0]?.nctId ?? null,
    offline: [u, c, t].some((r) => /fallback/i.test(r.execution?.description || '')),
    errors: [u, c, t].filter((r) => !r.success).map((r) => r.error?.slice(0, 80)),
  };
  out.push(row);
  fs.writeFileSync('outcomes.json', JSON.stringify(out, null, 1));
  console.log(out.length, q, d.label, uniprot, chembl, best, trials);
}
