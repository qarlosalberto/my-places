"""Deployment regression: electoral source stays in GitHub, but not in Pages output."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("public_builder",ROOT/"scripts"/"build_public_site.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class PublicSiteTests(unittest.TestCase):
    def test_published_files_contain_only_markers(self):
        with tempfile.TemporaryDirectory() as tmp:
            published=Path(tmp)/"pages"
            mod.build_public_site(published)
            names={p.name for p in published.iterdir()}
            self.assertEqual(names,set(mod.PUBLIC_FILES))
            html=(published/"index.html").read_text(encoding="utf8")
            js=(published/"app.js").read_text(encoding="utf8")
            css=(published/"style.css").read_text(encoding="utf8")
            self.assertIn('id="dashboard"',html)
            self.assertIn('id="login"',html)
            self.assertIn('id="map"',html)
            self.assertIn("onAuthStateChanged",js)
            self.assertIn("invites",js)
            self.assertNotIn('id="home"',html)
            self.assertNotIn('id="atlas"',html)
            self.assertNotIn('href="#atlas"',html)
            self.assertNotIn("from './atlas.js",js)
            self.assertNotIn("initAtlas(",js)
            self.assertNotIn(".atlasScreen",css)
            self.assertNotIn(".trendControls",css)
            self.assertFalse((published/"data").exists())
            self.assertFalse((published/"atlas.js").exists())
            self.assertFalse((published/"trends.js").exists())

    def test_original_electoral_files_and_data_are_kept(self):
        for rel in ("site/atlas.js","site/trends.js","site/data/catalog.json","ATLAS-DATOS.md"):
            self.assertTrue((ROOT/rel).is_file(),rel)
        self.assertGreater((ROOT/"site/data/catalog.json").stat().st_size,1000)

    def test_prevent_removing_source_site(self):
        with self.assertRaises(ValueError):
            mod.build_public_site(ROOT/"site")

if __name__=="__main__":
    unittest.main()
