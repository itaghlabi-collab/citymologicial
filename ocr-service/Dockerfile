# CITYMO CIN OCR — service Python (Railway séparé recommandé)
FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fra \
    tesseract-ocr-ara \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir paddlepaddle==2.6.2 paddleocr==2.9.1 || true

COPY app ./app

ENV OCR_MAX_UPLOAD_BYTES=12582912
ENV OCR_TIMEOUT_SEC=90
EXPOSE 8000

# ~2 Go RAM recommandés sur Railway si PaddleOCR activé
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "120"]
