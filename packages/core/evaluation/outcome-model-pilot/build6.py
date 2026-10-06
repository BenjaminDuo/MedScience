import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Disease-aware pairs: (target, disease) for every labelled target.
# supported: an approved indication (ChEMBL drug_indication, max_phase_for_ind = 4)
#            of an approved drug acting on the target.
# refuted:   a condition of the phase 2/3 trial that was stopped for lack of efficacy.
import json, random, requests, time
B = "https://www.ebi.ac.uk/chembl/api/data"
OT = "https://api.platform.opentargets.org/api/v4/graphql"
def get(url, params):
    for i in range(6):
        try:
            r = requests.get(url, params=params, timeout=120)
            if r.status_code == 200: return r.json()
        except Exception: pass
        time.sleep(5 * (i + 1))
    raise RuntimeError(url)
def gql(query, variables):
    for i in range(6):
        try:
            r = requests.post(OT, json={"query": query, "variables": variables}, timeout=120)
            if r.status_code == 200 and "data" in r.json(): return r.json()["data"]
        except Exception: pass
        time.sleep(5 * (i + 1))
    raise RuntimeError("opentargets")
data = json.load(open("dataset.json")); mechs = json.load(open("mechanisms.json")); neg_raw = json.load(open("negatives_raw.json"))
random.seed(20261006)
# Ensembl ids for every symbol
syms = sorted({d["symbol"] for d in data})
m = gql("query($t:[String!]!){ mapIds(queryTerms:$t, entityNames:[\"target\"]){ mappings{ term hits{ id name } } } }", {"t": syms})
ens = {x["term"]: next((h["id"] for h in x["hits"] if h["name"] == x["term"]), None) for x in m["mapIds"]["mappings"]}
pairs = []
for d in data:
    pair = {**d, "ensemblId": ens.get(d["symbol"])}
    if d["label"] == "supported":
        mols = sorted({x["molecule_chembl_id"] for x in mechs if x["target_chembl_id"] == d["target"] and x["max_phase"] == 4})
        inds = []
        for i in range(0, len(mols), 40):
            r = get(B + "/drug_indication.json", {"molecule_chembl_id__in": ",".join(mols[i:i + 40]), "max_phase_for_ind": 4, "limit": 1000,
                                                    "only": "molecule_chembl_id,efo_id,efo_term"})
            inds += [x for x in r["drug_indications"] if x.get("efo_id")]
        if not inds: continue
        pick = random.choice(sorted(inds, key=lambda x: (x["molecule_chembl_id"], x["efo_id"])))
        # ChEMBL can carry EFO ids that Open Targets has since retired, so map by
        # name exactly as the refuted side maps trial conditions.
        mm = gql("query($t:[String!]!){ mapIds(queryTerms:$t, entityNames:[\"disease\"]){ mappings{ term hits{ id name } } } }", {"t": [pick["efo_term"]]})
        hits = mm["mapIds"]["mappings"][0]["hits"]
        if not hits: continue
        pair.update(diseaseId=hits[0]["id"], diseaseName=hits[0]["name"], condition=pick["efo_term"], basis=f"approved: {pick['molecule_chembl_id']}")
    else:
        ev = d["evidence"]
        r = get("https://clinicaltrials.gov/api/v2/studies/" + ev["nct"], {"fields": "Condition"})
        conds = r.get("protocolSection", {}).get("conditionsModule", {}).get("conditions", [])
        if not conds: continue
        mm = gql("query($t:[String!]!){ mapIds(queryTerms:$t, entityNames:[\"disease\"]){ mappings{ term hits{ id name } } } }", {"t": conds})
        hit = next(((x["term"], x["hits"][0]) for x in mm["mapIds"]["mappings"] if x["hits"]), None)
        if not hit: continue
        pair.update(diseaseId=hit[1]["id"], diseaseName=hit[1]["name"], condition=hit[0], basis=f"stopped: {ev['nct']}")
    pairs.append(pair)
json.dump(pairs, open("pairs.json", "w"), indent=1)
from collections import Counter
print(Counter(p["label"] for p in pairs), "missing ensembl", sum(1 for p in pairs if not p["ensemblId"]))
