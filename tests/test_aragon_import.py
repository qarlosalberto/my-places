"""Offline checks for Aragón electoral importer (fabricated fixtures only)."""
import unittest
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location("aragon",ROOT/"scripts/build_aragon.py")
m=module_from_spec(spec);spec.loader.exec_module(m)
class ImportTests(unittest.TestCase):
 def test_2026_date_and_source(self):
  self.assertEqual(m.DATES[2026],"2026-02-08")
  self.assertIn("ckan",m.API)
 def test_codes_keep_zeros(self):
  self.assertEqual(m.code({"cod_municipio":"50001"},False),"50001")
  self.assertEqual(m.code({"cod_mesa":"5000101001A"},True),"5000101001")
  self.assertIsNone(m.code({"cod_mesa":"2807901001U"},True))
 def test_known_parties_and_unknown_are_not_ideologically_guessed(self):
  self.assertEqual(m.group("PARTIDO SOCIALISTA OBRERO ESPAÑOL","9",2026),"PSOE")
  self.assertEqual(m.group("CHUNTA ARAGONESISTA","18",2026),"CHA")
  self.assertEqual(m.group("PARTIDO X","42",2026),"ARA_2026_42")
 def test_balanced_municipality_and_bad_row(self):
  base={"cod_elec":"CA2026","cod_municipio":"50001","nombre_m":"Abanto",
        "electores_m":"100","votantes_m":"70","validos_m":"69",
        "candidatura_m":"67","blancos_m":"2","nulos_m":"1"}
  parties=[{"cod_elec":"CA2026","cod_municipio":"50001","nombre_par":"PARTIDO POPULAR","cod_par":"1","votos_m":"40"},
           {"cod_elec":"CA2026","cod_municipio":"50001","nombre_par":"PARTIDO SOCIALISTA OBRERO ESPAÑOL","cod_par":"9","votos_m":"27"}]
  result,quality=m.assemble([base],parties,2026,False,{"50001"},{} )
  self.assertEqual(len(result),1)
  self.assertEqual(result[0]["votes"]["PSOE"],27)
  self.assertEqual(result[0]["valid"],69)
  bad=base.copy();bad["votantes_m"]="68"
  result,quality=m.assemble([bad],parties,2026,False,{"50001"},{})
  self.assertEqual(result,[])
  self.assertEqual(quality["totals"],1)
 def test_mesas_aggregate_to_one_section(self):
  def mesa(letter,number):
   return {"cod_elec":"CA2026","cod_mesa":"5000101001"+letter,"municipio":"Abanto",
           "electores_e":"100","votantes_e":"70","validos_e":"69",
           "candidatura_e":"67","blancos_e":"2","nulos_e":"1"}
  p=[{"cod_elec":"CA2026","cod_mesa":"5000101001"+letter,"nombre_par":"PARTIDO POPULAR","cod_par":"1","votos_e":"67"} for letter in ("A","B")]
  r,q=m.assemble([mesa("A",70),mesa("B",70)],p,2026,True,{"5000101001"},{})
  self.assertEqual(len(r),1)
  self.assertEqual(r[0]["electorate"],200)
  self.assertEqual(r[0]["votes"]["PP"],134)
if __name__=="__main__":unittest.main()
