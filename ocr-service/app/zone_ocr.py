"""
OCR par zones — moteur spécialisé CIN marocaine.

1. Carte déjà détectée / warpée (preprocess)
2. Crop de chaque zone
3. Amélioration locale (contraste / netteté / binarisation)
4. OCR zone (Paddle si dispo, sinon Tesseract whitelist+PSM)
5. Post-traitement champ
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import cv2
import numpy as np

from .postprocess import postprocess_zone_text
from .zones import Zone, zones_for_side

logger = logging.getLogger("citymo.ocr.zone_ocr")


def crop_relative(image_bgr: np.ndarray, zone: Zone) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    pad = float(zone.pad)
    x1 = int(max(0, (zone.x - pad) * w))
    y1 = int(max(0, (zone.y - pad) * h))
    x2 = int(min(w, (zone.x + zone.w + pad) * w))
    y2 = int(min(h, (zone.y + zone.h + pad) * h))
    if x2 <= x1 + 4 or y2 <= y1 + 4:
        return image_bgr.copy()
    return image_bgr[y1:y2, x1:x2].copy()


def enhance_zone_crop(crop: np.ndarray, zone: Zone) -> np.ndarray:
    """Contraste / netteté / upscale adaptés au type de champ."""
    img = crop
    h, w = img.shape[:2]
    target_h = max(int(zone.min_height_px), h)
    if h < target_h and h > 0:
        scale = target_h / h
        img = cv2.resize(img, (max(1, int(w * scale)), target_h), interpolation=cv2.INTER_CUBIC)

    if zone.lang in ("digits", "mrz"):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
        gray = clahe.apply(gray)
        # Unsharp
        blur = cv2.GaussianBlur(gray, (0, 0), 1.2)
        gray = cv2.addWeighted(gray, 1.6, blur, -0.6, 0)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        # Inverser si fond sombre majoritaire
        if np.mean(binary) < 127:
            binary = 255 - binary
        return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    # Noms / villes / mixte — couleur CLAHE + netteté
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.8, tileGridSize=(4, 4))
    l2 = clahe.apply(l)
    color = cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)
    color = cv2.bilateralFilter(color, 5, 35, 35)
    blur = cv2.GaussianBlur(color, (0, 0), 1.0)
    color = cv2.addWeighted(color, 1.35, blur, -0.35, 0)
    return color


def _run_paddle_zone(image_bgr: np.ndarray, zone: Zone) -> tuple[str, float]:
    from .engines import paddle_available, run_paddle, _paddle_ar, _collect_paddle
    import cv2 as _cv

    if not paddle_available():
        raise RuntimeError("paddle unavailable")

    if zone.lang == "ara" and _paddle_ar is not None:
        rgb = _cv.cvtColor(image_bgr, _cv.COLOR_BGR2RGB)
        lines, confs, _ = _collect_paddle(_paddle_ar, rgb)
        text = " ".join(lines)
        avg = sum(confs) / len(confs) if confs else 0.0
        return text, avg

    res = run_paddle(image_bgr)
    return (res.get("text") or "").replace("\n", " "), float(res.get("avg_confidence") or 0)


def _run_tesseract_zone(image_bgr: np.ndarray, zone: Zone) -> tuple[str, float]:
    import pytesseract
    from PIL import Image

    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)

    if zone.lang == "ara":
        langs = "ara"
    elif zone.lang == "mrz":
        langs = "eng"
    else:
        langs = "fra"

    cfg_parts = [f"--psm {zone.psm}", "--oem 1"]
    if zone.whitelist:
        # Échapper guillemets pour config tesseract
        wl = zone.whitelist.replace('"', "")
        cfg_parts.append(f'-c tessedit_char_whitelist={wl}')
    config = " ".join(cfg_parts)

    try:
        data = pytesseract.image_to_data(
            pil, lang=langs, config=config, output_type=pytesseract.Output.DICT
        )
    except Exception:
        # Fallback fra sans whitelist
        data = pytesseract.image_to_data(
            pil, lang="fra", config=f"--psm {zone.psm}", output_type=pytesseract.Output.DICT
        )

    texts, confs = [], []
    n = len(data.get("text", []))
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        try:
            conf = float(data["conf"][i])
        except Exception:
            conf = -1
        if conf < 0:
            continue
        texts.append(txt)
        confs.append(conf / 100.0)

    text = " ".join(texts)
    if not text:
        try:
            text = pytesseract.image_to_string(pil, lang=langs, config=config).strip()
        except Exception:
            text = pytesseract.image_to_string(pil, lang="fra", config=f"--psm {zone.psm}").strip()
    avg = sum(confs) / len(confs) if confs else (0.45 if text else 0.0)
    return text, avg


def ocr_single_zone(image_bgr: np.ndarray, zone: Zone) -> dict[str, Any]:
    crop = crop_relative(image_bgr, zone)
    enhanced = enhance_zone_crop(crop, zone)
    raw_text = ""
    conf = 0.0
    engine = "none"
    errors: list[str] = []

    # Paddle prioritaire
    try:
        from .engines import paddle_available

        if paddle_available():
            raw_text, conf = _run_paddle_zone(enhanced, zone)
            engine = "paddleocr"
    except Exception as exc:
        errors.append(f"paddle:{exc}")

    # Tesseract si paddle KO ou texte vide
    if not (raw_text or "").strip():
        try:
            from .engines import tesseract_available

            if tesseract_available():
                raw_text, conf = _run_tesseract_zone(enhanced, zone)
                engine = "tesseract"
        except Exception as exc:
            errors.append(f"tesseract:{exc}")

    cleaned = postprocess_zone_text(zone.field, raw_text)
    return {
        "field": zone.field,
        "raw": (raw_text or "").strip(),
        "text": cleaned,
        "confidence": round(float(conf), 3),
        "engine": engine,
        "errors": errors,
    }


def ocr_card_zones(corrected_bgr: np.ndarray, side: str) -> dict[str, Any]:
    """
    OCRise chaque zone de la face. Ne lit jamais la carte entière d'un coup.
    """
    zones = zones_for_side(side)
    by_field: dict[str, dict[str, Any]] = {}
    engines_used: set[str] = set()

    for zone in zones:
        try:
            res = ocr_single_zone(corrected_bgr, zone)
        except Exception as exc:
            logger.warning("Zone %s échouée: %s", zone.field, exc)
            res = {
                "field": zone.field,
                "raw": "",
                "text": "",
                "confidence": 0.0,
                "engine": "none",
                "errors": [str(exc)],
            }
        # Fusion numero_cin / numero_cin_alt
        key = zone.field
        if key == "numero_cin_alt":
            existing = by_field.get("numero_cin")
            alt_text = res.get("text") or ""
            if existing and existing.get("text"):
                if alt_text and float(res.get("confidence") or 0) > float(existing.get("confidence") or 0):
                    by_field["numero_cin"] = {**res, "field": "numero_cin"}
            elif alt_text:
                by_field["numero_cin"] = {**res, "field": "numero_cin"}
            continue
        by_field[key] = res
        if res.get("engine") and res["engine"] != "none":
            engines_used.add(res["engine"])

    # MRZ peut enrichir CIN / noms / dates si zones latines faibles
    mrz_text = (by_field.get("mrz") or {}).get("text") or (by_field.get("mrz") or {}).get("raw") or ""
    if mrz_text:
        from .parser import parse_mrz_collect
        from .postprocess import clean_cin, clean_person_name, clean_sexe, validate_date

        bag = parse_mrz_collect(mrz_text)
        if bag.get("cin") and not (by_field.get("numero_cin") or {}).get("text"):
            cin = clean_cin(bag["cin"][0])
            if cin:
                by_field["numero_cin"] = {
                    "field": "numero_cin",
                    "raw": bag["cin"][0],
                    "text": cin,
                    "confidence": 0.8,
                    "engine": "mrz",
                    "errors": [],
                }
        if bag.get("nom") and not (by_field.get("nom") or {}).get("text"):
            nom = clean_person_name(bag["nom"][0])
            if nom:
                by_field["nom"] = {
                    "field": "nom", "raw": bag["nom"][0], "text": nom,
                    "confidence": 0.75, "engine": "mrz", "errors": [],
                }
        if bag.get("prenom") and not (by_field.get("prenom") or {}).get("text"):
            prenom = clean_person_name(bag["prenom"][0])
            if prenom:
                by_field["prenom"] = {
                    "field": "prenom", "raw": bag["prenom"][0], "text": prenom,
                    "confidence": 0.75, "engine": "mrz", "errors": [],
                }
        if bag.get("naissance") and not (by_field.get("date_naissance") or {}).get("text"):
            iso = validate_date(bag["naissance"][0], "naissance")
            if iso:
                by_field["date_naissance"] = {
                    "field": "date_naissance", "raw": bag["naissance"][0], "text": iso,
                    "confidence": 0.8, "engine": "mrz", "errors": [],
                }
        if bag.get("expiration") and not (by_field.get("date_expiration") or {}).get("text"):
            iso = validate_date(bag["expiration"][0], "expiration")
            if iso:
                by_field["date_expiration"] = {
                    "field": "date_expiration", "raw": bag["expiration"][0], "text": iso,
                    "confidence": 0.8, "engine": "mrz", "errors": [],
                }
        if bag.get("sexe") and not (by_field.get("sexe") or {}).get("text"):
            sx = clean_sexe(bag["sexe"][0])
            if sx:
                by_field["sexe"] = {
                    "field": "sexe", "raw": bag["sexe"][0], "text": sx,
                    "confidence": 0.85, "engine": "mrz", "errors": [],
                }

    # Synthèse texte zone (pour debug / audit) — pas un OCR full-card
    synthetic_lines = []
    for k in (
        "nom", "prenom", "numero_cin", "date_naissance", "lieu_naissance",
        "sexe", "nationalite", "date_expiration", "autorite", "mrz",
    ):
        t = (by_field.get(k) or {}).get("text") or ""
        if t:
            synthetic_lines.append(f"{k.upper()}: {t}")

    return {
        "zones": by_field,
        "engines": sorted(engines_used),
        "synthetic_text": "\n".join(synthetic_lines),
        "mode": "zone",
    }


def zone_results_to_fields(zone_payload: dict[str, Any]):
    """Convertit résultats zones → FieldValue parser."""
    from .parser import empty_fields, fv
    from .smart import score_cin_candidate, score_person_name, score_date_iso

    fields = empty_fields()
    z = zone_payload.get("zones") or {}

    def take(name: str, score_fn=None, default_score: float = 0.7):
        item = z.get(name) or {}
        text = (item.get("text") or "").strip()
        if not text:
            return
        conf = float(item.get("confidence") or 0.5)
        if score_fn:
            sc = max(conf, score_fn(text))
        else:
            sc = max(conf, default_score)
        fields[name] = fv(text, sc, item.get("raw") or text)

    take("numero_cin", lambda t: score_cin_candidate(t))
    take("nom", lambda t: score_person_name(t))
    take("prenom", lambda t: score_person_name(t))
    take("date_naissance", lambda t: score_date_iso(t, "naissance"))
    take("date_expiration", lambda t: score_date_iso(t, "expiration"))
    take("lieu_naissance", default_score=0.65)
    take("sexe", default_score=0.8)
    take("nationalite", default_score=0.7)
    take("nom_arabe", default_score=0.65)
    take("prenom_arabe", default_score=0.65)
    take("autorite", default_score=0.55)

    if not fields["nationalite"].value:
        fields["nationalite"] = fv("Marocaine", 0.5, "default")

    return fields
