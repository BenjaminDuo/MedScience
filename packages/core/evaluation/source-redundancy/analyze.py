import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Papers that share an upstream trial are one source. Within each question,
# papers linked to overlapping trial sets are merged (union-find). Papers with no
# detectable trial link count as independent, so every figure is a lower bound.
import json, statistics as st
data = json.load(open("retrieved.json")); meta = json.load(open("paper_sources.json"))
rows = []
for q in data:
    papers = [p["pmid"] for p in q["papers"] if p["pmid"] in meta]
    trials = {p: set(meta[p]["databank"]) | set(meta[p]["mentioned"]) for p in papers}
    linked = [p for p in papers if trials[p]]
    parent = {p: p for p in linked}
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    owner = {}
    for p in linked:
        for t in trials[p]:
            if t in owner: parent[find(p)] = find(owner[t])
            else: owner[t] = p
    groups = {}
    for p in linked: groups.setdefault(find(p), []).append(p)
    clusters = sorted(groups.values(), key=len, reverse=True)
    biggest = clusters[0] if clusters else []
    rows.append({"query": q["query"], "label": q["label"], "papers": len(papers), "trialLinked": len(linked),
                 "trialSources": len(clusters), "redundant": len(linked) - len(clusters),
                 "independentUnits": len(papers) - len(linked) + len(clusters),
                 "largestCluster": len(biggest), "largestClusterTrials": sorted(set().union(*(trials[p] for p in biggest))) if biggest else []})
json.dump(rows, open("redundancy.json", "w"), indent=1)
def summary(rs):
    P = sum(r["papers"] for r in rs); L = sum(r["trialLinked"] for r in rs); S = sum(r["trialSources"] for r in rs); R = sum(r["redundant"] for r in rs)
    withTrial = [r for r in rs if r["trialLinked"] > 0]; withDup = [r for r in rs if r["redundant"] > 0]
    return {"questions": len(rs), "papers": P, "trialLinkedPapers": L, "distinctTrialSources": S, "redundantPapers": R,
            "shareOfTrialPapersRedundant": round(R / L, 3) if L else None,
            "trialPapersPerSource": round(L / S, 2) if S else None,
            "questionsWithTrialEvidence": len(withTrial), "questionsWithDuplicates": len(withDup),
            "shareOfQuestionsWithTrialEvidenceHavingDuplicates": round(len(withDup) / len(withTrial), 3) if withTrial else None,
            "maxPapersFromOneTrialSource": max((r["largestCluster"] for r in rs), default=0)}
out = {"all": summary(rows), "supported (approved)": summary([r for r in rows if r["label"] == "supported"]),
       "refuted (failed)": summary([r for r in rows if r["label"] == "refuted"])}
json.dump(out, open("summary.json", "w"), indent=1)
print(json.dumps(out, indent=1))
for r in sorted(rows, key=lambda r: -r["largestCluster"])[:8]:
    print(r["largestCluster"], "/", r["papers"], r["query"], r["largestClusterTrials"][:4])
