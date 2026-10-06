import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Drug-disease questions from the outcome-model pilot: an approved drug with an
# approved indication, or the drug and condition of a trial stopped for lack of efficacy.
import json, requests, time
pairs = json.load(open("../outcome-model-pilot/pairs.json"))
def get(url, params):
    for i in range(6):
        try:
            r = requests.get(url, params=params, timeout=120)
            if r.status_code == 200: return r.json()
        except Exception: pass
        time.sleep(5 * (i + 1))
    raise RuntimeError(url)
qs = []
for p in pairs:
    if p["label"] == "supported":
        mid = p["basis"].split(": ")[1]
        # Open Targets serves ChEMBL drug names and stays up when the ChEMBL API does not.
        r = requests.post("https://api.platform.opentargets.org/api/v4/graphql", timeout=120,
                          json={"query": "query($id:String!){ drug(chemblId:$id){ name } }", "variables": {"id": mid}}).json()
        drug = ((r.get("data") or {}).get("drug") or {}).get("name", "").lower()
        disease = p.get("condition") or p["diseaseName"]
    else:
        drug = p["evidence"]["drug"]
        disease = p.get("condition") or p["diseaseName"]
    if drug:
        qs.append({"symbol": p["symbol"], "label": p["label"], "drug": drug, "disease": disease, "query": f"{drug} {disease}"})
json.dump(qs, open("questions.json", "w"), indent=1)
print(len(qs)); print([q["query"] for q in qs[:6]], [q["query"] for q in qs if q["label"] == "refuted"][:6])
