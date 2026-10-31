#!/usr/bin/env python3
"""Reproduce Zaragoza province election datasets from public CC BY 4.0 CSVs.

Sources are not scraped HTML. We only publish validated aggregates and real
geometries. CERA exclusions, historical section boundaries and municipal
list-open exceptions are documented in ATLAS-DATOS.md.
"""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
import re
import tempfile
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data"
CSV_BASE = "https://mapaelectoral.es/generales-2026/descargas/"
GROUPS = ["PP", "PSOE", "VOX", "SUMAR", "CS", "UPYD", "ERC", "JUNTS", "PNV", "BILDU", "BNG", "CC", "UCD", "CDS", "OTROS"]
GROUP_LABEL = {
 "PP": "PP y coaliciones", "PSOE": "PSOE y federaciones", "VOX": "Vox",
 "SUMAR": "IU / Podemos / Sumar y confluencias", "CS": "Ciudadanos",
 "UPYD": "UPyD", "ERC": "ERC", "JUNTS": "Junts / CiU",
 "PNV": "PNV", "BILDU": "EH Bildu y antecedentes", "BNG": "BNG",
 "CC": "Coalición Canaria", "UCD": "UCD", "CDS": "CDS",
 "OTROS": "Otras candidaturas (sin bloque asignado)"}
COLORS = {
 "PP":"#2f70c4","PSOE":"#df504f","VOX":"#4a9348","SUMAR":"#9258b3",
 "CS":"#df943e","UPYD":"#cc538b","ERC":"#deb33d","JUNTS":"#5790c3",
 "PNV":"#51885b","BILDU":"#579c83","BNG":"#659dcc","CC":"#e5b95e",
 "UCD":"#a9a1a0","CDS":"#bc9b57","OTROS":"#858e9e"}
DATES={
 "2000_03":"2000-03-12", "2004_03":"2004-03-14","2008_03":"2008-03-09",
 "2011_11":"2011-11-20","2015_12":"2015-12-20","2016_06":"2016-06-26",
 "2019_04":"2019-04-28","2019_11":"2019-11-10","2023_07":"2023-07-23",
 "M2003":"2003-05-25","M2007":"2007-05-27","M2011":"2011-05-22",
 "M2015":"2015-05-24","M2019":"2019-05-26","M2023":"2023-05-28",
 "E2004":"2004-06-13","E2009":"2009-06-07","E2014":"2014-05-25",
 "E2019":"2019-05-26","E2024":"2024-06-09",
}
def process_type(code):
 if code.startswith("M"):return "municipales"
 if code.startswith("E"):return "europeas"
 return "generales"
def number(text):
 try:
  n=float(text)
  if math.isfinite(n) and n>=0 and n.is_integer():return int(n)
 except (ValueError,TypeError,OverflowError):pass
 return None
def source(path):
 return urllib.parse.urljoin(CSV_BASE,path)
def get(url,timeout=90):
 req=urllib.request.Request(url,headers={"User-Agent":"Atlas-Zaragoza/1.0 (+https://github.com/qarlosalberto/my-places)"})
 return urllib.request.urlopen(req,timeout=timeout)
def download_csv(name, temp):
 url=source(name);out=temp/name
 print("Descargando",url,flush=True)
 digest=hashlib.sha256()
 with get(url) as response, out.open("wb") as dest:
  while True:
   chunk=response.read(1024*1024)
   if not chunk:break
   digest.update(chunk);dest.write(chunk)
 print(name,out.stat().st_size,"bytes",flush=True)
 return out,{"url":url,"sha256":digest.hexdigest(),"bytes":out.stat().st_size}
def records(path):
 with path.open(newline="",encoding="utf-8-sig") as fh:
  yield from csv.DictReader(fh)
def ensure(record,key):
 n=number(record.get(key))
 if n is None:raise ValueError(f"Columna {key} ausente o no entera")
 return n
