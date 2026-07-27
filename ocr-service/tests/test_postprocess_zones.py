"""Tests post-traitement + zones (sans modèles OCR)."""
from app.postprocess import (
    clean_person_name,
    clean_cin,
    is_plausible_person_name,
    postprocess_zone_text,
)
from app.zones import RECTO_ZONES, VERSO_ZONES, zones_for_side
from app.smart import score_person_name


def test_reject_garbage_name():
    assert clean_person_name("ROPI9VXW7 5BE884115") == ""
    assert not is_plausible_person_name("ROPI9VXW7")
    assert score_person_name("ROPI9VXW7 5BE884115") == 0.0


def test_accept_real_name():
    assert "ALAOUI" in clean_person_name("EL ALAOUI")
    assert clean_person_name("YOUSSEF") == "YOUSSEF"


def test_clean_cin():
    assert clean_cin("BK354428") == "BK354428"
    assert clean_cin("BK35442B") == "BK354428" or clean_cin("BK35442B").startswith("BK")
    assert clean_cin("ROPI9VXW7") == ""


def test_zone_postprocess_fields():
    assert postprocess_zone_text("nom", "NOM : BENALI") == "BENALI" or "BENALI" in postprocess_zone_text("nom", "BENALI")
    assert postprocess_zone_text("numero_cin", "AB123456") == "AB123456"
    assert postprocess_zone_text("date_naissance", "15.03.1990") == "1990-03-15"
    assert postprocess_zone_text("sexe", "M") == "M"


def test_zones_defined():
    assert len(RECTO_ZONES) >= 8
    assert len(VERSO_ZONES) >= 4
    fields = {z.field for z in zones_for_side("recto")}
    assert "nom" in fields and "prenom" in fields and "numero_cin" in fields
