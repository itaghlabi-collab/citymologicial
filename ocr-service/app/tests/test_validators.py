"""Tests validation métier — aucune vraie CIN complète."""
from app.services.validators import (
    validate_cin,
    validate_person_name,
    validate_nationalite,
    validate_date,
    validate_dates_pair,
)


def test_cin_valide():
    v, ok = validate_cin("AB123456")
    assert ok and v == "AB123456"


def test_cin_parasite_rejete():
    v, ok = validate_cin("ROPI9VXW7 5BE884115")
    assert not ok and v is None


def test_nom_valide():
    v, ok = validate_person_name("EL ALAOUI")
    assert ok and "ALAOUI" in v


def test_nom_chiffres_rejete():
    v, ok = validate_person_name("ROPI9VXW7")
    assert not ok and v is None


def test_nom_contenant_cin_rejete():
    v, ok = validate_person_name("AB123456")
    assert not ok


def test_prenom_vide():
    v, ok = validate_person_name("")
    assert not ok and v is None


def test_dates_valides():
    v, ok = validate_date("15/03/1990", "naissance")
    assert ok and v == "1990-03-15"


def test_date_future_naissance():
    v, ok = validate_date("01/01/2099", "naissance")
    assert not ok


def test_expiration_avant_delivrance():
    pair = validate_dates_pair(None, "2020-01-01", "2019-01-01")
    assert pair["date_expiration"][1] is False


def test_nationalite_invalide_a():
    v, ok = validate_nationalite("À")
    assert not ok and v is None


def test_nationalite_marocaine():
    v, ok = validate_nationalite("MAROCAINE")
    assert ok and v == "Marocaine"


def test_nationalite_vide():
    v, ok = validate_nationalite("")
    assert not ok and v is None
