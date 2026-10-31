#!/usr/bin/env python3
"""Public Aragón elections (CC BY 4.0), CKAN -> validated municipal/section JSON."""
import collections, datetime, hashlib, json, re, time, unicodedata
import urllib.request, urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"site/data"
API="https://opendata.aragon.es/ckan/api/3/action/datastore_search"
R={"old":"51320233-f534-422e-aec6-e785813f6156","old_votes":"12fd36be-a741-49d8-a09f-64299a418ee0",
   "2026":"52eabfe1-57df-4881-8a1c-7a764f61729a","2026_votes":"7a6c552e-3943-4cf4-b916-52cf8d7b6091",
   "2026_mesas":"92e816bf-5041-4749-bd87-745ce8c0ed1a","2026_mesa_votes":"9417e6d5-90a0-47c9-ada2-bfb404feb368"}
DATES={2003:"2003-05-25",2007:"2007-05-27",2011:"2011-05-22",2015:"2015-05-24",
       2019:"2019-05-26",2023:"2023-05-28",2026:"2026-02-08"}
def number(x):
 try:
  v=float(x)
  return int(v) if v>=0 and v.is_integer() else None
 except (ValueError,TypeError,OverflowError):return None
def normalize(s):
 return "".join(c for c in unicodedata.normalize("NFKD",str(s or "").upper()) if not unicodedata.combining(c))
def group(name,code,year):
 n=normalize(name).strip()
 if n=="PARTIDO POPULAR" or n=="PP":return "PP"
 if n.startswith("PARTIDO SOCIALISTA OBRERO ESPANOL"):return "PSOE"
 if n=="VOX":return "VOX"
 if n=="CHUNTA ARAGONESISTA":return "CHA"
 if n=="PARTIDO ARAGONES":return "PAR"
 if n.startswith("CIUDADANOS"):return "CS"
 if n.startswith("IZQUIERDA UNIDA") or n.startswith("IU-"):return "ARA_IU"
 if "PODEMOS" in n:return "ARA_PODEMOS"
 if "SUMAR" in n:return "ARA_SUMAR"
 key=re.sub("[^0-9A-Za-z]","",str(code or ""))
 if not key:raise ValueError("Candidatura sin identificador")
 return f"ARA_{year}_{key[:16]}"
def fetch(uid):
 rows=[];offset=0;total=None;step=2000
 while total is None or offset<total:
  uri=API+"?"+urllib.parse.urlencode({"resource_id":uid,"limit":step,"offset":offset})
  for retry in range(4):
   try:
    req=urllib.request.Request(uri,headers={"User-Agent":"Mozilla/5.0 AtlasElectoralZaragoza/1.0"})
    with urllib.request.urlopen(req,timeout=80) as conn:data=json.load(conn)
    assert data["success"]
    chunk=data["result"]["records"];total=data["result"]["total"]
    if not chunk and offset<total:raise ValueError("Página vacía")
    rows.extend(chunk);offset+=len(chunk)
    print(uid,offset,total,flush=True);break
   except Exception as ex:
    if retry==3:raise RuntimeError(f"{uid} offset {offset}: {ex}") from ex
    print("Reintentando",uid,offset,str(ex)[:100],flush=True);time.sleep(2+retry*3)
 if len(rows)!=total:raise ValueError("Datos incompletos")
 return rows
def code(row,section):
 raw=str(row.get("cod_mesa" if section else "cod_municipio") or "")
 if section:
  m=re.match(r"^(50\d{8})[A-Z0-9]*$",raw)
  return m.group(1) if m else None
 return raw if re.fullmatch(r"50\d{3}",raw) else None
