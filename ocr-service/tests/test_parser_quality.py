"""Tests unitaires parser + qualité (sans modèles lourds)."""
import numpy as np
import cv2

from app.parser import (
    parse_ocr_text,
    merge_side_fields,
    normalize_cin,
    plausible_cin,
    parse_date_token,
)
from app.quality import assess_image_quality, images_probably_identical


SAMPLE_RECTO = """
ROYAUME DU MAROC
CARTE NATIONALE D IDENTITE
NOM : EL ALAOUI
PRENOM : YOUSSEF
NE LE : 15.03.1990
A : CASABLANCA
SEXE : M
NATIONALITE : MAROCAINE
CIN BK354428
VALABLE JUSQU AU 20.11.2030
"""

SAMPLE_VERSO = """
I<MARELALAOUI<<YOUSSEF<<<<<<<<<<<<<<<<
BK354428<9003151M3011205MAR<<<<<<<<<<<
"""


def test_normalize_cin():
    assert normalize_cin("bk 354428") == "BK354428"
    assert plausible_cin("BK354428")
    assert not plausible_cin("123")


def test_parse_date():
    assert parse_date_token("15.03.1990") == "1990-03-15"
    assert parse_date_token("20/11/2030") == "2030-11-20"


def test_parse_recto_fields():
    f = parse_ocr_text(SAMPLE_RECTO, "recto", 0.9)
    assert f["numero_cin"].value == "BK354428"
    assert "ALAOUI" in f["nom"].value
    assert "YOUSSEF" in f["prenom"].value
    assert f["date_naissance"].value == "1990-03-15"
    assert "CASABLANCA" in f["lieu_naissance"].value
    assert f["sexe"].value == "M"


def test_parse_mrz_verso():
    f = parse_ocr_text(SAMPLE_VERSO, "verso", 0.85)
    assert f["nom"].value or f["prenom"].value or f["numero_cin"].value


def test_merge_ambiguous_cin():
    a = parse_ocr_text("CIN AA111111\nNOM TEST", "recto", 0.9)
    b = parse_ocr_text("CIN BB222222\nNOM TEST", "verso", 0.9)
    m = merge_side_fields(a, b)
    assert m["numero_cin"].value == "" or m["numero_cin"].candidates
    assert len(m["numero_cin"].candidates) >= 2 or m["numero_cin"].value in ("AA111111", "BB222222")


def test_quality_blank():
    img = np.zeros((600, 900, 3), dtype=np.uint8)
    q = assess_image_quality(img)
    assert q.block_ocr or q.label in ("faible", "inexploitable", "acceptable")


def test_quality_sharpish():
    img = np.random.randint(40, 200, (700, 1100, 3), dtype=np.uint8)
    cv2.rectangle(img, (80, 80), (1020, 620), (220, 220, 220), -1)
    cv2.putText(img, "CIN BK354428", (120, 200), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)
    q = assess_image_quality(img)
    assert q.score >= 0


def test_identical_images():
    a = np.random.randint(0, 255, (400, 600, 3), dtype=np.uint8)
    assert images_probably_identical(a, a.copy())
    b = np.random.randint(0, 255, (400, 600, 3), dtype=np.uint8)
    # très peu probable d'être identiques
    assert not images_probably_identical(a, b, threshold=0.99)


def test_smart_cin_prefers_digits():
    from app.smart import pick_best_cin
    best, score, ranked = pick_best_cin(["BK35442B", "BK354428", "BK354A28"])
    assert best == "BK354428"
    assert score >= 0.7
    assert "BK354428" in ranked


def test_learning_city_match():
    from app.learning import LearningBase
    from app.smart import pick_best_city
    lb = LearningBase(path="/tmp/citymo_learning_test.json")
    lb.villes["CASABLANCA"] += 20
    best, score, _ = pick_best_city(["CASABLANCA", "CASABLANCAX"], lb)
    assert best == "CASABLANCA"
    assert score > 0.5
