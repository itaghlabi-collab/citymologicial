"""Moteurs OCR : PaddleOCR (prioritaire) + Tesseract (secours)."""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import cv2
import numpy as np

logger = logging.getLogger("citymo.ocr.engines")

_paddle = None
_paddle_error: Optional[str] = None


def paddle_available() -> bool:
    global _paddle, _paddle_error
    if _paddle is not None:
        return True
    if _paddle_error and os.environ.get("OCR_RETRY_PADDLE") != "1":
        return False
    try:
        from paddleocr import PaddleOCR  # type: ignore

        # fra + arabic via use_angle_cls ; lang latin puis ar
        _paddle = PaddleOCR(
            use_angle_cls=True,
            lang="fr",
            show_log=False,
            use_gpu=False,
        )
        return True
    except Exception as exc:
        _paddle_error = str(exc)
        logger.warning("PaddleOCR indisponible: %s", exc)
        return False


def run_paddle(image_bgr: np.ndarray) -> dict[str, Any]:
    if not paddle_available():
        raise RuntimeError(_paddle_error or "PaddleOCR indisponible")
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    result = _paddle.ocr(rgb, cls=True)
    lines = []
    confs = []
    boxes = []
    if result:
        for block in result:
            if not block:
                continue
            for item in block:
                box, (txt, conf) = item[0], item[1]
                if txt:
                    lines.append(txt)
                    confs.append(float(conf))
                    boxes.append({"text": txt, "confidence": float(conf), "box": box})
    # Deuxième passe arabe si possible
    try:
        from paddleocr import PaddleOCR  # type: ignore

        ocr_ar = PaddleOCR(use_angle_cls=True, lang="ar", show_log=False, use_gpu=False)
        result_ar = ocr_ar.ocr(rgb, cls=True)
        if result_ar:
            for block in result_ar:
                if not block:
                    continue
                for item in block:
                    box, (txt, conf) = item[0], item[1]
                    if txt and txt not in lines:
                        lines.append(txt)
                        confs.append(float(conf))
                        boxes.append({"text": txt, "confidence": float(conf), "box": box})
    except Exception as exc:
        logger.info("Passe arabe Paddle ignorée: %s", exc)

    avg = sum(confs) / len(confs) if confs else 0.0
    return {
        "engine": "paddleocr",
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
    # fra + ara si packs installés ; sinon fra
    langs = "fra+ara"
    try:
        data = pytesseract.image_to_data(pil, lang=langs, output_type=pytesseract.Output.DICT)
    except Exception:
        langs = "fra"
        data = pytesseract.image_to_data(pil, lang=langs, output_type=pytesseract.Output.DICT)

    lines = []
    confs = []
    boxes = []
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
        boxes.append(
            {
                "text": txt,
                "confidence": conf / 100.0,
                "box": [
                    data["left"][i],
                    data["top"][i],
                    data["width"][i],
                    data["height"][i],
                ],
            }
        )
    text = pytesseract.image_to_string(pil, lang=langs)
    avg = sum(confs) / len(confs) if confs else 0.0
    return {
        "engine": "tesseract",
        "engine_langs": langs,
        "text": text,
        "avg_confidence": avg,
        "lines": boxes,
    }


def run_best_ocr(variants: dict[str, np.ndarray], min_conf: float = 0.45) -> dict[str, Any]:
    """Teste variantes ; conserve le meilleur score. Paddle puis Tesseract."""
    best: Optional[dict[str, Any]] = None
    errors = []

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
            "Service OCR indisponible — installez PaddleOCR ou Tesseract (fra+ara)."
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

        # Si paddle a donné un résultat correct, pas besoin tesseract
        if best and best.get("engine") == "paddleocr" and best["avg_confidence"] >= min_conf:
            break

    if best is None:
        raise RuntimeError("Aucun texte détecté — " + "; ".join(errors[:3]))

    if best["avg_confidence"] < min_conf and "tesseract" not in {e[0] for e in engines}:
        pass
    return best
