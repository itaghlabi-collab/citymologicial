"""Configuration runtime du microservice CIN OCR (aucune clé côté navigateur)."""
from __future__ import annotations

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = APP_DIR / "templates"

OCR_API_KEY = os.environ.get("OCR_SERVICE_API_KEY", "").strip()
CORS_ORIGINS = [o.strip() for o in os.environ.get("OCR_CORS_ORIGINS", "*").split(",") if o.strip()]
MAX_UPLOAD_BYTES = int(os.environ.get("OCR_MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
TIMEOUT_SEC = int(os.environ.get("OCR_TIMEOUT_SEC", "90"))
MIN_WIDTH = int(os.environ.get("OCR_MIN_WIDTH", "640"))
MIN_HEIGHT = int(os.environ.get("OCR_MIN_HEIGHT", "400"))
BLUR_THRESHOLD = float(os.environ.get("OCR_BLUR_THRESHOLD", "55"))
DARK_MEAN = float(os.environ.get("OCR_DARK_MEAN", "45"))
BRIGHT_MEAN = float(os.environ.get("OCR_BRIGHT_MEAN", "220"))
CONFIDENCE_FILL_MIN = float(os.environ.get("OCR_CONFIDENCE_FILL_MIN", "0.70"))
REQUIRE_API_KEY = os.environ.get("OCR_REQUIRE_API_KEY", "true").lower() in ("1", "true", "yes")

ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
