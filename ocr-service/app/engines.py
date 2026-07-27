"""
Moteurs OCR CITYMO — service Python indépendant (jamais dans Express).

Stack déclarée :
  PaddleOCR 3.x
  Modèles : fr_PP-OCRv5 , arabic_PP-OCRv5
  Secours : Tesseract fra+ara
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import cv2
import numpy as np

logger = logging.getLogger("citymo.ocr.engines")

PADDLE_PACKAGE_TARGET = "3.x"
MODEL_FR = "fr_PP-OCRv5"
MODEL_AR = "arabic_PP-OCRv5"

_paddle_fr = None
_paddle_ar = None
_paddle_error: Optional[str] = None
_paddle_version: Optional[str] = None


def engine_manifest() -> dict[str, Any]:
    return {
        "paddleocr_target": PADDLE_PACKAGE_TARGET,
        "paddleocr_installed": _paddle_version,
        "models": {
            "latin": MODEL_FR,
            "arabic": MODEL_AR,
        },
        "fallback": "tesseract-fra+ara",
        "paddle_ready": _paddle_fr is not None,
        "tesseract_ready": tesseract_available(),
    }


def _init_paddle_instance(lang: str, model_name: str):
    from paddleocr import PaddleOCR  # type: ignore

    # PaddleOCR 3.x : ocr_version PP-OCRv5 ; 2.x ignore ocr_version
    kwargs = {
        "use_angle_cls": True,
        "lang": lang,
        "use_gpu": False,
    }
    try:
        kwargs["ocr_version"] = "PP-OCRv5"
        kwargs["show_log"] = False
        return PaddleOCR(**kwargs), model_name
    except TypeError:
        kwargs.pop("ocr_version", None)
        try:
            return PaddleOCR(**kwargs), f"{model_name} (compat)"
        except TypeError:
            kwargs.pop("show_log", None)
            return PaddleOCR(use_angle_cls=True, lang=lang), f"{model_name} (compat)"


def paddle_available() -> bool:
    global _paddle_fr, _paddle_ar, _paddle_error, _paddle_version
    if _paddle_fr is not None:
        return True
    if _paddle_error and os.environ.get("OCR_RETRY_PADDLE") != "1":
        return False
    try:
        import paddleocr as po  # type: ignore

        _paddle_version = getattr(po, "__version__", "unknown")
        _paddle_fr, _ = _init_paddle_instance("fr", MODEL_FR)
        try:
            _paddle_ar, _ = _init_paddle_instance("ar", MODEL_AR)
        except Exception as exc:
            logger.warning("Modèle arabe indisponible: %s", exc)
            _paddle_ar = None
        return True
    except Exception as exc:
        _paddle_error = str(exc)
        logger.warning("PaddleOCR indisponible: %s", exc)
        return False


def _collect_paddle(ocr_engine, image_rgb: np.ndarray) -> tuple[list[str], list[float], list[dict]]:
    result = ocr_engine.ocr(image_rgb, cls=True)
    lines, confs, boxes = [], [], []
    if not result:
        return lines, confs, boxes
    for block in result:
        if not block:
            continue
        for item in block:
            try:
                box, (txt, conf) = item[0], item[1]
            except Exception:
                continue
            if txt:
                lines.append(str(txt))
                confs.append(float(conf))
                boxes.append({"text": str(txt), "confidence": float(conf), "box": box})
    return lines, confs, boxes


def run_paddle(image_bgr: np.ndarray) -> dict[str, Any]:
    if not paddle_available():
        raise RuntimeError(_paddle_error or "PaddleOCR indisponible")
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    lines, confs, boxes = _collect_paddle(_paddle_fr, rgb)
    models_used = [MODEL_FR]
    if _paddle_ar is not None:
        try:
            ar_lines, ar_confs, ar_boxes = _collect_paddle(_paddle_ar, rgb)
            for i, txt in enumerate(ar_lines):
                if txt not in lines:
                    lines.append(txt)
                    confs.append(ar_confs[i])
                    boxes.append(ar_boxes[i])
            models_used.append(MODEL_AR)
        except Exception as exc:
            logger.info("Passe arabe ignorée: %s", exc)

    avg = sum(confs) / len(confs) if confs else 0.0
    return {
        "engine": "paddleocr",
        "engine_version": _paddle_version or PADDLE_PACKAGE_TARGET,
        "models": models_used,
        "text": "\n".join(lines),
        "avg_confidence": avg,
        "lines": boxes,
    }


def tesseract_available() -> bool:
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def run_tesseract(image_bgr: np.ndarray) -> dict[str, Any]:
    import pytesseract
    from PIL import Image

    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    langs = "fra+ara"
    try:
        data = pytesseract.image_to_data(pil, lang=langs, output_type=pytesseract.Output.DICT)
    except Exception:
        langs = "fra"
        data = pytesseract.image_to_data(pil, lang=langs, output_type=pytesseract.Output.DICT)

    lines, confs, boxes = [], [], []
    n = len(data.get("text", []))
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        try:
            conf = float(data["conf"][i])
        except Exception:
            conf = -1
        if conf < 0:
            continue
        lines.append(txt)
        confs.append(conf / 100.0)
        boxes.append({
            "text": txt,
            "confidence": conf / 100.0,
            "box": [data["left"][i], data["top"][i], data["width"][i], data["height"][i]],
        })
    text = pytesseract.image_to_string(pil, lang=langs)
    avg = sum(confs) / len(confs) if confs else 0.0
    return {
        "engine": "tesseract",
        "engine_version": langs,
        "models": [langs],
        "text": text,
        "avg_confidence": avg,
        "lines": boxes,
    }


def run_best_ocr(variants: dict[str, np.ndarray], min_conf: float = 0.45) -> dict[str, Any]:
    best: Optional[dict[str, Any]] = None
    errors: list[str] = []

    def consider(res: dict[str, Any], variant: str) -> None:
        nonlocal best
        res = {**res, "variant": variant}
        if best is None or res["avg_confidence"] > best["avg_confidence"]:
            best = res

    engines = []
    if paddle_available():
        engines.append(("paddle", run_paddle))
    if tesseract_available():
        engines.append(("tesseract", run_tesseract))

    if not engines:
        raise RuntimeError(
            "Service OCR indisponible — installez PaddleOCR 3.x (fr_PP-OCRv5 / arabic_PP-OCRv5) "
            "ou Tesseract fra+ara."
        )

    for name, fn in engines:
        for vname, img in variants.items():
            try:
                res = fn(img)
                consider(res, vname)
                if res["avg_confidence"] >= 0.85 and len(res.get("text") or "") > 40:
                    return best  # type: ignore
            except Exception as exc:
                errors.append(f"{name}/{vname}: {exc}")
                logger.warning("OCR %s/%s échoué: %s", name, vname, exc)
        if best and best.get("engine") == "paddleocr" and best["avg_confidence"] >= min_conf:
            break

    if best is None:
        raise RuntimeError("Aucun texte détecté — " + "; ".join(errors[:3]))
    return best
