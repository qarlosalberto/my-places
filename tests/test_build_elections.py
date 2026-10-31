"""Unit tests for the ETL using only synthetic records."""
import csv
import tempfile
import unittest
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location("build_elections",ROOT/"scripts/build_elections.py")
etl=module_from_spec(spec)
spec.loader.exec_module(etl)

class BuildTests(unittest.TestCase):
    def test_election_type_and_fallback_dates(self):
        self.assertEqual(etl.process_type("E2024"),"europeas")
        self.assertEqual(etl.process_type("M2023"),"municipales")
        self.assertEqual(etl.process_type("2023_07"),"generales")
        self.assertIn("M2023",etl.DATES)

    def test_feature_key_keeps_zero_padded_ids(self):
        self.assertEqual(etl.feature_key({"properties":{"cumun":"50001"}},5),"50001")
        self.assertEqual(etl.feature_key({"properties":{"tract_code":"5000101001"}},10),"5000101001")
        self.assertIsNone(etl.feature_key({"properties":{"cumun":"28079"}},5))

    def test_numeric_parser_rejects_floats_and_negative_values(self):
        self.assertEqual(etl.number("70.0"),70)
        self.assertIsNone(etl.number("-1"))
        self.assertIsNone(etl.number("4.5"))
        self.assertIsNone(etl.number("nan"))

    def test_long_csv_rejects_inconsistent_turnout(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"rows.csv"
            fields=["tract_code","mun_code","eleccion","censo","votantes","blancos","nulos","candidaturas",*etl.GROUPS]
            good={"tract_code":"5000101001","mun_code":"50001","eleccion":"2023_07",
                  "censo":"100","votantes":"70","blancos":"2","nulos":"1","candidaturas":"67",
                  **{g:"0" for g in etl.GROUPS}}
            good["PP"]="40";good["PSOE"]="27"
            bad=good.copy();bad["tract_code"]="5000101002";bad["votantes"]="69"
            with p.open("w",encoding="utf-8",newline="") as f:
                writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows([good,bad])
            by_sections,by_mun,stats=etl.read_long(p)
            self.assertEqual(len(by_sections["2023_07"]),1)
            self.assertEqual(stats["2023_07"]["skipped"],1)
            self.assertEqual(by_mun["2023_07"]["50001"]["censo"],100)
            self.assertEqual(by_mun["2023_07"]["50001"]["votes"]["PSOE"],27)

    def test_catalog_has_real_results_when_populated(self):
        import json
        data=json.loads((ROOT/"site/data/catalog.json").read_text(encoding="utf-8"))
        if not data["elections"]:
            self.skipTest("No populated catalogue checked out")
        self.assertTrue(any(e["type"]=="generales" for e in data["elections"]))
        self.assertTrue(any(e["type"]=="municipales" for e in data["elections"]))
        self.assertTrue(any(e["type"]=="europeas" for e in data["elections"]))
        self.assertTrue(all(e.get("source") and e.get("license") for e in data["elections"]))
if __name__=="__main__":unittest.main()
