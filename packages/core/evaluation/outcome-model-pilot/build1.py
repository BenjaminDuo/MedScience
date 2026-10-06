import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Step 1: all ChEMBL mechanisms -> per-target max clinical phase
import requests, json, time
B="https://www.ebi.ac.uk/chembl/api/data"
def get(url, params, tries=6):
    for i in range(tries):
        try:
            r=requests.get(url,params=params,timeout=120)
            if r.status_code==200: return r.json()
        except Exception as e: pass
        time.sleep(5*(i+1))
    raise RuntimeError(url)
mechs=[]; off=0
while True:
    d=get(B+"/mechanism.json",{"limit":1000,"offset":off,"only":"molecule_chembl_id,target_chembl_id,max_phase"})
    mechs+=d["mechanisms"]; off+=1000
    if not d["page_meta"]["next"]: break
print("mechanisms",len(mechs))
json.dump(mechs,open("mechanisms.json","w"))