def save_json(name, obj):
 path=OUT/name
 path.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
 print("Generado",path.relative_to(ROOT),path.stat().st_size,"bytes",flush=True)
def feature_key(f,size):
 props=f.get("properties") or {}
 for key in ("id","cumun","CUSEC","cusec","CUSEC2023","CODSECC","codigo","code","tract_code","CODIGO","NATCODE"):
  value=props.get(key)
  if value is not None:
   s=str(value).strip()
   if re.fullmatch(r"\d+",s) and len(s)==size and s.startswith("50"):return s
   if size==5 and re.fullmatch(r"\d+",s) and len(s)<5:
    s=s.zfill(5)
    if s.startswith("50"):return s
 # INE section ISO identifier sometimes has code embedded in text
 for value in props.values():
  text=str(value)
  match=re.search(r"(?<!\d)(50\d{8})(?!\d)",text) if size==10 else None
  if match:return match.group(1)
 return None
def trim_coords(coords):
 if isinstance(coords,list):
  if coords and all(isinstance(v,(int,float)) for v in coords):
   return [round(v,5) for v in coords]
  return [trim_coords(v) for v in coords]
 return coords
def clean_features(raw, size):
 seen=set();good=[]
 for feature in raw:
  if not feature.get("geometry"):continue
  code=feature_key(feature,size)
  if not code or code in seen:continue
  seen.add(code)
  geom=feature["geometry"]
  if geom.get("type") not in ("Polygon","MultiPolygon"):continue
  good.append({"type":"Feature","properties":{"id":code,"name":str((feature.get("properties")or{}).get("nmun") or code)},
                "geometry":{"type":geom["type"],"coordinates":trim_coords(geom["coordinates"])}})
 return good
def geometry_municipal():
 base="https://www.ine.es/servergis/rest/services/Hosted/DIRCE_restoservicios_2025/FeatureServer/2/query"
 args={"where":"cpro='50'","outFields":"cumun,nmun,cpro","outSR":4326,
       "returnGeometry":"true","resultRecordCount":1000,"f":"geojson"}
 url=base+"?"+urllib.parse.urlencode(args)
 with get(url,timeout=120) as fh:data=json.load(fh)
 if "error" in data:raise ValueError("Error INE municipal: "+str(data["error"])[:300])
 fs=clean_features(data.get("features",[]),5)
 if len(fs)<250:raise ValueError(f"Cartografía municipal incompleta: {len(fs)} municipios")
 save_json("municipios_ine_2025.geojson",{"type":"FeatureCollection","features":fs})
 return {f["properties"]["id"] for f in fs}
def geometry_sections():
 endpoint="https://www.ine.es/geoserver/ogc/features/v1/collections/WMS_INE_SECCIONES_G01:Secciones_2023/items"
 query={"bbox":"-2.7,40.2,0.7,42.55","limit":1000,"f":"json"}
 url=endpoint+"?"+urllib.parse.urlencode(query)
 features=[];visited=set()
 for page in range(20):
  if url in visited:break
  visited.add(url)
  with get(url,timeout=120) as fh:data=json.load(fh)
  if data.get("type")!="FeatureCollection":raise ValueError("Respuesta de INE no es GeoJSON")
  features.extend(data.get("features",[]))
  nxt=next((link["href"] for link in data.get("links",[]) if link.get("rel")=="next" and link.get("href")) ,None)
  if not nxt:break
  url=urllib.parse.urljoin(url,nxt)
 else:raise ValueError("INE: paginación de secciones no acotada")
 fs=clean_features(features,10)
 if len(fs)<500:raise ValueError(f"Cartografía por sección incompleta: {len(fs)}")
 save_json("secciones_ine_2023.geojson",{"type":"FeatureCollection","features":fs})
 return {f["properties"]["id"] for f in fs}
def load_names(municipal_path):
 names={}
 for r in records(municipal_path):
  key=(r.get("mun_code") or "").strip()
  if re.fullmatch(r"50\d{3}",key):names[key]=r.get("municipio") or key
 if len(names)<250:raise ValueError(f"Se encontraron solo {len(names)} municipios de Zaragoza")
 return names
