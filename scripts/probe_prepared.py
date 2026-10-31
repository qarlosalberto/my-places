#!/usr/bin/env python3
"""Quickly inspect reusable election CSV data and INE geographic API."""
from urllib.request import urlopen, Request
import csv, io, json
BASE="https://mapaelectoral.es/generales-2026/descargas/"
for name in ["municipios.csv","secciones.csv","resultados_secciones_largo.csv","secciones_municipales_europeas.csv","resultados_secciones_largo_municipales_europeas.csv","municipios_historico.csv"]:
 try:
  with urlopen(Request(BASE+name,headers={"User-Agent":"Mozilla/5.0"}), timeout=24) as response: sample=response.read(6000).decode("utf-8-sig","replace")
  print("CSV",name,"header",next(csv.reader(io.StringIO(sample)))[:45],flush=True)
  print("FIRST_LINE",name,sample.splitlines()[1][:700] if len(sample.splitlines())>1 else "?",flush=True)
 except Exception as exc:print("CSV ERROR",name,str(exc),flush=True)
for url in ["https://www.ine.es/geoserver/ogc/features/v1/collections?f=json",
"https://www.ine.es/servergis/rest/services/Hosted/DIRCE_restoservicios_2025/FeatureServer/2?f=json"]:
 try:
  with urlopen(Request(url,headers={"User-Agent":"Mozilla/5.0"}),timeout=20) as response: data=json.load(response)
  print("GIS",url,"keys",list(data)[:20],flush=True)
  if "collections" in data: print("GIS COLLECTIONS",[(v.get("id"),v.get("title")) for v in data["collections"][:5]],flush=True)
  else:print("GIS FIELDS",[x.get("name") for x in data.get("fields",[])][:50],flush=True)
 except Exception as exc:print("GIS ERROR",str(exc),flush=True)
