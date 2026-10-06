import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import json, requests, time
B="https://www.ebi.ac.uk/chembl/api/data"
ds={(d["symbol"],d["label"]):d for d in json.load(open("dataset.json"))}
rows=json.load(open("outcomes.json"))
def get(url,params):
    for i in range(6):
        try:
            r=requests.get(url,params=params,timeout=120)
            if r.status_code==200: return r.json()
        except Exception: pass
        time.sleep(5*(i+1))
    return None
wrong=0; out=[]
for r in rows:
    d=ds[(r["symbol"],r["label"])]
    if r["chemblTarget"]!=d["target"]: wrong+=1
    a=get(B+"/activity.json",{"target_chembl_id":d["target"],"standard_type__in":"IC50,Ki,Kd,EC50","standard_units":"nM","standard_relation":"=","order_by":"standard_value","standard_value__gt":0,"limit":1,"only":"standard_value"})
    v=float(a["activities"][0]["standard_value"]) if a and a["activities"] else None
    o="none" if v is None else "potent" if v<=1000 else "weak" if v<=10000 else "inactive"
    out.append({"symbol":r["symbol"],"label":r["label"],"chembl":o,"best":v,"uniprot":r["uniprot"],"trials":r["trials"]})
json.dump(out,open("outcomes_improved.json","w"),indent=1)
from collections import Counter
print("tool hit a different ChEMBL target than the labelled one:",wrong,"/",len(rows))
for l in ("supported","refuted"): print(l,Counter(x["chembl"] for x in out if x["label"]==l))
