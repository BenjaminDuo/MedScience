// Runs MedScience's own literature_search on every question, as an agent would.
import fs from 'node:fs';
import { globalToolRegistry, initializeDefaultTools } from '../../src/index.ts';
process.chdir(new URL('.', import.meta.url).pathname);
initializeDefaultTools();
const clean = (s: string) =>
  s.replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|µg|ug|g|ml)\b/gi, ' ')
    .replace(/\b(acetate|hydrochloride|sodium|potassium|mesylate|maleate|tartrate|citrate|sulfate|besylate|fumarate|succinate|calcium)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
const qs = JSON.parse(fs.readFileSync('questions.json', 'utf8'));
const out: any[] = fs.existsSync('retrieved.json') ? JSON.parse(fs.readFileSync('retrieved.json', 'utf8')) : [];
const done = new Set(out.map((o) => o.query));
for (const q of qs) {
  const query = `${clean(q.drug)} ${clean(q.disease)}`;
  if (done.has(query)) continue;
  const r: any = await globalToolRegistry.execute('literature_search', { query, limit: 20 }, 'redundancy', 'research', 0);
  const cites = r.success ? r.output?.citations ?? r.citations ?? [] : [];
  out.push({ ...q, query, ok: r.success, papers: cites.map((c: any) => ({ pmid: c.pmid ?? null, doi: c.doi ?? null, title: c.title, year: c.year })) });
  fs.writeFileSync('retrieved.json', JSON.stringify(out, null, 1));
  console.log(out.length, query, r.success, cites.length);
}
