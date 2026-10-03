# Evidence Governance in MedScience (v3.0)

This document specifies the three methods introduced in v3.0 and how they fit
together. It is written so that its sections can be lifted into the *Method*
and *Experimental Setup* parts of a paper; every claim here is about the
design and its implementation. **No experimental results are reported in this
document or claimed by the release.**

| Component | Code | Tests |
| :--- | :--- | :--- |
| Provenance-typed evidence ledger (core) | `packages/core/src/epistemic/EvidenceLedger.ts`, `AdmissionGate.ts`, `RetractionIndex.ts`, `LedgerBridge.ts` | `tests/test-evidence-ledger.ts` |
| Information-gain evidence requests | `packages/core/src/epistemic/InformationGainPlanner.ts` | `tests/test-epistemic-methods.ts`, `tests/test-subagent-tree.ts` |
| Conformal three-way hypothesis decision | `packages/core/src/epistemic/ConformalClassifier.ts`, `HypothesisFeatures.ts` | `tests/test-epistemic-methods.ts`, `tests/test-subagent-tree.ts` |
| Evaluation utilities | `packages/core/src/epistemic/evaluation.ts` | `tests/test-epistemic-methods.ts` |

---

## 1. Motivation

A research agent's errors become expensive when they persist. A hallucinated
or since-retracted finding that is written into long-term memory is retrieved
again in later sessions and starts to look corroborated by repetition. The
three methods address three points where that happens:

1. **What may persist** -- the ledger and its admission gate.
2. **Which evidence to fetch when experts disagree** -- information-gain planning.
3. **When a hypothesis may be called supported or refuted** -- conformal decisions.

## 2. Provenance-typed evidence ledger

### 2.1 Entries and states

The ledger holds two kinds of entries: *evidence* $e$ (what one tool returned)
and *claims* $c$ (statements citing evidence as support $S(c)$ or refutation
$R(c)$). Each entry has a state

$$\sigma \in \{\textsf{candidate}, \textsf{verified}, \textsf{contested}, \textsf{quarantined}, \textsf{superseded}, \textsf{revoked}\}$$

and changes state only along the transition relation $T$:

| from \ to | candidate | verified | contested | quarantined | superseded | revoked |
| :--- | :-: | :-: | :-: | :-: | :-: | :-: |
| candidate | | ✓ | ✓ | ✓ | | ✓ |
| verified | | | ✓ | ✓ | ✓ | ✓ |
| contested | | ✓ | | ✓ | ✓ | ✓ |
| quarantined | ✓ | | | | | ✓ |
| superseded | | | | | | ✓ |
| revoked | | | | | | |

`revoked` is terminal. Evidence ids are content-derived (SHA-256 of tool,
query, summary, identifiers, source version and workspace), so recording the
same result twice yields the same entry.

### 2.2 Invariants

- **I1 (grounding).** $\sigma(c) = \textsf{verified} \Rightarrow S(c) \neq \emptyset \wedge \forall e \in S(c): \sigma(e) = \textsf{verified}$.
- **I2 (privacy).** No verified evidence carries patient data without authorisation.
- **I3 (succession).** A superseded claim names an existing successor.
- **I4 (integrity).** The event log is a valid hash chain and replays only transitions in $T$.

I1 is maintained by a **dependency cascade** rather than by checking it only
at write time: when evidence $e$ leaves `verified`, every verified claim $c$
with $e \in S(c)$ is moved to `contested` in the same operation. Restoring $e$
does not restore $c$; the claim must be re-promoted, which re-checks I1. Belief
revision is therefore non-monotonic but never silent: each step is an event
with a reason and an actor.

A claim whose support is fully verified but which also cites verified
refuting evidence is promoted to `contested`, not `verified` -- the
disagreement is recorded rather than resolved by fiat.

### 2.3 Hash chain

Each event $v_k$ stores $h_k = \mathrm{SHA256}(h_{k-1} \,\|\, \mathrm{canon}(v_k \setminus h_k))$
with $h_0 = 0^{256}$ and $\mathrm{canon}$ a key-sorted JSON serialisation. On
load the log is replayed; the first event that fails its hash, sequence number
or transition check stops the replay and puts the ledger in a read-only state,
so a modified log is detected and never extended.

### 2.4 Admission gate

Only the gate moves evidence out of `candidate`. Its checks are:

