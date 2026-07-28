"""Correction d'orientation (0/90/180/270)."""
from __future__ import annotations

import cv2
import numpy as np


def _score_upright(gray: np.ndarray) -> float:
    # heuristique : variance horizontale des projections + contraste
    h, w = gray.shape[:2]
    # binarize soft
    thr = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11)
    row_var = float(np.var(np.mean(thr, axis=1)))
    col_var = float(np.var(np.mean(thr, axis=0)))
    # cartes ID : largeur > hauteur après warp — pénaliser portrait
    aspect = w / max(1, h)
    aspect_bonus = 1.2 if aspect >= 1.2 else 0.8
    return (row_var + 0.5 * col_var) * aspect_bonus


def auto_orient(img: np.ndarray) -> np.ndarray:
    best = img
    best_score = -1.0
    cur = img
    for _ in range(4):
        gray = cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY) if len(cur.shape) == 3 else cur
        score = _score_upright(gray)
        if score > best_score:
            best_score = score
            best = cur
        cur = cv2.rotate(cur, cv2.ROTATE_90_CLOCKWISE)
    return best


def enhance_variants(img: np.ndarray) -> list:
    """Crée plusieurs variantes pour OCR (jamais un seul bloc texte unique)."""
    out = []
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.bilateralFilter(gray, 7, 50, 50)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(denoised)
    out.append(("color", img))
    out.append(("clahe", cv2.cvtColor(clahe, cv2.COLOR_GRAY2BGR)))
    thr = cv2.adaptiveThreshold(clahe, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10)
    out.append(("bin", cv2.cvtColor(thr, cv2.COLOR_GRAY2BGR)))
    sharp = cv2.filter2D(clahe, -1, np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]]))
    out.append(("sharp", cv2.cvtColor(sharp, cv2.COLOR_GRAY2BGR)))
    return out
