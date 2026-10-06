# Does same-source evidence create illusory corroboration in an LLM?

`../source-redundancy` showed that retrieved evidence often contains several papers
from one trial (25 of 62 questions with trial evidence). Whether that changes a
model's conclusion is untested. This experiment tests it. Hypotheses are fixed
before any run:

- **H1** Adding papers from a trial already represented raises the model's stated
  probability that the drug works, although no independent evidence is added
  (`raw`, `dose3`, `dose6` vs `dedup`).
- **H2** Telling the model which papers share a trial removes that inflation
  (`annotated` vs `raw`).
- **H3** Same-trial papers inflate the model's own count of independent supporting
  studies.

If H1 does not hold, source annotation is not worth building and the direction is dropped.

## Design

25 real drug-disease questions whose retrieved list (MedScience `literature_search`,
top 20) contains same-trial papers. Same question, same model; only the evidence packet
changes:

| condition | packet |
|---|---|
| raw | the retrieved list as returned |
| annotated | the same list, each paper tagged with its source trial(s), plus one sentence saying same-trial papers are not independent |
| dedup | one paper per trial cluster (earliest), unlinked papers kept |
| dose3 / dose6 | dedup plus 3 / 6 further papers of the most represented trial (retrieved duplicates first, then other PubMed records linked to that trial) |

Every paper is a real PubMed record (title, journal, year, abstract truncated to 900
characters). Papers appear in a seeded order that is the same across conditions.
98 prompts of about 5k tokens each. No manual labels are used; `label` (approved /
failed for efficacy) is kept for a secondary calibration check.

## Running

`build_packets.py` has already been run; `packets.json` is the frozen input.

```bash
node run.mjs --dry-run                              # inspect prompts, no model calls
MODEL_CMD="claude -p" node run.mjs                  # any CLI that reads the prompt on stdin
MODEL_CMD="claude -p" node run.mjs --reps 3         # repeat each prompt to average out sampling noise
node analyze.mjs                                    # paired tests -> analysis.json
```

`analyze.mjs` reports, for each comparison, the mean paired difference with a
bootstrap 95% interval and a sign-flip permutation p-value.

## Limitations

- 25 questions; dose6 is possible for only 7 of them. A null result at this size is
  not proof of no effect; a clear effect is informative.
- The model may know these drugs. The paired design cancels a constant prior, but a
  model that answers from memory will show smaller differences. Run a second model if
  results are borderline.
- Same-trial detection uses explicit NCT links only.

## Results (first run, 2026-10)

Run on the user's machine with a local model CLI (model not recorded in the output),
one repetition, 98 prompts, all parsed. 24 distinct questions (two packets share the
levoketoconazole question). `results.jsonl`, `analysis.json`; `node analyze.mjs`
reproduces the analysis exactly.

| comparison (paired, 0-100 scale) | n | mean difference | 95% CI | sign-flip p |
|---|---|---|---|---|
| H1 raw vs dedup | 24 | +0.04 | -1.75 to 1.71 | 1.00 |
| H1 dose3 vs dedup | 16 | +1.19 | 0.50 to 2.00 | 0.004 |
| H1 dose6 vs dedup | 7 | +1.00 | 0.29 to 1.86 | 0.13 |
| H2 annotated vs raw | 24 | -1.42 | -3.50 to 0.21 | 0.18 |
| H3 claimed independent studies, raw vs dedup | 24 | +0.21 | -0.33 to 0.75 | 0.57 |

Reading:

- Adding three papers from a trial already in the packet moved the stated probability
  by about one point out of 100. The shift is detectable but negligible, and six papers
  moved it no further. The natural redundancy in the retrieved lists (raw vs dedup)
  moved it by nothing. Annotation and the model's own count of independent studies
  showed no reliable change.
- The model handled duplicates itself: in 10 of the 25 `raw` answers the rationale
  says, unprompted, that several papers report the same trial and were counted once.
  It saw abstracts; MedScience's `literature_search` currently passes titles only.
- The test has little room to move: 21 of 25 `raw` probabilities are >= 90 or <= 10.
  These are drugs with settled outcomes that the model may know, and the retrieved
  literature includes post-outcome reports. Questions with genuinely open answers,
  with drug names masked, would be a stronger test.

Decision under the rule fixed above: the effect is too small to justify a source-
annotation feature. The practical change is to pass abstracts, not just titles, to the
model.
