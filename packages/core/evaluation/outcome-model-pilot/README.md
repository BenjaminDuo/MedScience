# Outcome-model pilot: measuring P(outcome | hypothesis) for the hypothesis-tree lookups

`InformationGainPlanner` ranks lookups by expected information gain, which needs
`P(outcome | supported)` and `P(outcome | refuted)` for every lookup. The values in
`DEFAULT_HYPOTHESIS_TOOL_MODELS` were set by hand. This pilot measures them.

## Labelled set (114 human single-protein targets)

| Label | Definition | Source | n |
|---|---|---|---|
| supported | target of at least one approved drug (ChEMBL mechanism, `max_phase = 4`) | ChEMBL | 57, sampled with seed `20261006` from 448 |
| refuted | no approved drug on the target, and a phase 2/3 trial of a drug acting on it was terminated for lack of efficacy / futility | ClinicalTrials.gov (`whyStopped`) + ChEMBL mechanisms | 57 |

`build1.py` to `build5.py` rebuild the set; `negatives_raw.json` keeps the trial and
the stop reason behind every negative.

## Runs

- `run.mts` calls `uniprot_lookup`, `chembl_lookup` and `clinical_trials_lookup` exactly
  as `SubagentTreeEngine` does (query = gene symbol) and maps results to the same
  outcomes. Output: `outcomes.json`. No call fell back to an offline cache.
- `improved.py` re-measures the ChEMBL outcome with the best measured potency
  (IC50/Ki/Kd/EC50, nM, `=`) on the *labelled* ChEMBL target. Output: `outcomes_improved.json`.
- `analyze.mts [outcomes] [estimate]` fits the tables with `estimateOutcomeModel`
  (Laplace 1) and reports EIG from a 50/50 prior with a 2000-sample stratified
  bootstrap 95% interval.

## Results (2026-10-06)

| Lookup | supported | refuted | EIG (bits), measured | 95% CI | EIG, hand-set table |
|---|---|---|---|---|---|
| UniProt: sequence resolved | 57/57 | 57/57 | 0.000 | 0-0 | 0.039 |
| ClinicalTrials.gov: any trial found | 57/57 | 57/57 | 0.000 | 0-0 | 0.105 |
| ChEMBL as implemented: potent / weak / inactive / none | 31 / 4 / 2 / 20 | 19 / 8 / 8 / 22 | 0.042 | 0.010-0.143 | 0.259 |
| ChEMBL, best potency on the labelled target | 50 / 0 / 1 / 6 | 46 / 0 / 3 / 8 | 0.006 | 0.000-0.047 | -- |

Findings:

1. None of the three lookups separates approved targets from targets that failed for
   efficacy. Both groups resolve in UniProt, both have registered trials, and both
   have potent compounds (a target reaches phase 2/3 only with a potent drug).
   Potency is evidence of tractability, not of efficacy.
2. `chembl_lookup` resolved a different ChEMBL target from the labelled one for 57 of
   114 symbols (e.g. TNF -> ADAM17, MET -> a bacterial "Met repressor", MC4R -> a
   non-human ortholog), and reads only the first five activity records. The 0.042 bits
   it shows is mostly this noise: with the right target and the best potency the gain
   drops to 0.006.
3. The hand-set tables overstate every gain and should not be used to rank lookups.

Limitations: 57 per class; labels are target-level and disease-agnostic, as are the
lookups; a refuted label means "failed for efficacy at least once with no approval", not
"never effective". A different reference class (e.g. targets never taken to the clinic)
would give different tables.
