#!/usr/bin/env python3
"""Create GitHub Pages artifact containing only the markers application.

Electoral modules, maps, historical data and UI remain versioned in GitHub
but are intentionally NOT included in the published Pages artifact.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
PUBLIC_FILES = (
    "index.html",
    "app.js",
    "style.css",
    "favicon.svg",
    "manifest.webmanifest",
    "firebase-config-v2.js",
)
ELECTORAL_CSS_MARKER = "/* Public landing + separate atlas. Existing My Places styles remain unchanged. */"

def build_public_site(destination: Path) -> None:
    target = destination.resolve()
    if target == SITE.resolve() or target == ROOT.resolve() or target == ROOT.parent.resolve():
        raise ValueError("No se puede sobrescribir el repositorio o la carpeta site")
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for name in PUBLIC_FILES:
        source = SITE / name
        if not source.is_file():
            raise FileNotFoundError(source)
        shutil.copy2(source, target / name)

    stylesheet = (target / "style.css").read_text(encoding="utf-8")
    if ELECTORAL_CSS_MARKER in stylesheet:
        stylesheet = stylesheet.split(ELECTORAL_CSS_MARKER, 1)[0]
        (target / "style.css").write_text(stylesheet, encoding="utf-8")

    html = (target / "index.html").read_text(encoding="utf-8")
    js = (target / "app.js").read_text(encoding="utf-8")
    if any(fragment in html for fragment in ('id="atlas"', 'id="home"', 'href="#atlas"', 'data-atlas-tab=')):
        raise ValueError("La interfaz electoral no debe aparecer en el HTML público")
    if any(fragment in js for fragment in ("initAtlas(", "showAtlas(", "updateAtlasPlaces(", "from './atlas.js", 'from "./atlas.js')):
        raise ValueError("La aplicación de marcadores no debe importar el atlas")
    if 'id="dashboard"' not in html or 'id="login"' not in html:
        raise ValueError("Falta la aplicación de marcadores o el inicio de sesión")
    forbidden = ("atlas.js", "trends.js", "data", "catalog.json")
    if any((target / item).exists() for item in forbidden):
        raise ValueError("Un recurso del atlas electoral se ha incluido en el despliegue")
    print("Sitio público: marcadores, inicio de sesión y sus recursos estáticos únicamente.")
    print("Atlas electoral y sus datos conservados en GitHub, excluidos del despliegue.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "_public")
    build_public_site(parser.parse_args().output)
