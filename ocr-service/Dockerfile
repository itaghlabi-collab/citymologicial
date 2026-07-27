# CITYMO CIN OCR — service Python INDÉPENDANT (Railway dédié)
# Ne pas fusionner avec l'API Express.
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
    && pip install --no-cache-dir "paddlepaddle==3.0.0" "paddleocr>=3.0.0,<4" || \
       pip install --no-cache-dir "paddleocr>=2.7,<3" || true

COPY app ./app
RUN mkdir -p /app/data

ENV OCR_MAX_UPLOAD_BYTES=12582912
ENV OCR_TIMEOUT_SEC=90
ENV CITYMO_LEARNING_PATH=/app/data/learning.json
EXPOSE 8000

# Ressources recommandées Railway : 2 vCPU · 4 Go RAM
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "120"]