def totals_empty():
 return {"censo":0,"votantes":0,"blancos":0,"nulos":0,"candidaturas":0,
         "votes":defaultdict(int),"sections":0}
def read_long(path):
 """Group all Zaragoza sections by election and municipality in a streaming pass."""
 by_event=defaultdict(dict);by_municipality=defaultdict(dict)
 counts=defaultdict(lambda:{"read":0,"skipped":0})
 for row in records(path):
  mun=(row.get("mun_code") or "").strip();event=(row.get("eleccion") or "").strip()
  if not mun.startswith("50") or event not in DATES:continue
  counts[event]["read"]+=1
  section=(row.get("tract_code") or "").strip()
  if not re.fullmatch(r"50\d{8}",section) or not re.fullmatch(r"50\d{3}",mun):
   counts[event]["skipped"]+=1;continue
  values={k:number(row.get(k)) for k in ["censo","votantes","blancos","nulos","candidaturas",*GROUPS]}
  if any(v is None for v in values.values()) or values["votantes"]>values["censo"]:
   counts[event]["skipped"]+=1;continue
  if sum(values[g] for g in GROUPS)!=values["candidaturas"] or values["votantes"]!=values["candidaturas"]+values["blancos"]+values["nulos"]:
   counts[event]["skipped"]+=1;continue
  rec={"id":section,"name":section,"electorate":values["censo"],"voters":values["votantes"],
       "valid":values["candidaturas"]+values["blancos"],"votes":{g:values[g] for g in GROUPS if values[g]>0}}
  by_event[event][section]=rec
  municipal=by_municipality[event].setdefault(mun,totals_empty())
  for key in ("censo","votantes","blancos","nulos","candidaturas"):
   municipal[key]+=values[key]
  for g in GROUPS:municipal["votes"][g]+=values[g]
  municipal["sections"]+=1
 return by_event,by_municipality,counts
def read_wide_fallback(path,names):
 """Only historic municipalities absent from long CSVs; percentages use candidatures."""
 found=defaultdict(dict)
 for r in records(path):
  mun=(r.get("mun_code") or "").strip()
  if mun not in names:continue
  for event in DATES:
   if not (event in ("2000_03","M2003","M2007")):continue
   census=number(r.get(event+"_censo"));voters=number(r.get(event+"_votantes"))
   if census is None or voters is None or voters>census:continue
   votes={g:number(r.get(event+"_v"+g)) for g in GROUPS}
   if any(v is None for v in votes.values()):continue
   # No blanks/nuls are in this wide file: valid is the documented number
   # of votes to candidate groups, not total valid votes.
   valid=sum(votes.values())
   if valid<=0 or valid>voters:continue
   found[event][mun]={"id":mun,"name":names[mun],"electorate":census,
                       "voters":voters,"valid":valid,
                       "votes":{g:v for g,v in votes.items() if v>0}}
 return found
