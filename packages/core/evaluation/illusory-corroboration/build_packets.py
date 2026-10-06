import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Evidence packets for the "illusory corroboration" experiment. Everything here is
# public data; no model is called. Inputs come from ../source-redundancy.
#
# For every question whose retrieved list contains same-trial papers:
#   raw        the retrieved list as MedScience's literature_search returned it
#   annotated  the same list, each paper tagged with its source trial(s)
#   dedup      one paper per trial cluster (earliest, then lowest PMID); unlinked papers kept
#   dose_k     dedup + k further papers from the most represented trial, k in {3, 6}
#              (real PubMed records linked to that trial, not in the retrieved list)
import json, re, time, requests
import xml.etree.ElementTree as ET
from collections import Counter
SR = "../source-redundancy"
data = json.load(open(f"{SR}/retrieved.json")); meta = json.load(open(f"{SR}/paper_sources.json"))
E = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
def post(url, d):
    for k in range(6):
        try:
            r = requests.post(url, data=d, timeout=120)
            if r.status_code == 200: return r
        except Exception: pass
        time.sleep(5 * (k + 1))
    raise RuntimeError(url)
def fetch(pmids):
    out = {}
    for i in range(0, len(pmids), 150):
        root = ET.fromstring(post(f"{E}/efetch.fcgi", {"db": "pubmed", "id": ",".join(pmids[i:i + 150]), "retmode": "xml"}).content)
        for a in root.findall(".//PubmedArticle"):
            pmid = a.findtext(".//MedlineCitation/PMID")
            abstract = " ".join("".join(t.itertext()) for t in a.findall(".//AbstractText"))
            year = a.findtext(".//PubDate/Year") or (a.findtext(".//PubDate/MedlineDate") or "")[:4]
            bank = sorted({x.text.upper() for db in a.findall(".//DataBank") if (db.findtext("DataBankName") or "").lower().startswith("clinicaltrials") for x in db.findall(".//AccessionNumber") if x.text})
            out[pmid] = {"pmid": pmid, "title": "".join(a.find(".//ArticleTitle").itertext()) if a.find(".//ArticleTitle") is not None else "",
                         "journal": a.findtext(".//Journal/ISOAbbreviation") or "", "year": year, "abstract": abstract,
                         "trials": sorted(set(bank) | {m.upper() for m in re.findall(r"NCT\d{8}", abstract, re.I)})}
        time.sleep(0.4)
    return out
def trials_of(p): return sorted(set(meta[p]["databank"]) | set(meta[p]["mentioned"]))
packets = []
for q in data:
    ps = [p["pmid"] for p in q["papers"] if p["pmid"] in meta]
    c = Counter(t for p in ps for t in trials_of(p))
    if not c or c.most_common(1)[0][1] < 2: continue
    main, n_main = c.most_common(1)[0]
    packets.append({"query": q["query"], "drug": q["drug"], "disease": q["disease"], "label": q["label"], "pmids": ps, "mainTrial": main, "mainTrialPapers": n_main})
need = sorted({p for k in packets for p in k["pmids"]})
papers = fetch(need)
for k in packets:
    # extra papers from the main trial that the search did not return
    ids = []
    for term in (f"{k['mainTrial']}[si]", k["mainTrial"]):
        r = post(f"{E}/esearch.fcgi", {"db": "pubmed", "term": term, "retmode": "json", "retmax": 50}).json()
        ids += r["esearchresult"]["idlist"]
    k["extraPool"] = sorted({i for i in ids if i not in k["pmids"]}, key=int)[:6]
    papers.update(fetch([i for i in k["extraPool"] if i not in papers]))
    # keep only extras whose metadata really links them to the main trial
    k["extraPool"] = [i for i in k["extraPool"] if i in papers and k["mainTrial"] in papers[i]["trials"]]
    k["pmids"] = [p for p in k["pmids"] if p in papers]
    seen, dedup = set(), []
    for p in sorted(k["pmids"], key=lambda p: (papers[p]["year"] or "9999", int(p))):
        ts = trials_of(p) if p in meta else papers[p]["trials"]
        if ts and any(t in seen for t in ts): continue
        seen |= set(ts); dedup.append(p)
    k["dedup"] = [p for p in k["pmids"] if p in dedup]   # keep the retrieved order
json.dump({"papers": papers, "packets": packets}, open("packets.json", "w"), indent=0)
print("questions", len(packets), "papers", len(papers), "with >=3 extras", sum(len(k["extraPool"]) >= 3 for k in packets), "with 6", sum(len(k["extraPool"]) >= 6 for k in packets))
