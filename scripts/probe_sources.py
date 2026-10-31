#!/usr/bin/env python3
"""Minimal official data schema probe. Prints only public aggregated metadata."""
import json
from urllib.request import Request, urlopen
for n in (94, 95):
    u=f"https://opendata.aragon.es/GA_OD_Core/download?resource_id={n}&formato=json"
    try:
        req=Request(u,headers={"User-Agent":"Mozilla/5.0"})
        with urlopen(req,timeout=70) as response:
            raw=response.read(12000)
            print("RESOURCE",n,"http",response.status,"bytes",len(raw),flush=True)
        text=raw.decode("utf-8-sig")
        if text.startswith("[{"):
            first,_=json.JSONDecoder().raw_decode(text[1:])
            print("FIRST RECORD",n,json.dumps(first,ensure_ascii=False)[:4000],flush=True)
        else:print("UNEXPECTED",n,text[:300],flush=True)
    except Exception as e:print("ERROR",n,str(e),flush=True)