def write_elections(sections,municipal,counts,geom_mun,geom_sec,names,wide):
 generated=[];codes=set(geom_mun)
 for event in sorted(DATES,key=lambda x:DATES[x]):
  if DATES[event].startswith("20") is False:continue
  date_value=DATES[event]
  name={"generales":"Generales","municipales":"Municipales","europeas":"Europeas"}[process_type(event)]
  if event in municipal:
   result=[]
   for code,m in sorted(municipal[event].items()):
    if code not in codes:continue
    result.append({"id":code,"name":names.get(code,code),
     "electorate":m["censo"],"voters":m["votantes"],
     "valid":m["candidaturas"]+m["blancos"],
     "votes":{g:v for g,v in m["votes"].items() if v>0}})
   denom="votos válidos"
  else:
   result=[r for code,r in sorted(wide.get(event,{}).items()) if code in codes]
   denom="votos a candidaturas (sin blancos en fuente histórica)"
  if len(result)>=200:
   filename=f"{event}_municipios.json"
   save_json(filename,{"records":result})
   generated.append({"id":event+"_mun","type":process_type(event),"date":date_value,
    "label":f"{name} · {date_value} · municipios","level":"municipio",
    "geometry":"./data/municipios_ine_2025.geojson","file":"./data/"+filename,
    "source":"Mapa Electoral (Nacho G. del Álamo), elaboración CC BY 4.0 a partir de Ministerio del Interior e INE",
    "license":"CC BY 4.0","denominator":denom})
  sec=sections.get(event,{})
  if geom_sec and sec:
   result=[r for code,r in sorted(sec.items()) if code in geom_sec]
   if len(result)>=400:
    for r in result:r["name"]=names.get(r["id"][:5],r["id"][:5])+" · sección "+r["id"][-5:]
    filename=f"{event}_secciones.json"
    save_json(filename,{"records":result})
    generated.append({"id":event+"_sec","type":process_type(event),"date":date_value,
     "label":f"{name} · {date_value} · secciones","level":"seccion",
     "geometry":"./data/secciones_ine_2023.geojson","file":"./data/"+filename,
     "source":"Mapa Electoral (Nacho G. del Álamo), elaboración CC BY 4.0 a partir de Ministerio del Interior e INE",
     "license":"CC BY 4.0",
     "denominator":"votos válidos","boundary_note":"Seccionado INE 2023; límites anteriores pueden no coincidir"})
 return generated
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory() as t:
  temp=Path(t)
  downloads={}
  for filename in ("municipios.csv","municipios_historico.csv","resultados_secciones_largo.csv","resultados_secciones_largo_municipales_europeas.csv"):
   _,provenance=download_csv(filename,temp);downloads[filename]=provenance
  names=load_names(temp/"municipios.csv")
  sections=defaultdict(dict);municipal=defaultdict(dict);quality=defaultdict(dict)
  for filename in ("resultados_secciones_largo.csv","resultados_secciones_largo_municipales_europeas.csv"):
   sec,mun,count=read_long(temp/filename)
   for event,rows in sec.items():sections[event].update(rows)
   for event,rows in mun.items():municipal[event].update(rows)
   quality.update(count)
  wide=read_wide_fallback(temp/"municipios_historico.csv",names)
  # M2007 occurs in municipios.csv, not the historical CSV.
  w2=read_wide_fallback(temp/"municipios.csv",names)
  for event,rows in w2.items():wide[event].update(rows)
  mun_geom=geometry_municipal()
  try:sec_geom=geometry_sections()
  except Exception as exc:
   sec_geom=set()
   print("ADVERTENCIA: secciones no publicadas: "+str(exc),flush=True)
  catalog={
   "version":1,
   "description":"Resultados agregados de Zaragoza, fuentes con atribución, sin datos personales",
   "groups":[{"id":g,"label":GROUP_LABEL[g],"color":COLORS[g]} for g in GROUPS],
   "elections":write_elections(sections,municipal,quality,mun_geom,sec_geom,names,wide),
   "provenance":{"sources":downloads,"geometry_municipal":"INE ArcGIS DIRCE 2025",
                 "geometry_secciones":"INE seccionado 2023" if sec_geom else "pendiente",
                 "source_methodology":"https://mapaelectoral.es/generales-2026/metodologia.html",
                 "notes":"Mapas anteriores a 2023 usan geometrías de referencia actuales; no asumir equivalencia perfecta de secciones",
                 "long_excluded_rows":dict(quality)}}
  if len([e for e in catalog["elections"] if e["level"]=="municipio"])<8:
   raise ValueError(f"Pocas elecciones municipales/estatales publicables: {len(catalog['elections'])}")
  save_json("catalog.json",catalog)
  print("OK",len(catalog["elections"]),"capas electorales",flush=True)
if __name__=="__main__":main()
