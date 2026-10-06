import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import requests, json, time, re
def get(url, params, tries=6):
    for i in range(tries):
        try:
            r=requests.get(url,params=params,timeout=120)
            if r.status_code==200: return r.json()
        except Exception: pass
        time.sleep(5*(i+1))
    raise RuntimeError(url)
# Terminated phase 2/3 drug trials whose stated reason is efficacy / futility
studies=[]; tok=None
while True:
    p={"query.term":"AREA[Phase](PHASE2 OR PHASE3) AND AREA[WhyStopped](futility OR efficacy OR ineffective OR \"lack of benefit\")",
       "filter.overallStatus":"TERMINATED","pageSize":1000,
       "fields":"NCTId,WhyStopped,InterventionName,InterventionType,InterventionOtherName,Phase"}
    if tok: p["pageToken"]=tok
    d=get("https://clinicaltrials.gov/api/v2/studies",p)
    studies+=d["studies"]; tok=d.get("nextPageToken")
    if not tok: break
print("studies",len(studies))
json.dump(studies,open("ct_terminated.json","w"))
