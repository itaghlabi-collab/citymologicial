"""Extraction par zones + validation — jamais un OCR plein cadre seul."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from . import confidence, paddle_engine, validators
from .orientation import enhance_variants
from .template_detector import load_templates, score_template_fields
from ..schemas import FieldResult, empty_field


FIELD_VALIDATORS = {
    "cin": lambda t: validators.validate_cin(t),
    "nom": lambda t: validators.validate_person_name(t),
    "prenom": lambda t: validators.validate_person_name(t),
    "nom_arabe": lambda t: validators.validate_arabic_name(t),
    "prenom_arabe": lambda t: validators.validate_arabic_name(t),
    "date_naissance": lambda t: validators.validate_date(t, "naissance"),
    "lieu_naissance": lambda t: validators.validate_city(t),
    "sexe": lambda t: validators.validate_sexe(t),
    "nationalite": lambda t: validators.validate_nationalite(t),
    "adresse": lambda t: validators.validate_address(t),
    "date_delivrance": lambda t: validators.validate_date(t, "delivrance"),
    "date_expiration": lambda t: validators.validate_date(t, "expiration"),
    "autorite": lambda t: validators.validate_city(t),
}


def _extract_zone_best(
    variants: List[Tuple[str, np.ndarray]],
    field_name: str,
    zone: Dict[str, Any],
    template_id: str,
    face: str,
) -> FieldResult:
    bbox = zone.get("bbox") or [0, 0, 1, 1]
    mode = zone.get("mode") or "latin"
    validator = FIELD_VALIDATORS.get(field_name)
    best: Optional[FieldResult] = None
    texts_seen = []

    for _vname, img in variants:
        det = paddle_engine.ocr_crop(img, bbox, mode=mode)
        raw = det.get("text") or ""
        score = float(det.get("score") or 0.0)
        texts_seen.append(raw)
        if not validator:
            continue
        value, ok = validator(raw)
        if not ok or value is None:
            continue
        # accord entre variantes
        agree = 1.0
        normed = []
        for t in texts_seen:
            v2, ok2 = validator(t)
            if ok2 and v2:
                normed.append(v2)
        if len(normed) >= 2:
            agree = sum(1 for n in normed if n == value) / len(normed)
        fr = confidence.make_field(
            value,
            valid=True,
            ocr_score=score,
            source=f"{face}:{field_name}",
            template=template_id,
            raw=raw,
            bbox=bbox,
            variant_agree=agree,
        )
        if best is None or fr.confidence > best.confidence:
            best = fr
    return best or empty_field()


def extract_face_fields(warped: np.ndarray, face: str) -> Tuple[Dict[str, FieldResult], str, List[Dict[str, Any]]]:
    templates = load_templates(face)
    variants = enhance_variants(warped)
    best_fields: Dict[str, FieldResult] = {}
    best_score = -1.0
    best_tid = ""
    detections: List[Dict[str, Any]] = []

    for tmpl in templates:
        tid = tmpl.get("id") or "unknown"
        fields_cfg = tmpl.get("fields") or {}
        fields: Dict[str, FieldResult] = {}
        for fname, zone in fields_cfg.items():
            fr = _extract_zone_best(variants, fname, zone, tid, face)
            fields[fname] = fr
            if fr.valid and fr.raw:
                detections.append(
                    {
                        "field": fname,
                        "raw": fr.raw,
                        "normalized": fr.value,
                        "score": fr.confidence,
                        "bbox": fr.bbox,
                        "zone": fname,
                        "face": face,
                        "template": tid,
                    }
                )
        sc = score_template_fields(fields)
        if sc > best_score:
            best_score = sc
            best_fields = fields
            best_tid = tid

    return best_fields, best_tid, detections
