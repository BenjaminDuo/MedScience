import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import requests, json, time, re
B="https://www.ebi.ac.uk/chembl/api/data"
def get(url, params, tries=6):
    for i in range(tries):
        try:
            r=requests.get(url,params=params,timeout=120)
            if r.status_code==200: return r.json()
        except Exception: pass
        time.sleep(5*(i+1))
    raise RuntimeError(url)
mechs=json.load(open("mechanisms.json")); targets=json.load(open("targets.json"))
cand={t for t,v in targets.items() if v["maxPhase"] in (2.0,3.0)}
mol2t={}
for m in mechs:
    if m["target_chembl_id"] in cand: mol2t.setdefault(m["molecule_chembl_id"],set()).add(m["target_chembl_id"])
mols=sorted(mol2t); names={}
for i in range(0,len(mols),40):
    d=get(B+"/molecule.json",{"molecule_chembl_id__in":",".join(mols[i:i+40]),"limit":40,"only":"molecule_chembl_id,pref_name,molecule_synonyms"})
    for m in d["molecules"]:
        ns={(m.get("pref_name") or "").lower()}|{s["molecule_synonym"].lower() for s in (m.get("molecule_synonyms") or [])}
        names[m["molecule_chembl_id"]]={n for n in ns if len(n)>=4}
norm=lambda s: re.sub(r"[^a-z0-9]+"," ",s.lower()).strip()
index={}
for mid,ns in names.items():
    for n in ns: index.setdefault(norm(n),set()).add(mid)
studies=json.load(open("ct_terminated.json"))
hits={}
for s in studies:
    ps=s["protocolSection"]; nct=ps["identificationModule"]["nctId"]
    why=ps.get("statusModule",{}).get("whyStopped","")
    for iv in ps.get("armsInterventionsModule",{}).get("interventions",[]):
        if iv.get("type") not in ("DRUG","BIOLOGICAL"): continue
        cands=[iv.get("name","")]+iv.get("otherNames",[])
        for c in cands:
            toks=norm(c)
            for key in [toks]+toks.split():
                for mid in index.get(key,()):
                    for t in mol2t[mid]:
                        hits.setdefault(t,[]).append({"nct":nct,"drug":c,"molecule":mid,"whyStopped":why[:200]})
print("molecules",len(mols),"negative targets",len(hits))
json.dump(hits,open("negatives_raw.json","w"),indent=1)
