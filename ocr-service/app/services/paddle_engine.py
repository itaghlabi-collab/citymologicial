"""Moteur PaddleOCR — latin / arabe / alphanum / dates. Pas de Tesseract en production."""
from __future__ import annotations

import logging
import threading
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

logger = logging.getLogger("citymo.ocr.paddle")

_lock = threading.Lock()
_engines: Dict[str, Any] = {}
_PADDLE_OK: Optional[bool] = None


def paddle_available() -> bool:
    global _PADDLE_OK
    if _PADDLE_OK is not None:
        return _PADDLE_OK
    try:
        import paddleocr  # noqa: F401

        _PADDLE_OK = True
    except Exception:
        _PADDLE_OK = False
    return _PADDLE_OK


def _get_engine(lang: str):
    with _lock:
        if lang in _engines:
            return _engines[lang]
        if not paddle_available():
            return None
        from paddleocr import PaddleOCR

        # lang: 'fr' / 'en' / 'ar' / 'latin'
        use_lang = {"latin": "en", "fr": "fr", "ar": "ar", "date": "en", "cin": "en"}.get(lang, lang)
        try:
            eng = PaddleOCR(use_angle_cls=True, lang=use_lang, show_log=False)
        except TypeError:
            eng = PaddleOCR(use_angle_cls=True, lang=use_lang)
        _engines[lang] = eng
        return eng


def _parse_paddle_result(result) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not result:
        return out
    # PaddleOCR 2.x: list of lines [box, (text, score)]
    # PaddleOCR 3.x: may return dict-like
    pages = result if isinstance(result, list) else [result]
    for page in pages:
        if page is None:
            continue
        if isinstance(page, dict):
            texts = page.get("rec_texts") or page.get("texts") or []
            scores = page.get("rec_scores") or page.get("scores") or []
            boxes = page.get("dt_polys") or page.get("rec_polys") or page.get("boxes") or []
            for i, text in enumerate(texts):
                score = float(scores[i]) if i < len(scores) else 0.0
                box = boxes[i] if i < len(boxes) else None
                bbox = None
                if box is not None:
                    arr = np.array(box).reshape(-1, 2)
                    bbox = [float(arr[:, 0].min()), float(arr[:, 1].min()), float(arr[:, 0].max()), float(arr[:, 1].max())]
                out.append({"text": str(text), "score": score, "bbox": bbox})
            continue
        for line in page:
            try:
                box, (text, score) = line
                arr = np.array(box).reshape(-1, 2)
                bbox = [float(arr[:, 0].min()), float(arr[:, 1].min()), float(arr[:, 0].max()), float(arr[:, 1].max())]
                out.append({"text": str(text), "score": float(score), "bbox": bbox})
            except Exception:
                continue
    return out


def ocr_image(img: np.ndarray, mode: str = "latin") -> List[Dict[str, Any]]:
    """
    mode: latin | fr | ar | cin | date
    """
    eng = _get_engine(mode if mode in ("ar", "fr") else ("cin" if mode == "cin" else "latin"))
    if eng is None:
        logger.warning("PaddleOCR indisponible — OCR vide")
        return []
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB) if len(img.shape) == 3 else img
    try:
        # API 2.x
        result = eng.ocr(rgb, cls=True)
    except TypeError:
        try:
            result = eng.ocr(rgb)
        except Exception as exc:
            logger.exception("paddle ocr failed: %s", exc)
            return []
    except Exception as exc:
        logger.exception("paddle ocr failed: %s", exc)
        return []
    return _parse_paddle_result(result)


def ocr_crop(img: np.ndarray, bbox_norm: List[float], mode: str = "latin") -> Dict[str, Any]:
    """OCR d'une zone normalisée [x1,y1,x2,y2] dans [0,1]."""
    h, w = img.shape[:2]
    x1, y1, x2, y2 = bbox_norm
    xa, ya = int(max(0, x1 * w)), int(max(0, y1 * h))
    xb, yb = int(min(w, x2 * w)), int(min(h, y2 * h))
    if xb <= xa or yb <= ya:
        return {"text": "", "score": 0.0, "bbox": bbox_norm, "raw_lines": []}
    crop = img[ya:yb, xa:xb]
    # upscale small crops
    ch, cw = crop.shape[:2]
    if min(ch, cw) < 40:
        crop = cv2.resize(crop, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    lines = ocr_image(crop, mode=mode)
    if not lines:
        return {"text": "", "score": 0.0, "bbox": bbox_norm, "raw_lines": []}
    text = " ".join(l["text"] for l in lines).strip()
    score = float(sum(l["score"] for l in lines) / max(1, len(lines)))
    return {"text": text, "score": score, "bbox": bbox_norm, "raw_lines": lines}
