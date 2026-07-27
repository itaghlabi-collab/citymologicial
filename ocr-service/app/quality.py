"""Contrôle qualité d'une image CIN avant OCR."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import cv2
import numpy as np


@dataclass
class QualityReport:
    score: float  # 0–100
    label: str  # inexploitable | faible | acceptable | bonne
    messages: list[str]
    metrics: dict[str, Any]
    block_ocr: bool
    allow_force: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


def _laplacian_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _brightness(gray: np.ndarray) -> float:
    return float(np.mean(gray))


def _overexpose_ratio(gray: np.ndarray) -> float:
    return float(np.mean(gray > 245))


def _underexpose_ratio(gray: np.ndarray) -> float:
    return float(np.mean(gray < 25))


def _estimate_rotation_deg(gray: np.ndarray) -> float:
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=120)
    if lines is None or len(lines) == 0:
        return 0.0
    angles = []
    for rho_theta in lines[:40]:
        rho, theta = rho_theta[0]
        deg = (theta * 180 / np.pi) - 90
        if -45 < deg < 45:
            angles.append(deg)
    if not angles:
        return 0.0
    return float(np.median(angles))


def _card_like_score(gray: np.ndarray) -> float:
    """Score 0–1 : présence d'un rectangle type carte ID-1."""
    h, w = gray.shape[:2]
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 40, 120)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best = 0.0
    img_area = float(h * w)
    target_ratio = 85.6 / 53.98
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        area = cv2.contourArea(approx)
        if area < img_area * 0.08 or area > img_area * 0.95:
            continue
        x, y, bw, bh = cv2.boundingRect(approx)
        if bh == 0:
            continue
        ratio = bw / float(bh)
        ratio_score = 1.0 - min(abs(ratio - target_ratio) / target_ratio, 1.0)
        area_score = min(area / (img_area * 0.55), 1.0)
        best = max(best, 0.5 * ratio_score + 0.5 * area_score)
    return best


def assess_image_quality(image_bgr: np.ndarray) -> QualityReport:
    messages: list[str] = []
    if image_bgr is None or image_bgr.size == 0:
        return QualityReport(
            score=0,
            label="inexploitable",
            messages=["Image non lisible"],
            metrics={},
            block_ocr=True,
        )

    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    sharp = _laplacian_variance(gray)
    bright = _brightness(gray)
    over = _overexpose_ratio(gray)
    under = _underexpose_ratio(gray)
    rot = abs(_estimate_rotation_deg(gray))
    card = _card_like_score(gray)
    min_side = min(h, w)

    score = 100.0
    if min_side < 400:
        messages.append("Résolution insuffisante")
        score -= 35
    if sharp < 40:
        messages.append("Image trop floue, veuillez reprendre la photo.")
        score -= 40
    elif sharp < 80:
        messages.append("Image un peu floue")
        score -= 15
    if bright < 45 or under > 0.35:
        messages.append("Image trop sombre")
        score -= 25
    if bright > 220 or over > 0.28:
        messages.append("Image surexposée")
        score -= 25
    if over > 0.18:
        messages.append("Trop de reflet sur la carte.")
        score -= 15
    if rot > 18:
        messages.append("Forte rotation détectée")
        score -= 10
    if card < 0.25:
        messages.append("Image ne ressemblant pas à une carte")
        score -= 20
    elif card < 0.4:
        messages.append("Une partie de la carte est peut-être coupée.")
        score -= 12

    score = max(0.0, min(100.0, score))
    block = score < 25 or sharp < 25 or min_side < 280

    if score >= 75 and not messages:
        messages.append("Bonne qualité.")
        label = "bonne"
    elif score >= 55:
        if not any("acceptable" in m.lower() for m in messages):
            messages.append("Qualité acceptable.")
        label = "acceptable"
    elif score >= 25:
        label = "faible"
    else:
        label = "inexploitable"
        if not messages:
            messages.append("Image non lisible")

    return QualityReport(
        score=round(score, 1),
        label=label,
        messages=messages,
        metrics={
            "width": w,
            "height": h,
            "sharpness": round(sharp, 1),
            "brightness": round(bright, 1),
            "overexpose_ratio": round(over, 3),
            "underexpose_ratio": round(under, 3),
            "rotation_deg": round(rot, 1),
            "card_like": round(card, 3),
        },
        block_ocr=block,
        allow_force=True,
    )


def images_probably_identical(a: np.ndarray, b: np.ndarray, threshold: float = 0.92) -> bool:
    if a is None or b is None:
        return False
    ah, aw = a.shape[:2]
    bh, bw = b.shape[:2]
    if aw == 0 or bw == 0:
        return False
    size = (min(aw, bw, 320), min(ah, bh, 200))
    ga = cv2.cvtColor(cv2.resize(a, size), cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(cv2.resize(b, size), cv2.COLOR_BGR2GRAY)
    ga = ga.astype(np.float32)
    gb = gb.astype(np.float32)
    denom = (np.linalg.norm(ga) * np.linalg.norm(gb)) or 1.0
    corr = float(np.sum(ga * gb) / denom)
    return corr >= threshold
