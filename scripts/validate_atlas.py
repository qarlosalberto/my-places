#!/usr/bin/env python3
"""Comprueba un catálogo público de resultados electorales, sin datos ficticios."""
from __future__ import annotations
import json
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
TYPES = {"generales", "autonomicas", "municipales", "europeas"}
LEVELS = {"provincia", "municipio", "distrito", "seccion"}

def check(condition, message):
    if not condition:
        raise ValueError(message)

def load(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)

def local_file(url):
    check(isinstance(url, str) and url.startswith("./data/"), f"Ruta inválida: {url}")
    path = (ROOT / "site" / url.removeprefix("./")).resolve()
    check(path.is_relative_to(DATA.resolve()), f"Ruta fuera de site/data: {url}")
    check(path.is_file(), f"Archivo no encontrado: {url}")
    return path

def number(value, name):
    check(isinstance(value, int) and not isinstance(value, bool) and value >= 0,
          f"{name}: entero no negativo obligatorio")

def main():
    catalog = load(DATA / "catalog.json")
    groups = catalog.get("groups")
    elections = catalog.get("elections")
    check(isinstance(groups, list) and isinstance(elections, list), "Catálogo incorrecto")
    group_ids = set()
    for group in groups:
        check(isinstance(group.get("id"), str) and group["id"], "Grupo sin id")
        check(group["id"] not in group_ids, "Grupo duplicado")
        group_ids.add(group["id"])
        check(group.get("label"), "Grupo sin etiqueta")
    event_ids = set()
    for event in elections:
        event_id = event.get("id")
        check(isinstance(event_id, str) and event_id and event_id not in event_ids,
              f"Elección duplicada o inválida: {event_id}")
        event_ids.add(event_id)
        check(event.get("type") in TYPES, f"Tipo no admitido: {event_id}")
        check(event.get("level") in LEVELS, f"Nivel no admitido: {event_id}")
        check(bool(event.get("source")) and bool(event.get("license")), f"Fuente/licencia ausentes: {event_id}")
        election_date = date.fromisoformat(event["date"])
        check(election_date.year >= 2000, f"Fecha anterior al alcance: {event_id}")
        results = load(local_file(event["file"]))
        geo = load(local_file(event["geometry"]))
        check(isinstance(results.get("records"), list), f"Resultados incorrectos: {event_id}")
        check(geo.get("type") == "FeatureCollection", f"GeoJSON incorrecto: {event_id}")
        features = geo.get("features", [])
        ids = set()
        for f in features:
            p = f.get("properties", {})
            fid = str(p.get("id", p.get("code", p.get("territory_id", ""))))
            check(bool(fid) and fid not in ids, f"Geometría sin id o duplicada: {event_id} {fid}")
            ids.add(fid)
        rows = set()
        for r in results["records"]:
            rid = r.get("id")
            check(isinstance(rid, str) and rid and rid not in rows, f"Resultado sin id o duplicado: {event_id}")
            rows.add(rid)
            for name in ("electorate", "voters", "valid"):
                number(r.get(name), f"{event_id}/{rid}/{name}")
            check(r["voters"] <= r["electorate"] and r["valid"] <= r["voters"],
                  f"Cuadre de participación inválido: {event_id}/{rid}")
            votes = r.get("votes")
            check(isinstance(votes, dict), f"Votos incorrectos: {event_id}/{rid}")
            check(set(votes).issubset(group_ids), f"Grupo sin documentar: {event_id}/{rid}")
            for group, votes_count in votes.items():
                number(votes_count, f"{event_id}/{rid}/{group}")
            check(sum(votes.values()) <= r["valid"], f"Votos superiores a válidos: {event_id}/{rid}")
        check(bool(rows & ids), f"Sin resultados que coincidan con la cartografía: {event_id}")
        print(f"OK {event_id}: {len(rows)} territorios, {len(ids)} geometrías")
    print(f"Catálogo válido: {len(elections)} elecciones. Sin resultados de ejemplo.")

if __name__ == "__main__":
    main()
