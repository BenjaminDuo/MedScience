import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Open Targets evidence scores per (target, disease), with ontology propagation.
# The "clinical" (drug) and "literature" datatypes are recorded but must not be
# used as lookups: they contain the very approvals and trials that set the labels.
import json, requests, time
OT = "https://api.platform.opentargets.org/api/v4/graphql"
Q = """query($d:String!,$t:[String!]!){ disease(efoId:$d){ associatedTargets(Bs:$t, enableIndirect:true){
  rows{ score datatypeScores{ id score } } } } }"""
def gql(v):
    for i in range(6):
        try:
            r = requests.post(OT, json={"query": Q, "variables": v}, timeout=120)
            j = r.json()
            if r.status_code == 200 and "data" in j: return j["data"]
        except Exception: pass
        time.sleep(5 * (i + 1))
    return None
pairs = json.load(open("pairs.json")); out = []
for p in pairs:
    d = gql({"d": p["diseaseId"], "t": [p["ensemblId"]]})
    rows = (((d or {}).get("disease") or {}).get("associatedTargets") or {}).get("rows") or []
    scores = {x["id"]: x["score"] for x in rows[0]["datatypeScores"]} if rows else {}
    out.append({"symbol": p["symbol"], "label": p["label"], "diseaseId": p["diseaseId"], "diseaseName": p["diseaseName"],
                "queryOk": d is not None and (d.get("disease") is not None), "overall": rows[0]["score"] if rows else 0, "datatypes": scores})
json.dump(out, open("disease_evidence.json", "w"), indent=1)
print(len(out), "failed", sum(1 for o in out if not o["queryOk"]))
