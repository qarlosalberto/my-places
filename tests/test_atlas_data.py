import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location("validator", ROOT / "scripts/validate_atlas.py")
validator = module_from_spec(spec)
spec.loader.exec_module(validator)

class AtlasDataTests(unittest.TestCase):
    def test_catalog_uses_real_elections_or_empty_state(self):
        data = json.loads((ROOT / "site/data/catalog.json").read_text(encoding="utf-8"))
        self.assertIsInstance(data["elections"], list)
        self.assertIsInstance(data["groups"], list)
        for election in data["elections"]:
            self.assertTrue(election.get("source"))
            self.assertTrue(election.get("license"))

    def test_reject_traversal(self):
        with self.assertRaises(ValueError):
            validator.local_file("./data/../../../firestore.rules")

    def test_reject_external_http(self):
        with self.assertRaises(ValueError):
            validator.local_file("https://example.com/results.json")

    def test_integer_not_bool(self):
        with self.assertRaises(ValueError):
            validator.number(True, "censo")

    def test_valid_integer(self):
        validator.number(0, "censo")
        validator.number(500, "votos")

    def test_validator_runs(self):
        validator.main()

    def test_security_rule_user_scope(self):
        rules=(ROOT / "firestore.rules").read_text(encoding="utf-8")
        self.assertIn("request.auth.uid == uid",rules)
        self.assertIn("allow read, write: if invited()",rules)
        self.assertIn("allow list, write: if false",rules)

if __name__=="__main__":
    unittest.main()
