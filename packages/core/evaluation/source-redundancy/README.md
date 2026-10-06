# How often does retrieved evidence share an upstream trial?

A small, annotation-free measurement for the "independent lines of evidence" design.

1. `build_questions.py` -- 94 drug-disease questions from `../outcome-model-pilot/pairs.json`
   (52 approved drug + approved indication, 42 drug + condition of a trial stopped for
   lack of efficacy).
2. `retrieve.mts` -- runs MedScience's own `literature_search` (PubMed, then OpenAlex,
   top 20, title de-duplication only) on each question; `retrieved.json`.
3. `link_sources.py` -- for every retrieved PubMed record, the trials it comes from:
   NLM's DataBank links to ClinicalTrials.gov plus NCT ids in the title or abstract;
   `paper_sources.json`.
4. `analyze.py` -- within each question, papers sharing a trial are merged
   (union-find); `redundancy.json`, `summary.json`.

## Results (2026-10-07)

| | all | approved | failed |
|---|---|---|---|
| retrieved papers | 1649 | 979 | 670 |
| linked to a trial | 207 | 137 | 70 |
| ...of which repeat a trial already represented | 60 (29%) | 40 (29%) | 20 (29%) |
| questions with trial evidence | 62 | 37 | 25 |
| ...with at least one same-trial duplicate | 25 (40%) | 18 (49%) | 7 (28%) |
| most papers from one trial source in one result list | 8 | 8 | 8 |

Strict variant (only papers linked to exactly one trial, no chaining through pooled
analyses): 41 of 177 redundant (23%); 18 of 59 questions affected (31%).

Example: for "abemaciclib breast carcinoma", 6 of the top 20 papers come from one
trial, monarchE (NCT03155997).

## Reading the numbers

- These are lower bounds. Only explicit trial links are detected; shared cohorts,
  datasets, preprint/journal pairs and meta-analyses citing included trials are not.
- PubMed DataBank links are curated but not perfect (a phase 2 semaglutide paper is
  linked under the STEP 1 trial id, for example).
- Most retrieved papers are not trial reports, so the share of all papers that is
  redundant (60 of 1649) is small; the effect is concentrated in the trial evidence,
  which is the evidence that decides efficacy questions.
