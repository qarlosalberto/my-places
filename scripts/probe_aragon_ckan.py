#!/usr/bin/env python3
"""Read-only schema diagnostics for Aragón's public CKAN electoral datasets."""
import json, urllib.parse, urllib.request
ORIGINS=["https://opendata.aragon.es/ckan/api/3/action/","https://opendata.aragon.es/api/3/action/"]
def get(action,query,timeout=14):
 for origin in ORIGINS:
  url=origin+action+"?"+urllib.parse.urlencode(query)
  try:
   request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 AtlasElectoralZaragoza/1.0"})
   with urllib.request.urlopen(request,timeout=timeout) as f:
    payload=json.load(f)
   if payload.get("success"):return payload.get("result"),url
   print("CKAN unsuccessful",origin,str(payload)[:250],flush=True)
  except Exception as e:print("CKAN failure",action,origin,str(e)[:120],flush=True)
 return None,None
for package in ["elecciones-a-cortes-de-aragon-ano-2026-detalle-distrito-mesa-electoral","resultados-electorales-agrupados-a-escala-municipal-historico"]:
 data,url=get("package_show",{"id":package})
 print("PACKAGE",package,"found",bool(data),"url",url,flush=True)
 if data:
  for item in data.get("resources",[]):
   if item.get("format","").upper() in ("CSV","JSON"):
    print("RESOURCE",item.get("id"),item.get("name","")[:80],item.get("format"),(item.get("url") or "")[:190],flush=True)
for uid in ["52eabfe1-57df-4881-8a1c-7a764f61729a","8ff0dfea-bafd-4af3-96be-8a7da6808268"]:
 for f in [None,{"cod_municipio":"50001"}]:
  params={"resource_id":uid,"limit":2}
  if f:params["filters"]=json.dumps(f)
  data,url=get("datastore_search",params)
  print("DATASTORE",uid,"filter",f,"found",bool(data),"count",data.get("total") if data else None,"keys",list(data) if data else None,flush=True)
  if data:
   print("FIELDS",[x.get("id") for x in data.get("fields",[])],"ROWS",str(data.get("records",[]))[:1500],flush=True)
