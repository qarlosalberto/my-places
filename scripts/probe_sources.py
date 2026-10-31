#!/usr/bin/env python3
"""Print schema of official datasets, never raw user data; diagnostic only."""
import json
import urllib.request
from urllib.parse import urlencode

cases=[
 (94, {"cod_elec":"CA2023","cod_provincia":"50"}),
 (95, {"cod_elec":"CA2023","cod_provincia":"50"}),
 (378,{"cod_elec":"CA2023","cod_provincia":"50"}),
 (379,{"cod_elec":"CA2023","cod_provincia":"50"}),
]
for resource_id, filters in cases:
    url="https://opendata.aragon.es/GA_OD_Core/download?"+urlencode({"resource_id":resource_id,"formato":"json","filters":json.dumps(filters)})
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 AtlasElectoralZaragoza/1.0"})
    try:
        with urllib.request.urlopen(req,timeout=12) as f:
            raw=f.read(12000)
            print("RESOURCE",resource_id,"status",f.status,"type",f.headers.get("Content-Type"),"bytes",len(raw),flush=True)
        txt=raw.decode("utf-8-sig",errors="replace")
        if txt.startswith("[{"):
            obj,_=json.JSONDecoder().raw_decode(txt[1:])
            print("ROW",resource_id,repr(obj)[:2000],flush=True)
        else:
            print("PREFIX",resource_id,txt[:400],flush=True)
    except Exception as e:
        print("SOURCE ERROR",resource_id,str(e)[:250],flush=True)
