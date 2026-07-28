"""Correction de perspective."""
from __future__ import annotations

import cv2
import numpy as np


def warp_card(img: np.ndarray, corners: np.ndarray, out_w: int = 1000, out_h: int = 630) -> np.ndarray:
    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype="float32",
    )
    M = cv2.getPerspectiveTransform(corners.astype("float32"), dst)
    return cv2.warpPerspective(img, M, (out_w, out_h))
