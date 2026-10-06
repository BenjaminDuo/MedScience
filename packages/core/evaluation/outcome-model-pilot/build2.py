import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import requests, json, time
B="https://www.ebi.ac.uk/chembl/api/data"
def get(url, params, tries=6):
    for i in range(tries):
        try:
            r=requests.get(url,params=params,timeout=120)
            if r.status_code==200: return r.json()
        except Exception: pass
        time.sleep(5*(i+1))
    raise RuntimeError(url)
mechs=json.load(open("mechanisms.json"))
maxph={}
for m in mechs:
    t=m["target_chembl_id"]; p=m["max_phase"]
    if not t or p is None: continue
    maxph[t]=max(maxph.get(t,0),float(p))
ids=sorted(maxph); targets={}
for i in range(0,len(ids),40):
    d=get(B+"/target.json",{"target_chembl_id__in":",".join(ids[i:i+40]),"limit":40})
    for t in d["targets"]:
        if t["target_type"]!="SINGLE PROTEIN" or t["organism"]!="Homo sapiens": continue
        comp=(t.get("target_components") or [{}])[0]
        sym=[s["component_synonym"] for s in comp.get("target_component_synonyms",[]) if s["syn_type"]=="GENE_SYMBOL"]
        if not sym: continue
        targets[t["target_chembl_id"]]={"symbol":sym[0],"accession":comp.get("accession"),"name":t["pref_name"],"maxPhase":maxph[t["target_chembl_id"]]}
json.dump(targets,open("targets.json","w"),indent=0)
from collections import Counter
print(len(targets), Counter(v["maxPhase"] for v in targets.values()))
