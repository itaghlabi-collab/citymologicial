"""Tests extracteur / confiance."""
from app.services.confidence import combine_confidence, make_field
from app.services.validators import validate_person_name


def test_confidence_zero_si_invalide():
    fr = make_field(None, valid=False, ocr_score=0.99)
    assert fr.valid is False
    assert fr.value is None
    assert fr.confidence == 0


def test_confidence_combine():
    c = combine_confidence(0.95, True, zone_ok=True, variant_agree=1.0)
    assert c >= 0.90


def test_parasite_name_not_filled():
    v, ok = validate_person_name("ROPI9VXW7 5BE884115")
    fr = make_field(v, valid=ok, ocr_score=0.99)
    assert fr.valid is False
    assert fr.value is None
