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

## Part 2: disease-aware evidence (target, disease)

The three lookups above ignore the disease. Part 2 asks whether evidence about the
*pair* separates the groups.

- `build6.py` gives every target a disease. supported: an approved indication
  (ChEMBL `drug_indication`, `max_phase_for_ind = 4`) of an approved drug acting on
  it. refuted: a condition of the trial stopped for lack of efficacy. Both are mapped
  to Open Targets disease ids by name. 94 pairs (52 / 42) mapped; `pairs.json`.
- `build7.py` reads Open Targets datatype scores for each pair, with ontology
  propagation; `disease_evidence.json`. The `clinical` and `literature` datatypes
  are recorded but never used as lookups: they contain the approvals and trials that
  define the labels.
- `analyze_disease.mts` fits the tables and bootstraps EIG; `estimate_disease.json`.

| Lookup on (target, disease) | supported | refuted | Fisher exact p | EIG (bits) | 95% CI |
|---|---|---|---|---|---|
| human genetic association | 18/52 (35%) | 7/42 (17%) | 0.062 | 0.027 | 0.001-0.114 |
| animal model phenotype | 20/52 (38%) | 7/42 (17%) | 0.023 | 0.039 | 0.002-0.129 |
| somatic mutation (cancer) | 10/52 (19%) | 2/42 (5%) | 0.059 | 0.029 | 0.001-0.096 |

Excluding the two pairs whose disease is a top-level term (e.g. "cancer") changes
the gains by at most 0.006 bits.

Findings: evidence about the target-disease pair carries information that the
target-only lookups do not (about twice as common in the supported group), in line
with Minikel et al., Nature 2024 (PMID 38632401), who estimate a 2.6-fold higher
probability of success for genetically supported mechanisms. The effect is modest
and the sample small: only the animal-model difference reaches p < 0.05.

Caveats: Open Targets evidence is today's, not as of the approval or trial, so part
of it may postdate the outcome; positives and negatives come from different sources
(approved indications vs. trial conditions).
