"""Scores de confiance — combinaison OCR + validation + cohérence."""
from __future__ import annotations

from typing import Optional

from ..schemas import FieldResult, empty_field


def combine_confidence(
    ocr_score: float,
    format_ok: bool,
    zone_ok: bool = True,
    variant_agree: float = 1.0,
    template_agree: float = 1.0,
) -> float:
    if not format_ok:
        return 0.0
    base = max(0.0, min(1.0, float(ocr_score or 0.0)))
    zone_factor = 1.0 if zone_ok else 0.75
    agree = max(0.5, min(1.0, float(variant_agree))) * max(0.5, min(1.0, float(template_agree)))
    return round(max(0.0, min(1.0, base * zone_factor * agree)), 3)


def make_field(
    value: Optional[str],
    *,
    valid: bool,
    ocr_score: float = 0.0,
    source: Optional[str] = None,
    template: Optional[str] = None,
    raw: Optional[str] = None,
    bbox=None,
    zone_ok: bool = True,
    variant_agree: float = 1.0,
) -> FieldResult:
    if not valid or value is None or str(value).strip() == "":
        return empty_field()
    conf = combine_confidence(ocr_score, True, zone_ok=zone_ok, variant_agree=variant_agree)
    return FieldResult(
        value=value,
        confidence=conf,
        valid=True,
        source=source,
        raw=raw,
        template=template,
        bbox=bbox,
    )


def global_confidence_label(fields: dict) -> str:
    vals = [f.confidence for f in fields.values() if getattr(f, "valid", False)]
    if not vals:
        return "faible"
    avg = sum(vals) / len(vals)
    if avg >= 0.90:
        return "elevee"
    if avg >= 0.70:
        return "moyenne"
    return "faible"
