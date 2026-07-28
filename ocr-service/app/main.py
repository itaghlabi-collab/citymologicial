"""
CITYMO OCR Service — API production CIN marocaine.

GET  /health
POST /v1/cin/analyze   (front + back obligatoires)

Anciennes routes /analyze conservées en alias de compatibilité (dépréciées).
"""
from __future__ import annotations

import base64
import logging
import time
from typing import Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import CORS_ORIGINS, MAX_UPLOAD_BYTES, OCR_API_KEY, REQUIRE_API_KEY, TIMEOUT_SEC
from .schemas import AnalyzeResponse, FaceResult, QualityReport, empty_field
from .services import confidence
from .services.card_detector import detect_card_corners
from .services.field_extractor import extract_face_fields
from .services.image_quality import ImageQualityError, assess_quality, decode_image
from .services.orientation import auto_orient
from .services.paddle_engine import paddle_available
from .services.perspective import warp_card
from .services import validators

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("citymo.ocr")

app = FastAPI(title="CITYMO CIN OCR", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _check_api_key(x_api_key: Optional[str]):
    if not REQUIRE_API_KEY:
        return
    if not OCR_API_KEY:
        # clé non configurée côté service → refuser en prod stricte
        raise HTTPException(status_code=503, detail={"error_code": "OCR_NOT_CONFIGURED", "error": "OCR_SERVICE_API_KEY manquante"})
    if not x_api_key or x_api_key != OCR_API_KEY:
        raise HTTPException(status_code=401, detail={"error_code": "UNAUTHORIZED", "error": "Clé API OCR invalide"})


def _strip_data_url(data: str) -> bytes:
    s = (data or "").strip()
    if not s:
        return b""
    if "," in s and s.lower().startswith("data:"):
        s = s.split(",", 1)[1]
    try:
        return base64.b64decode(s, validate=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error_code": "INVALID_FILE", "error": str(exc)}) from exc


def _process_face(data: bytes, face: str, force: bool, progress: list):
    progress.append(f"{face}:decode")
    try:
        img = decode_image(data)
    except ImageQualityError as exc:
        fr = FaceResult(
            face=face,
            quality=QualityReport(ok=False, error_code=exc.code, message=exc.message),
        )
        return fr, {}

    progress.append(f"{face}:detect_card")
    corners, found, fully = detect_card_corners(img)
    q = assess_quality(img, card_found=found, card_fully_visible=fully, force=force)
    if not q.ok:
        return FaceResult(face=face, quality=q), {}

    progress.append(f"{face}:warp")
    warped = warp_card(img, corners)
    progress.append(f"{face}:orient")
    warped = auto_orient(warped)
    progress.append(f"{face}:ocr_zones")
    fields, tid, dets = extract_face_fields(warped, "front" if face == "front" else "back")
    return FaceResult(face=face, quality=q, template_used=tid, detections=dets), fields


def _merge_fields(front_fields: dict, back_fields: dict) -> dict:
    merged = {}
    for src in (front_fields or {}, back_fields or {}):
        for k, fr in src.items():
            cur = merged.get(k)
            if cur is None or (fr.valid and fr.confidence >= getattr(cur, "confidence", 0)):
                merged[k] = fr
    for k in (
        "cin", "nom", "prenom", "nom_arabe", "prenom_arabe",
        "date_naissance", "lieu_naissance", "sexe", "nationalite",
        "adresse", "date_delivrance", "date_expiration", "autorite",
    ):
        merged.setdefault(k, empty_field())
    return merged


def _to_worker_form(fields: dict) -> dict:
    def v(key, conf_min=0.70):
        fr = fields.get(key) or empty_field()
        if fr.valid and fr.value and fr.confidence >= conf_min:
            return fr.value
        return None

    return {
        "cin": v("cin"),
        "nom": v("nom"),
        "prenom": v("prenom"),
        "nom_arabe": v("nom_arabe"),
        "prenom_arabe": v("prenom_arabe"),
        "date_naissance": v("date_naissance"),
        "ville_naissance": v("lieu_naissance"),
        "sexe": v("sexe"),
        "nationalite": v("nationalite"),  # null si invalide — jamais « À »
        "adresse": v("adresse"),
        "date_delivrance": v("date_delivrance"),
        "date_expiration": v("date_expiration"),
        "autorite": v("autorite"),
    }


async def _analyze_bytes(front_bytes: bytes, back_bytes: bytes, force: bool = False) -> AnalyzeResponse:
    t0 = time.time()
    progress = []
    if not front_bytes or not back_bytes:
        return AnalyzeResponse(
            ok=False,
            success=False,
            error="Recto et verso obligatoires",
            error_code="INVALID_FILE",
            allow_force=False,
        )
    if len(front_bytes) > MAX_UPLOAD_BYTES or len(back_bytes) > MAX_UPLOAD_BYTES:
        return AnalyzeResponse(ok=False, success=False, error="Fichier trop volumineux", error_code="INVALID_FILE")

    if not paddle_available() and not force:
        # en test sans paddle : encore permettre analyse structurelle / qualité
        progress.append("paddle:unavailable")

    front, front_fields = _process_face(front_bytes, "front", force, progress)
    if not front.quality.ok:
        return AnalyzeResponse(
            ok=False,
            success=False,
            error=front.quality.message or "Qualité recto insuffisante",
            error_code=front.quality.error_code or "OCR_FAILED",
            allow_force=True,
            faces={"front": front},
            progress=progress,
            duration_ms=int((time.time() - t0) * 1000),
        )

    back, back_fields = _process_face(back_bytes, "back", force, progress)
    if not back.quality.ok:
        return AnalyzeResponse(
            ok=False,
            success=False,
            error=back.quality.message or "Qualité verso insuffisante",
            error_code=back.quality.error_code or "OCR_FAILED",
            allow_force=True,
            faces={"front": front, "back": back},
            progress=progress,
            duration_ms=int((time.time() - t0) * 1000),
        )

    try:
        fields = _merge_fields(front_fields, back_fields)
    except Exception as exc:
        logger.exception("OCR merge failed")
        return AnalyzeResponse(
            ok=False,
            success=False,
            error=str(exc),
            error_code="OCR_FAILED",
            progress=progress,
            duration_ms=int((time.time() - t0) * 1000),
        )

    # cohérence dates
    pair = validators.validate_dates_pair(
        fields["date_naissance"].value if fields["date_naissance"].valid else None,
        fields["date_delivrance"].value if fields["date_delivrance"].valid else None,
        fields["date_expiration"].value if fields["date_expiration"].valid else None,
    )
    for key, (val, ok) in pair.items():
        map_key = key
        if not ok:
            fields[map_key] = empty_field()
        elif val and fields[map_key].valid:
            fields[map_key].value = val

    worker_form = _to_worker_form(fields)
    valid_count = sum(1 for f in fields.values() if f.valid)
    partial = valid_count < 4
    warnings = []
    if not paddle_available():
        warnings.append("PaddleOCR non installé — extraction limitée")
    if partial:
        warnings.append("Extraction partielle — vérifiez les champs")

    return AnalyzeResponse(
        ok=True,
        success=True,
        fields=fields,
        worker_form=worker_form,
        faces={"front": front, "back": back},
        progress=progress,
        warnings=warnings,
        confidence_globale=confidence.global_confidence_label(fields),
        engine_used="paddleocr" if paddle_available() else "none",
        engine_version=__version__,
        duration_ms=int((time.time() - t0) * 1000),
        partial=partial,
    )


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "citymo-cin-ocr",
        "version": __version__,
        "paddleocr": paddle_available(),
        "tesseract": False,
        "timeout_sec": TIMEOUT_SEC,
        "endpoints": ["/health", "/v1/cin/analyze"],
    }


@app.post("/v1/cin/analyze", response_model=AnalyzeResponse)
async def analyze_v1(
    front: UploadFile = File(...),
    back: UploadFile = File(...),
    force: bool = Form(False),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    _check_api_key(x_api_key)
    fb = await front.read()
    bb = await back.read()
    return await _analyze_bytes(fb, bb, force=force)


@app.post("/v1/cin/analyze-json", response_model=AnalyzeResponse)
async def analyze_v1_json(
    payload: dict,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Variante JSON (data URL) pour le proxy Node."""
    _check_api_key(x_api_key)
    front = _strip_data_url(payload.get("front") or payload.get("recto") or "")
    back = _strip_data_url(payload.get("back") or payload.get("verso") or "")
    force = bool(payload.get("force"))
    return await _analyze_bytes(front, back, force=force)


# Alias déprécié — redirige vers le même pipeline (compat proxy ancien)
@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_legacy(payload: dict, x_api_key: Optional[str] = Header(None, alias="X-API-Key")):
    return await analyze_v1_json(payload, x_api_key=x_api_key)
