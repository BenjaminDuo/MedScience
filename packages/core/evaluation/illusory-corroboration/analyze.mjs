// Paired analysis of results.jsonl. For every question the reference is "dedup".
//   H1 more same-trial papers -> higher probability (raw, dose3, dose6 vs dedup)
//   H2 annotating sources removes the inflation (annotated vs raw)
//   H3 duplicates inflate the model's own count of independent supporting studies
import fs from 'node:fs';
process.chdir(new URL('.', import.meta.url).pathname);
const rows = fs.readFileSync('results.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.parsed);
const by = new Map();
for (const r of rows) {
  const k = r.query; if (!by.has(k)) by.set(k, { label: r.label, c: {} });
  const c = (by.get(k).c[r.condition] ??= { p: [], s: [] });
  c.p.push(Number(r.parsed.probability_effective)); c.s.push(Number(r.parsed.independent_studies_supporting));
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function test(diffs) {
  const m = mean(diffs); const boots = [];
  for (let b = 0; b < 10000; b++) boots.push(mean(diffs.map(() => diffs[Math.floor(rnd() * diffs.length)])));
  boots.sort((a, b) => a - b);
  let extreme = 0; for (let b = 0; b < 20000; b++) if (Math.abs(mean(diffs.map((d) => (rnd() < 0.5 ? -d : d)))) >= Math.abs(m) - 1e-12) extreme++;
  return { n: diffs.length, meanDiff: +m.toFixed(2), ci95: [+boots[249].toFixed(2), +boots[9749].toFixed(2)], pSignFlip: +((extreme + 1) / 20001).toFixed(4) };
}
const paired = (a, b, f) => [...by.values()].filter((q) => q.c[a] && q.c[b]).map((q) => mean(q.c[a][f]) - mean(q.c[b][f]));
const out = {
  questions: by.size,
  H1_probability: { raw_vs_dedup: test(paired('raw', 'dedup', 'p')), dose3_vs_dedup: test(paired('dose3', 'dedup', 'p')), dose6_vs_dedup: test(paired('dose6', 'dedup', 'p')) },
  H2_probability: { annotated_vs_raw: test(paired('annotated', 'raw', 'p')), annotated_vs_dedup: test(paired('annotated', 'dedup', 'p')) },
  H3_independent_studies_claimed: { raw_vs_dedup: test(paired('raw', 'dedup', 's')), dose6_vs_dedup: test(paired('dose6', 'dedup', 's')), annotated_vs_raw: test(paired('annotated', 'raw', 's')) },
};
fs.writeFileSync('analysis.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