| Check | Blocks (→ quarantined) | Warns (admitted, reason kept) |
| :--- | :--- | :--- |
| provenance | missing tool, query or retrieval time | |
| source version | if configured as required | not reported |
| numerical verifier (`EvidenceVerifier`) | `REJECTED` (e.g. $p \notin [0,1]$) | `FLAGGED` |
| temporal | retrieved in the future; past `validUntil` | older than `maxAgeDays` |
| privacy | patient data without authorisation (scanned for tools that take the user's own clinical material) | |
| retraction | retraction or expression of concern on any identifier | |

Statistical significance is deliberately not a check: a $p$-value says
nothing about whether a result is identifiable, current, allowed to be stored
or still standing.

### 2.5 Retractions

The retraction index imports the Retraction Watch database (distributed openly
by Crossref since 2023) or any CSV with DOI/PMID columns. The *effective*
notice for a paper as of date $t$ is the latest retraction, expression of
concern or reinstatement dated on or before $t$; a later reinstatement clears
an earlier retraction and corrections never change standing. A **sweep**
applies the index to the ledger: retraction → `revoked`; expression of
concern → `contested` (verified) or `quarantined` (candidate). Claims follow
through the cascade.

## 3. Information-gain evidence requests

Disagreement among experts is represented as a belief $p$ over hypotheses $H$.
From stances $\{(h_i, w_i)\}$ with confidences $w_i \in [0,1]$:

$$p(h) \propto \alpha_0 + \sum_{i: h_i = h} w_i .$$

Each action (tool call) $a$ with cost $\kappa_a$ has an outcome model
$P(o \mid h, a)$. The planner chooses greedily

$$a^\star = \arg\max_{a:\, \kappa_a \le B_{\text{rem}}} \frac{\mathrm{EIG}(a)}{\kappa_a}, \qquad
\mathrm{EIG}(a) = H(p) - \sum_o P(o \mid a)\, H\big(p(\cdot \mid o, a)\big),$$

updates $p$ by Bayes' rule on the observed outcome, and stops when the
entropy falls below $\varepsilon$, the budget is spent, or no affordable action
is informative. A failed tool call spends budget but leaves $p$ unchanged; it
is never read as evidence against a hypothesis. Normalised disagreement
$H(p)/\log_2 |H|$ above a threshold triggers escalation to cross-domain
review. Outcomes of different actions are assumed conditionally independent
given $h$.

The bundled likelihood tables for the three lookups used by the hypothesis
tree are **hand-set priors** that encode direction only.
`estimateOutcomeModel` replaces them with Laplace-smoothed estimates from
labelled runs; a reported experiment should use estimated tables.

## 4. Conformal three-way hypothesis decision

### 4.1 Features

Each hypothesis branch yields a feature vector $x \in [0,1]^5$ computed only
from tool output (never from the target's name or the hypothesis wording):

| Feature | Definition |
| :--- | :--- |
| sequence | 1 if the target resolved to a sequence |
| bioactivity | $\mathrm{clip}_{[0,1]}((\mathrm{p}X - 4)/5)$, $\mathrm{p}X = 9 - \log_{10}(\text{best potency in nM})$ |
| clinical | max phase / 4; 0.25 for a registered trial without phase |
| literature | $\min(1, n_{\text{evidence}}/3)$ |
| contradiction | 1 if potency was measured and even the best value exceeds 10 µM |

### 4.2 Decision rule

Ground truth is binary, $y \in \{\textsf{s}, \textsf{r}\}$ (supported,
refuted). A probabilistic scorer $\hat p_y(x)$ (logistic regression) gives
nonconformity $s_y(x) = 1 - \hat p_y(x)$. With a calibration set split by
class (Mondrian / class-conditional split conformal), let $q_y$ be the
$\lceil (n_y + 1)(1-\alpha) \rceil$-th smallest calibration score of class $y$
($q_y = \infty$ if that rank exceeds $n_y$). The prediction set is

$$\Gamma(x) = \{ y : s_y(x) \le q_y \},$$

and under exchangeability $\Pr[y \in \Gamma(X) \mid Y = y] \ge 1 - \alpha$ for
each class. The status is read off the set size:

| $\Gamma(x)$ | status |
| :--- | :--- |
| $\{\textsf{s}\}$ | supported |
| $\{\textsf{r}\}$ | refuted |
| $\{\textsf{s}, \textsf{r}\}$ | inconclusive (evidence compatible with both) |
| $\emptyset$ | inconclusive, *atypical* (unlike either class) |

So *inconclusive* is not a third class with its own threshold; it is the
statement that, at error level $\alpha$, the evidence does not determine the
outcome.

Without a calibration set the classifier reports `calibrated: false`, uses the
prior scorer with conservative cut-offs, and claims no coverage. Tool or
network failure with no evidence collected is reported as `error`, never as
`refuted`.

### 4.3 Calibrating

`calibrateFromFile` (and the ledger page in the app) takes a labelled JSON or
JSONL file, shuffles it with a fixed seed, fits the scorer on one half and
sets $q_y$ on the other, and stores the result with the dataset's SHA-256.
Coverage must be reported on a separate held-out set.

## 5. Evaluation utilities

- `mcnemarExact(b, c)` -- exact two-sided McNemar test for paired binary outcomes.
- `pairedBootstrap(a, b)` -- seeded paired bootstrap of the mean difference with a percentile CI.
- `retractionReplay(ledger, index, asOf)` -- exposure of verified claims to retracted or flagged evidence before and after the sweep.
- `ConformalThreeWayClassifier.evaluate(test)` -- per-class empirical coverage and set-size distribution.

Comparisons should hold the base model, tool budget and data fixed between
variants (equal-budget ablation).

## 6. Changes from v2

- The hypothesis tree previously scored targets partly by **name**
  (`TYK2`/`DEUCRAVACITINIB` received maximal bioactivity and literature scores;
  names containing `EGFR` or `negative_control` were penalised) and read
  ChEMBL potency and clinical phase from fields the tool does not return, so
  those terms never contributed. Both are removed; scores now come only from
  tool output, and a regression test checks that renaming a target does not
  change its score.

## 7. Limitations

- Coverage holds under exchangeability; distribution shift between the
  calibration set and new questions voids it.
- The feature set is coarse. ChEMBL potency for a *target* lookup is the best
  compound against that target, not necessarily the compound in the hypothesis.
- The planner is myopic (one-step lookahead) and assumes conditional independence of outcomes.
- Patient-data detection is heuristic and applied only to tools that take the user's own clinical material.
- The ledger is single-writer: the desktop app and the web server should not run against the same profile at the same time.
