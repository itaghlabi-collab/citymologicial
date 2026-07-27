"""Prétraitement OpenCV — ne jamais écraser l'original (copies de travail)."""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np


def decode_image_bytes(data: bytes) -> Optional[np.ndarray]:
    if not data:
        return None
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def encode_jpeg(image_bgr: np.ndarray, quality: int = 90) -> bytes:
    ok, buf = cv2.imencode(".jpg", image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("Encodage JPEG impossible")
    return buf.tobytes()


def fix_exif_orientation_pil(data: bytes) -> bytes:
    """Orientation EXIF via Pillow si disponible ; sinon retourne data."""
    try:
        from io import BytesIO
        from PIL import Image, ImageOps

        img = Image.open(BytesIO(data))
        img = ImageOps.exif_transpose(img)
        out = BytesIO()
        img.convert("RGB").save(out, format="JPEG", quality=92)
        return out.getvalue()
    except Exception:
        return data


def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def find_card_quad(image_bgr: np.ndarray) -> Optional[np.ndarray]:
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0
    img_area = float(h * w)
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        area = cv2.contourArea(approx)
        if area < img_area * 0.12 or area > img_area * 0.98:
            continue
        if area > best_area:
            best_area = area
            best = approx.reshape(4, 2).astype(np.float32)
    return best


def warp_card(image_bgr: np.ndarray, quad: np.ndarray) -> np.ndarray:
    rect = order_points(quad)
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_w = int(max(width_a, width_b))
    max_h = int(max(height_a, height_b))
    max_w = max(max_w, 400)
    max_h = max(max_h, 250)
    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image_bgr, M, (max_w, max_h))


def deskew(image_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, 100)
    if lines is None:
        return image_bgr
    angles = []
    for rho_theta in lines[:30]:
        _, theta = rho_theta[0]
        deg = (theta * 180 / np.pi) - 90
        if -20 < deg < 20:
            angles.append(deg)
    if not angles:
        return image_bgr
    angle = float(np.median(angles))
    if abs(angle) < 0.8:
        return image_bgr
    h, w = image_bgr.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(
        image_bgr, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
    )


def enhance_variants(image_bgr: np.ndarray) -> dict[str, np.ndarray]:
    """Génère versions couleur / gris / contraste pour OCR."""
    color = image_bgr.copy()
    # CLAHE sur L
    lab = cv2.cvtColor(color, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    color = cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)
    color = cv2.bilateralFilter(color, 5, 40, 40)
    blur = cv2.GaussianBlur(color, (0, 0), 1.0)
    color = cv2.addWeighted(color, 1.25, blur, -0.25, 0)

    gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    contrast = cv2.convertScaleAbs(gray, alpha=1.45, beta=-20)
    _, binary = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contrast_bgr = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    return {
        "color": color,
        "gray": gray_bgr,
        "contrast": contrast_bgr,
    }


def preprocess_pipeline(image_bytes: bytes) -> dict:
    """
    Retourne :
      original_bgr, corrected_bgr, variants, meta
    L'original n'est jamais écrasé (copie séparée).
    """
    oriented = fix_exif_orientation_pil(image_bytes)
    original = decode_image_bytes(oriented)
    if original is None:
        raise ValueError("Image non lisible")

    working = original.copy()
    # Downscale extrême pour perf OCR (copie de travail)
    h, w = working.shape[:2]
    max_side = max(h, w)
    if max_side > 2200:
        scale = 2200 / max_side
        working = cv2.resize(working, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    quad = find_card_quad(working)
    warped = False
    if quad is not None:
        try:
            working = warp_card(working, quad)
            warped = True
        except Exception:
            warped = False

    working = deskew(working)
    variants = enhance_variants(working)

    return {
        "original_bgr": original,
        "corrected_bgr": working,
        "variants": variants,
        "meta": {
            "warped": warped,
            "corrected_shape": list(working.shape[:2]),
            "original_shape": list(original.shape[:2]),
        },
    }
