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
            # New places start at Medium. Existing places retain their actual stored size.
            self.assertIn('<select id="size"><option value="Large">Large</option><option value="Medium" selected>Medium</option><option value="Small">Small</option>',html)
            self.assertIn('<select id="filterSize" aria-label="Size filter"><option value="">All sizes</option><option value="Large">Large</option><option value="Medium">Medium</option><option value="Small">Small</option>',html)
            self.assertIn("(p?\"Doesn't matter\":'Medium')",js)
            # Good is the initial visibility for new entries only; edits use their saved value.
            self.assertIn('<select id="visibility"><option value="Perfect">Perfect</option><option value="Good" selected>Good</option><option value="Bad">Bad</option><option value="Not sure">Not sure</option>',html)
            self.assertIn("$('visibility').value=p?(p.visibility||'Not sure'):'Good'",js)
            # CSV import remains compatible with previously saved Medium values.
            self.assertIn("'Large','Medium','Small'",js)
            self.assertIn("onAuthStateChanged",js)
            # Browser language affects only the display, not stored enum/CSV values.
            self.assertIn('<html lang="en">',html)
            self.assertIn('src="./i18n.mjs?v=1"',html)
            self.assertIn("from './i18n.mjs'",js)
            self.assertIn('value="Good" selected',html)
            self.assertIn('value="Medium" selected',html)
            self.assertIn("Sign in with Google using the button above",html)
            self.assertTrue((published/"i18n.mjs").is_file())
            self.assertIn("invites",js)
            self.assertNotIn('id="home"',html)
            self.assertNotIn('id="atlas"',html)
            self.assertNotIn('href="#atlas"',html)
            self.assertNotIn("from './atlas.js",js)
            self.assertNotIn("initAtlas(",js)
            self.assertNotIn(".atlasScreen",css)
            self.assertNotIn(".trendControls",css)
            # Regression: public CSS after the electoral section must survive deployment.
            self.assertNotIn('id="openGoogleMaps"',html)
            self.assertNotIn('id="exportKml"',html)
            self.assertNotIn("google-maps.mjs",js)
            self.assertNotIn(".mapsActions",css)
            self.assertFalse((published/"google-maps.mjs").exists())
            self.assertIn("header .compactToolbar .tabs",css)
            self.assertIn("header #new.compactNew",css)
            self.assertIn(".currentPositionHalo",css)
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
