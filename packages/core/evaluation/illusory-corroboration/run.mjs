// Illusory-corroboration experiment: does adding papers from a trial that is
// already represented make a model more confident, although no independent
// evidence was added?
//
//   node run.mjs --dry-run                      # print one prompt, call nothing
//   MODEL_CMD="claude -p" node run.mjs          # run with a local CLI (prompt on stdin)
//   MODEL_CMD="codex exec -" node run.mjs --reps 3
//
// Results are appended to results.jsonl and the run resumes where it stopped.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
process.chdir(new URL('.', import.meta.url).pathname);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRY = flag('--dry-run');
const REPS = Number(opt('--reps', 1));
const LIMIT = Number(opt('--limit', Infinity));
const CMD = process.env.MODEL_CMD;
if (!DRY && !CMD) { console.error('Set MODEL_CMD, e.g. MODEL_CMD="claude -p"'); process.exit(1); }

const { papers, packets } = JSON.parse(fs.readFileSync('packets.json', 'utf8'));

// Seeded shuffle so every condition of a question shows shared papers in the same relative order.
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function seedOf(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function order(q, ids) {
  const r = rng(seedOf(q.query));
  const rank = new Map([...new Set([...q.pmids, ...q.extraPool])].map((p) => [p, r()]));
  return [...ids].sort((a, b) => rank.get(a) - rank.get(b));
}
// Papers of the main trial that the dedup list dropped, then extra PubMed records of that trial.
const dosePool = (q) => [...q.pmids.filter((p) => !q.dedup.includes(p) && papers[p].trials.includes(q.mainTrial)), ...q.extraPool];

function conditions(q) {
  const out = { raw: q.pmids, annotated: q.pmids, dedup: q.dedup };
  const pool = dosePool(q);
  for (const k of [3, 6]) if (pool.length >= k) out[`dose${k}`] = [...q.dedup, ...pool.slice(0, k)];
  return out;
}

function prompt(q, ids, annotate) {
  const items = order(q, ids).map((p, i) => {
    const x = papers[p];
    const src = annotate ? `\nSource trial(s): ${x.trials.length ? x.trials.join(', ') : 'not identified'}` : '';
    return `[${i + 1}] ${x.title} (${x.journal}, ${x.year}; PMID ${p})${src}\n${(x.abstract || '(no abstract)').slice(0, 900)}`;
  });
  const note = annotate ? 'Papers that list the same source trial report the same participants and are not independent studies.\n\n' : '';
  return `You are assessing biomedical evidence. Use only the evidence listed below.

Question: is ${q.drug} effective for ${q.disease}?

${note}Evidence:
${items.join('\n\n')}

Reply with JSON only:
{"probability_effective": <0-100>, "independent_studies_supporting": <integer>, "independent_studies_against": <integer>, "rationale": "<at most two sentences>"}`;
}

const done = new Set(fs.existsSync('results.jsonl') ? fs.readFileSync('results.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.query}|${r.condition}|${r.rep}`; }) : []);
let n = 0;
for (const q of packets.slice(0, LIMIT)) {
  for (const [cond, ids] of Object.entries(conditions(q))) {
    const text = prompt(q, ids, cond === 'annotated');
    if (DRY) { console.log(`--- ${q.query} / ${cond} / ${ids.length} papers / ~${Math.round(text.length / 4)} tokens`); if (n++ === 0) console.log(text.slice(0, 1500), '\n...'); continue; }
    for (let rep = 0; rep < REPS; rep++) {
      if (done.has(`${q.query}|${cond}|${rep}`)) continue;
      const t0 = Date.now();
      const r = spawnSync(CMD, { input: text, shell: true, encoding: 'utf8', maxBuffer: 1 << 24, timeout: 600_000 });
      const m = (r.stdout || '').match(/\{[\s\S]*\}/);
      let parsed = null; try { parsed = m ? JSON.parse(m[0]) : null; } catch {}
      const row = { query: q.query, label: q.label, condition: cond, rep, papers: ids.length, ms: Date.now() - t0, parsed, raw: parsed ? undefined : (r.stdout || r.stderr || '').slice(0, 2000) };
      fs.appendFileSync('results.jsonl', JSON.stringify(row) + '\n');
      console.log(q.query, cond, rep, parsed ? parsed.probability_effective : 'PARSE-FAIL');
    }
  }
}
