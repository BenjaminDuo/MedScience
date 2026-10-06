import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Upstream trial of every retrieved paper, from public metadata only:
#   1. PubMed DataBank links to ClinicalTrials.gov (curated by NLM), and
#   2. NCT ids written in the title or abstract.
# Publication types are kept so reviews and meta-analyses can be reported apart.
import json, re, time, requests
import xml.etree.ElementTree as ET
data = json.load(open("retrieved.json"))
pmids = sorted({p["pmid"] for q in data for p in q["papers"] if p["pmid"]})
NCT = re.compile(r"NCT\d{8}", re.I)
meta = {}
for i in range(0, len(pmids), 150):
    chunk = pmids[i:i + 150]
    for k in range(6):
        try:
            r = requests.post("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
                              data={"db": "pubmed", "id": ",".join(chunk), "retmode": "xml"}, timeout=120)
            if r.status_code == 200: break
        except Exception: pass
        time.sleep(5 * (k + 1))
    root = ET.fromstring(r.content)
    for art in root.findall(".//PubmedArticle"):
        pmid = art.findtext(".//MedlineCitation/PMID")
        bank = {a.text.upper() for db in art.findall(".//DataBank") if (db.findtext("DataBankName") or "").lower().startswith("clinicaltrials")
                for a in db.findall(".//AccessionNumber") if a.text}
        text = " ".join(t.text or "" for t in art.findall(".//ArticleTitle") + art.findall(".//AbstractText"))
        mentioned = {m.upper() for m in NCT.findall(text)}
        ptypes = [t.text for t in art.findall(".//PublicationType")]
        meta[pmid] = {"databank": sorted(bank), "mentioned": sorted(mentioned), "pubTypes": ptypes}
    time.sleep(0.4)
json.dump(meta, open("paper_sources.json", "w"), indent=0)
print("papers with pmid", len(pmids), "fetched", len(meta),
      "linked to a trial", sum(1 for m in meta.values() if m["databank"] or m["mentioned"]))
