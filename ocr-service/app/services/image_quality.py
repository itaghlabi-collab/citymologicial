"""Contrôles qualité image avant OCR."""
from __future__ import annotations

from typing import Optional, Tuple

import cv2
import numpy as np

from ..config import ALLOWED_EXT, ALLOWED_MIME, BLUR_THRESHOLD, BRIGHT_MEAN, DARK_MEAN, MAX_UPLOAD_BYTES, MIN_HEIGHT, MIN_WIDTH
from ..schemas import QualityReport


class ImageQualityError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def decode_image(data: bytes, filename: str = "", content_type: str = "") -> np.ndarray:
    if not data:
        raise ImageQualityError("INVALID_FILE", "Fichier image vide")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageQualityError("INVALID_FILE", "Fichier trop volumineux")
    ext = ""
    if filename and "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()
    mime = (content_type or "").lower().split(";")[0].strip()
    if mime and mime not in ALLOWED_MIME and not mime.startswith("image/"):
        raise ImageQualityError("UNSUPPORTED_FORMAT", f"Format non supporté: {mime}")
    if ext and ext not in ALLOWED_EXT and mime not in ALLOWED_MIME:
        raise ImageQualityError("UNSUPPORTED_FORMAT", f"Extension non supportée: {ext}")
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ImageQualityError("INVALID_FILE", "Image illisible")
    return img


def _blur_score(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _brightness(gray: np.ndarray) -> float:
    return float(np.mean(gray))


def _contrast(gray: np.ndarray) -> float:
    return float(np.std(gray))


def assess_quality(
    img: np.ndarray,
    *,
    card_found: bool = False,
    card_fully_visible: bool = False,
    force: bool = False,
) -> QualityReport:
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    blur = _blur_score(gray)
    bright = _brightness(gray)
    contrast = _contrast(gray)
    report = QualityReport(
        ok=True,
        width=w,
        height=h,
        blur_score=round(blur, 2),
        brightness=round(bright, 2),
        contrast=round(contrast, 2),
        card_found=card_found,
        card_fully_visible=card_fully_visible,
    )
    if w < MIN_WIDTH or h < MIN_HEIGHT:
        report.ok = False
        report.error_code = "INVALID_FILE"
        report.message = f"Résolution insuffisante ({w}x{h})"
        return report
    if blur < BLUR_THRESHOLD and not force:
        report.ok = False
        report.error_code = "IMAGE_TOO_BLURRY"
        report.message = "Image trop floue"
        return report
    if bright < DARK_MEAN and not force:
        report.ok = False
        report.error_code = "IMAGE_TOO_DARK"
        report.message = "Image trop sombre"
        return report
    if bright > BRIGHT_MEAN and not force:
        report.ok = False
        report.error_code = "IMAGE_TOO_BRIGHT"
        report.message = "Image trop claire"
        return report
    if not card_found and not force:
        report.ok = False
        report.error_code = "CARD_NOT_FOUND"
        report.message = "Carte non détectée"
        return report
    if card_found and not card_fully_visible and not force:
        report.ok = False
        report.error_code = "CARD_PARTIALLY_VISIBLE"
        report.message = "Carte partiellement visible"
        return report
    return report
