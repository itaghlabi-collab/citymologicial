"""Schémas Pydantic — contrat API /v1/cin/analyze."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class FieldResult(BaseModel):
    value: Optional[str] = None
    confidence: float = 0.0
    valid: bool = False
    source: Optional[str] = None
    raw: Optional[str] = None
    template: Optional[str] = None
    bbox: Optional[List[float]] = None


class QualityReport(BaseModel):
    ok: bool = True
    error_code: Optional[str] = None
    message: Optional[str] = None
    width: int = 0
    height: int = 0
    blur_score: float = 0.0
    brightness: float = 0.0
    contrast: float = 0.0
    card_found: bool = False
    card_fully_visible: bool = False


class FaceResult(BaseModel):
    face: str
    quality: QualityReport
    template_used: Optional[str] = None
    detections: List[Dict[str, Any]] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    ok: bool = True
    success: bool = True
    error: Optional[str] = None
    error_code: Optional[str] = None
    allow_force: bool = False
    fields: Dict[str, FieldResult] = Field(default_factory=dict)
    worker_form: Dict[str, Optional[str]] = Field(default_factory=dict)
    faces: Dict[str, FaceResult] = Field(default_factory=dict)
    progress: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    confidence_globale: str = "faible"
    engine_used: str = "paddleocr"
    engine_version: str = "v1"
    duration_ms: int = 0
    partial: bool = False


EMPTY_FIELD = FieldResult(value=None, confidence=0.0, valid=False, source=None)


def empty_field() -> FieldResult:
    return FieldResult(value=None, confidence=0.0, valid=False, source=None)
