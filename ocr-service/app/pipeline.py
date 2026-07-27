"""Pipeline d'analyse CIN recto/verso."""
from __future__ import annotations

import base64
import logging
import time
from typing import Any, Optional

from . import ENGINE_NAME, __version__
from .engines import paddle_available, tesseract_available, engine_manifest
from .parser import (
    fields_to_api,
    global_confidence,
    merge_side_fields,
)
from .preprocess import encode_jpeg, preprocess_pipeline
from .quality import assess_image_quality, images_probably_identical
from .zone_ocr import ocr_card_zones, zone_results_to_fields

logger = logging.getLogger("citymo.ocr.pipeline")


def _b64_jpeg(image_bgr, quality: int = 85) -> str:
    raw = encode_jpeg(image_bgr, quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def analyze_side(image_bytes: bytes, side: str, force: bool = False) -> dict[str, Any]:
    t0 = time.time()
    pre = preprocess_pipeline(image_bytes)
    quality = assess_image_quality(pre["corrected_bgr"])

    if quality.block_ocr and not force:
        return {
            "side": side,
            "ok": False,
            "blocked": True,
            "quality": quality.to_dict(),
            "fields": {},
            "raw_text": "",
            "engine": None,
            "corrected_preview": _b64_jpeg(pre["corrected_bgr"], 70),
            "duration_ms": int((time.time() - t0) * 1000),
            "error": "Image non lisible",
            "error_code": "IMAGE_UNREADABLE",
        }

    # Moteur spécialisé : OCR par zones (jamais la carte entière d'un coup)
    try:
        zone_payload = ocr_card_zones(pre["corrected_bgr"], side=side)
        fields = zone_results_to_fields(zone_payload)
    except Exception as exc:
        logger.exception("OCR zones side %s", side)
        return {
            "side": side,
            "ok": False,
            "blocked": False,
            "quality": quality.to_dict(),
            "fields": {},
            "raw_text": "",
            "engine": None,
            "corrected_preview": _b64_jpeg(pre["corrected_bgr"], 70),
            "duration_ms": int((time.time() - t0) * 1000),
            "error": str(exc)[:200],
            "error_code": "OCR_FAILED",
            "preprocess_meta": pre["meta"],
        }

    zone_map = zone_payload.get("zones") or {}
    confs = [float(v.get("confidence") or 0) for v in zone_map.values() if v.get("text")]
    avg_conf = sum(confs) / len(confs) if confs else 0.0
    engines = zone_payload.get("engines") or []
    engine_label = "+".join(engines) if engines else "zone"
    raw_synth = zone_payload.get("synthetic_text") or ""

    return {
        "side": side,
        "ok": True,
        "blocked": False,
        "quality": quality.to_dict(),
        "fields": fields_to_api(fields),
        "raw_text_len": len(raw_synth),
        "engine": f"zone:{engine_label}",
        "engine_version": "zone-v1",
        "models": engines,
        "engine_variant": "zones",
        "ocr_mode": "zone",
        "ocr_confidence": round(avg_conf, 3),
        "zones_read": {
            k: {"text": v.get("text"), "confidence": v.get("confidence"), "engine": v.get("engine")}
            for k, v in zone_map.items()
            if v.get("text") or v.get("raw")
        },
        "corrected_preview": _b64_jpeg(pre["corrected_bgr"], 70),
        "duration_ms": int((time.time() - t0) * 1000),
        "preprocess_meta": pre["meta"],
        "_fields_obj": fields,
        "_raw_text": raw_synth,
    }


def analyze_cin(
    recto_bytes: Optional[bytes],
    verso_bytes: Optional[bytes],
    force: bool = False,
) -> dict[str, Any]:
    t0 = time.time()
    progress = []

    if not recto_bytes and not verso_bytes:
        return {
            "ok": False,
            "error": "Recto manquant",
            "error_code": "RECTO_MISSING",
            "engine_name": ENGINE_NAME,
            "engine_version": __version__,
        }

    if not recto_bytes:
        return {
            "ok": False,
            "error": "Recto manquant",
            "error_code": "RECTO_MISSING",
            "engine_name": ENGINE_NAME,
            "engine_version": __version__,
        }

    progress.append("Préparation de l'image")

    # Identiques ?
    identical = False
    if recto_bytes and verso_bytes:
        from .preprocess import decode_image_bytes, fix_exif_orientation_pil

        ra = decode_image_bytes(fix_exif_orientation_pil(recto_bytes))
        va = decode_image_bytes(fix_exif_orientation_pil(verso_bytes))
        identical = images_probably_identical(ra, va)

    progress.append("Localisation des zones CIN")
    progress.append("Lecture OCR par zones (recto)")
    recto = analyze_side(recto_bytes, "recto", force=force)

    verso = None
    if verso_bytes:
        progress.append("Lecture OCR par zones (verso)")
        verso = analyze_side(verso_bytes, "verso", force=force)
    else:
        progress.append("Verso manquant — analyse partielle")

    if recto.get("blocked") and not force:
        return {
            "ok": False,
            "error": "Image non lisible",
            "error_code": "IMAGE_UNREADABLE",
            "quality_recto": recto.get("quality"),
            "quality_verso": (verso or {}).get("quality"),
            "identical_faces": identical,
            "progress": progress,
            "engine_name": ENGINE_NAME,
            "engine_version": __version__,
            "engines_available": {
                "paddleocr": paddle_available(),
                "tesseract": tesseract_available(),
            },
            "allow_force": True,
        }

    progress.append("Extraction des champs")
    from .parser import empty_fields

    rf = recto.get("_fields_obj") or empty_fields()
    vf = (verso or {}).get("_fields_obj") or empty_fields()
    merged = merge_side_fields(rf, vf)

    # Map worker form
    f = merged
    worker_form = {
        "cin": f["numero_cin"].value,
        "prenom": f["prenom"].value,
        "nom": f["nom"].value,
        "date_naissance": f["date_naissance"].value,
        "ville_naissance": f["lieu_naissance"].value,
        "nationalite": f["nationalite"].value or "Marocaine",
        "sexe": f["sexe"].value,
        "date_expiration": f["date_expiration"].value,
        "nom_arabe": f["nom_arabe"].value,
        "prenom_arabe": f["prenom_arabe"].value,
    }

    partial = not (worker_form["cin"] and worker_form["nom"] and worker_form["prenom"])
    progress.append("Vérification terminée")

    # Nettoyer champs internes
    def public_side(s: Optional[dict]) -> Optional[dict]:
        if not s:
            return None
        out = {k: v for k, v in s.items() if not k.startswith("_")}
        return out

    warnings = []
    if identical:
        warnings.append("Recto et verso probablement identiques.")
    if not verso_bytes:
        warnings.append("Verso manquant — analyse partielle.")
    if partial:
        warnings.append("Analyse partielle — vérifiez et complétez les champs.")
    if recto.get("error"):
        warnings.append(recto["error"])
    if verso and verso.get("error"):
        warnings.append(verso["error"])

    return {
        "ok": True,
        "partial": partial,
        "error": None,
        "error_code": "PARTIAL" if partial else None,
        "fields": fields_to_api(merged),
        "worker_form": worker_form,
        "confidence_globale": global_confidence(merged),
        "recto": public_side(recto),
        "verso": public_side(verso),
        "identical_faces": identical,
        "warnings": warnings,
        "progress": progress,
        "engine_name": ENGINE_NAME,
        "engine_version": __version__,
        "engine_used": recto.get("engine") or (verso or {}).get("engine"),
        "models_used": recto.get("models") or (verso or {}).get("models") or [],
        "ocr_engine_version": recto.get("engine_version") or (verso or {}).get("engine_version"),
        "engines_available": {
            "paddleocr": paddle_available(),
            "tesseract": tesseract_available(),
        },
        "engine_manifest": engine_manifest(),
        "duration_ms": int((time.time() - t0) * 1000),
        "provider": "citymo",
    }