def assemble(participants,parties,year,section,geometry,groups):
 election=f"CA{year}";sfx="e" if section else "m";measures=collections.defaultdict(lambda:collections.Counter())
 names={};skip=collections.Counter();votes=collections.defaultdict(lambda:collections.Counter())
 party_names={}
 for r in parties:
  if r.get("cod_elec")!=election:continue
  k=code(r,section);v=number(r.get(f"votos_{sfx}"))
  if k is None or v is None:continue
  p=group(r.get("nombre_par"),r.get("cod_par"),year)
  votes[k][p]+=v
  party_names[p]=str(r.get("nombre_par") or p)
  if p not in groups:
   hue=int(hashlib.sha256(p.encode()).hexdigest()[:5],16)%360
   groups[p]={"id":p,"label":party_names[p],"color":f"hsl({hue} 48% 44%)"}
 for r in participants:
  if r.get("cod_elec")!=election:continue
  k=code(r,section)
  if k not in geometry:skip["geography"]+=1;continue
  v={name:number(r.get(field)) for name,field in [
   ("electorate",f"electores_{sfx}"),("voters",f"votantes_{sfx}"),("valid",f"validos_{sfx}"),
   ("candidates",f"candidatura_{sfx}"),("blank",f"blancos_{sfx}"),("null",f"nulos_{sfx}")]}
  if None in v.values():skip["missing"]+=1;continue
  if v["voters"]>v["electorate"] or v["valid"]+v["null"]!=v["voters"] or v["candidates"]+v["blank"]!=v["valid"]:
   skip["totals"]+=1;continue
  measures[k].update(v)
  names[k]=str(r.get("municipio" if section else "nombre_m") or k)
 result=[]
 for k,r in sorted(measures.items()):
  v=votes.get(k,collections.Counter())
  if sum(v.values())!=r["candidates"]:skip["party_balance"]+=1;continue
  result.append({"id":k,"name":names[k]+(" · sección "+k[-5:] if section else ""),
     "electorate":r["electorate"],"voters":r["voters"],"valid":r["valid"],
     "votes":{p:n for p,n in sorted(v.items()) if n>0}})
 print(election,"secciones" if section else "municipios",len(result),"excluidos",dict(skip),flush=True)
 return result,dict(skip)
def main():
 catalog=json.loads((OUT/"catalog.json").read_text(encoding="utf8"))
 groups={g["id"]:g for g in catalog["groups"]}
 elections={e["id"]:e for e in catalog["elections"]}
 geometries={}
 for level,filename in [("municipio","municipios_ine_2025.geojson"),("seccion","secciones_ine_2023.geojson")]:
  geo=json.loads((OUT/filename).read_text(encoding="utf8"))
  geometries[level]={str(f["properties"]["id"]) for f in geo["features"]}
 records={key:fetch(uid) for key,uid in R.items()}
 quality={}
 for year,date in DATES.items():
  for level in (["municipio","seccion"] if year==2026 else ["municipio"]):
   section=level=="seccion"
   pk="2026_mesas" if section else ("2026" if year==2026 else "old")
   vk="2026_mesa_votes" if section else ("2026_votes" if year==2026 else "old_votes")
   data,skipped=assemble(records[pk],records[vk],year,section,geometries[level],groups)
   if len(data)<(330 if section else 200):raise ValueError(f"CA{year} {level}: solo {len(data)} registros válidos")
   filename=f"CA{year}_{level}.json"
   (OUT/filename).write_text(json.dumps({"records":data},ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n",encoding="utf8")
   eid=f"CA{year}_{'sec' if section else 'mun'}"
   elections[eid]={"id":eid,"type":"autonomicas","date":date,
     "label":f"Autonómicas Aragón · {date} · {level}",
     "level":level,"file":"./data/"+filename,
     "geometry":"./data/secciones_ine_2023.geojson" if section else "./data/municipios_ine_2025.geojson",
     "source":"Gobierno de Aragón (Aragón Open Data, CKAN)",
     "license":"CC BY 4.0","denominator":"votos válidos",
     "boundary_note":"Secciones INE 2023: no se garantiza equivalencia histórica" if section else "Municipios INE 2025"}
   quality[eid]={"included":len(data),"rejected":skipped,"participation_resource":R[pk],"party_resource":R[vk]}
 catalog["groups"]=list(groups.values())
 catalog["elections"]=sorted(elections.values(),key=lambda e:(e["date"],e["type"],e["level"]))
 catalog.setdefault("provenance",{})["autonomicas_aragon"]={"ckan":"https://opendata.aragon.es/ckan",
   "downloaded":datetime.datetime.now(datetime.timezone.utc).isoformat(),"resources":R,"quality":quality}
 (OUT/"catalog.json").write_text(json.dumps(catalog,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n",encoding="utf8")
 print("IMPORTACIÓN ARAGÓN",len(quality),"CAPAS; TOTAL",len(catalog["elections"]),flush=True)
if __name__=="__main__":main()
