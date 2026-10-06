import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import json, re, random
h=json.load(open("negatives_raw.json")); T=json.load(open("targets.json"))
FAIL=re.compile(r"(lack of (drug )?efficacy|insufficient efficacy|limited efficacy|no efficacy|futility|ineffective|not (likely to )?meet|unlikely to meet|did not meet|failed to (demonstrate|meet)|failure of .* to meet|efficacy not evident|efficacy results|mixed efficacy)", re.I)
EXCL=re.compile(r"(no safety (and|or|and/or) ?efficacy concern|no safety or efficacy|not related to (safety and )?efficacy|decision not related|business|portfolio|enrol|accrual|study design|analy[sz]e available)", re.I)
neg=[]
for t,trials in sorted(h.items()):
    ok=[x for x in trials if FAIL.search(x["whyStopped"]) and not EXCL.search(x["whyStopped"])]
    if ok: neg.append({"target":t,"symbol":T[t]["symbol"],"accession":T[t]["accession"],"label":"refuted","evidence":ok[0]})
pos_pool=sorted(t for t,v in T.items() if v["maxPhase"]==4.0)
random.seed(20261006)
pos=[{"target":t,"symbol":T[t]["symbol"],"accession":T[t]["accession"],"label":"supported"} for t in random.sample(pos_pool, len(neg))]
json.dump(pos+neg,open("dataset.json","w"),indent=1)
print("negatives",len(neg),"positives",len(pos))
print(" ".join(x["symbol"] for x in neg))
