"""Tests API santé + analyse qualité (sans Paddle obligatoire)."""
import os

os.environ["OCR_REQUIRE_API_KEY"] = "false"

import numpy as np
import cv2
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _jpeg_bytes(w=800, h=500, blur=False, dark=False):
    img = np.full((h, w, 3), 180 if not dark else 20, dtype=np.uint8)
    # rectangle carte
    cv2.rectangle(img, (80, 60), (w - 80, h - 60), (240, 240, 240), -1)
    cv2.rectangle(img, (80, 60), (w - 80, h - 60), (30, 30, 30), 3)
    if blur:
        img = cv2.GaussianBlur(img, (31, 31), 0)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["tesseract"] is False
    assert "/v1/cin/analyze" in body["endpoints"]


def test_analyze_missing_faces():
    r = client.post("/v1/cin/analyze-json", json={"front": "", "back": ""})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["error_code"] == "INVALID_FILE"


def test_analyze_blurry():
    import base64

    b = _jpeg_bytes(blur=True)
    data = "data:image/jpeg;base64," + base64.b64encode(b).decode()
    r = client.post("/v1/cin/analyze-json", json={"front": data, "back": data, "force": False})
    assert r.status_code == 200
    body = r.json()
    # flou ou carte — code métier attendu
    assert body["ok"] is False
    assert body["error_code"] in {
        "IMAGE_TOO_BLURRY",
        "CARD_NOT_FOUND",
        "CARD_PARTIALLY_VISIBLE",
        "OCR_FAILED",
    }


def test_analyze_dark():
    import base64

    # image entièrement sombre (pas de carte claire)
    img = np.full((500, 800, 3), 15, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    data = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()
    r = client.post("/v1/cin/analyze-json", json={"front": data, "back": data})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["error_code"] in {
        "IMAGE_TOO_DARK",
        "CARD_NOT_FOUND",
        "IMAGE_TOO_BLURRY",
        "CARD_PARTIALLY_VISIBLE",
    }
