"""Détection du contour carte d'identité."""
from __future__ import annotations

from typing import Optional, Tuple

import cv2
import numpy as np


def _order_corners(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def detect_card_corners(img: np.ndarray) -> Tuple[Optional[np.ndarray], bool, bool]:
    """
    Returns (corners 4x2, card_found, fully_visible).
    """
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0.0
    img_area = float(w * h)
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        area = abs(cv2.contourArea(approx))
        if area < img_area * 0.12 or area > img_area * 0.98:
            continue
        if area > best_area:
            best_area = area
            best = approx.reshape(4, 2).astype("float32")
    if best is None:
        # fallback: full frame (partial)
        margin = 0.02
        corners = np.array(
            [
                [w * margin, h * margin],
                [w * (1 - margin), h * margin],
                [w * (1 - margin), h * (1 - margin)],
                [w * margin, h * (1 - margin)],
            ],
            dtype="float32",
        )
        return corners, False, False

    ordered = _order_corners(best)
    # fully visible if corners away from border
    pad = min(w, h) * 0.01
    fully = bool(
        ordered[:, 0].min() >= pad
        and ordered[:, 1].min() >= pad
        and ordered[:, 0].max() <= w - pad
        and ordered[:, 1].max() <= h - pad
        and best_area >= img_area * 0.18
    )
    return ordered, True, fully
