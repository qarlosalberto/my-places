#!/usr/bin/env python3
"""Read-only diagnostic; prints schema names, never raw personal data."""
import json
import urllib.request
from urllib.parse import urlencode

for resource_id in (90, 91, 94, 95, 378, 379):
    query={"resource_id":resource_id,"formato":"json"}
    if resource_id in (378,379):
        query["filters"]='{"cod_elec":"CA2023"}'
    url="https://opendata.aragon.es/GA_OD_Core/download?"+urlencode(query)
    req=urllib.request.Request(url,headers={"User-Agent":"AtlasElectoralZaragoza/1.0 (+github.com/qarlosalberto/my-places)"})
    try:
        with urllib.request.urlopen(req,timeout=22) as f:
            raw=f.read(80000)
            print("RESOURCE",resource_id,"status",f.status,"type",f.headers.get("Content-Type"),"sample_bytes",len(raw))
        text=raw.decode('utf-8-sig',errors='replace')
        try:
            value=json.loads(text)
            print("ROOT",type(value).__name__,"keys",list(value)[:20] if isinstance(value,dict) else "len="+str(len(value)))
            row=value[0] if isinstance(value,list) and value else next((v[0] for v in value.values() if isinstance(v,list) and v),None) if isinstance(value,dict) else None
            if isinstance(row,dict):print("ROW KEYS",list(row)[:40])
            else:print("PREFIX",text[:220].replace("\n"," "))
        except Exception as e:
            print("PARTIAL JSON","prefix",text[:220].replace("\n"," "),str(e)[:100])
    except Exception as e:
        print("RESOURCE",resource_id,"ERROR",str(e)[:220])
