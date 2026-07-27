# CITYMO — Service OCR CIN (OpenCV + PaddleOCR + Tesseract)

## Rôle

Analyse gratuite des CIN marocaines (recto/verso), sans Mindee.

## Démarrage local

```bash
cd ocr-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Optionnel Paddle :
# pip install paddlepaddle==2.6.2 paddleocr==2.9.1
# Système : tesseract-ocr tesseract-ocr-fra tesseract-ocr-ara
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Express (Railway / local) :

```bash
OCR_SERVICE_URL=http://127.0.0.1:8000
```

Frontend appelle `POST /api/ocr/moroccan-cin` (proxy Express ou Vercel → ce service).

## Railway

- Service séparé recommandé (Dockerfile de ce dossier).
- RAM : **2 Go minimum** si PaddleOCR ; 1 Go possible avec Tesseract seul.
- CPU : 1–2 vCPU.
- Variables : aucune clé payante. `OCR_CORS_ORIGINS` optionnel.

## Santé

`GET /health` → `{ paddleocr, tesseract, version }`

## Tests

```bash
pytest tests/
```
