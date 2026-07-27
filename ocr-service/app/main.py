"""
CITYMO OCR Service — FastAPI (processus Python indépendant).

Ne tourne PAS dans Express. Express ne fait que proxy HTTP.
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Any, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import ENGINE_NAME, __version__
from .engines import engine_manifest, paddle_available, tesseract_available
from .learning import get_learning_base
from .pipeline import analyze_cin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("citymo.ocr")

app = FastAPI(title="CITYMO CIN OCR", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("OCR_CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

MAX_BYTES = int(os.environ.get("OCR_MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
TIMEOUT_NOTE = int(os.environ.get("OCR_TIMEOUT_SEC", "90"))


class AnalyzeJsonBody(BaseModel):
    recto: Optional[str] = Field(None, description="data URL ou base64")
    verso: Optional[str] = None
    force: bool = False


class LearningSyncBody(BaseModel):
    workers: List[dict[str, Any]] = Field(default_factory=list)


def _strip_data_url(data: str) -> bytes:
    s = (data or "").strip()
    if not s:
        return b""
    if "," in s and s.lower().startswith("data:"):
        s = s.split(",", 1)[1]
    try:
        return base64.b64decode(s, validate=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Image non lisible: {exc}") from exc


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": ENGINE_NAME,
        "version": __version__,
        "independent": True,
        "paddleocr": paddle_available(),
        "tesseract": tesseract_available(),
        "engine": engine_manifest(),
        "learning": get_learning_base().stats(),
        "timeout_sec": TIMEOUT_NOTE,
        "recommended_resources": {"vcpu": 2, "ram_gb": 4},
    }


@app.post("/analyze")
async def analyze_json(body: AnalyzeJsonBody):
    recto = _strip_data_url(body.recto) if body.recto else None
    verso = _strip_data_url(body.verso) if body.verso else None
    if recto and len(recto) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image trop volumineuse")
    if verso and len(verso) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image trop volumineuse")
    try:
        result = analyze_cin(recto, verso, force=body.force)
    except Exception as exc:
        logger.exception("analyze")
        raise HTTPException(status_code=503, detail="Service OCR indisponible") from exc
    return result


@app.post("/analyze-multipart")
async def analyze_multipart(
    recto: UploadFile = File(...),
    verso: Optional[UploadFile] = File(None),
    force: bool = Form(False),
):
    rb = await recto.read()
    vb = await verso.read() if verso is not None else None
    if len(rb) > MAX_BYTES or (vb and len(vb) > MAX_BYTES):
        raise HTTPException(status_code=413, detail="Image trop volumineuse")
    try:
        result = analyze_cin(rb, vb, force=force)
    except Exception as exc:
        logger.exception("analyze-multipart")
        raise HTTPException(status_code=503, detail="Service OCR indisponible") from exc
    return result


@app.post("/learning/sync")
async def learning_sync(body: LearningSyncBody):
    """Enrichit la base noms/villes depuis les ouvriers CITYMO (pas d'IA)."""
    base = get_learning_base()
    added = base.ingest_workers(body.workers or [])
    return {"ok": True, "added": added, "stats": base.stats()}


@app.get("/learning/stats")
def learning_stats():
    return {"ok": True, **get_learning_base().stats()}
