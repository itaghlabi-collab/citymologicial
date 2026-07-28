# CITYMO — Microservice OCR CIN (production)

Service FastAPI indépendant. **Aucun Tesseract en production.** OCR via PaddleOCR + zones templates.

## Endpoints

- `GET /health`
- `POST /v1/cin/analyze` — multipart `front` + `back` (+ `force`)
- `POST /v1/cin/analyze-json` — JSON data URLs
- Header `X-API-Key: $OCR_SERVICE_API_KEY`

## Variables

| Variable | Rôle |
|----------|------|
| `OCR_SERVICE_API_KEY` | Clé partagée avec le backend Node |
| `OCR_REQUIRE_API_KEY` | `true` en prod |
| `OCR_MAX_UPLOAD_BYTES` | Taille max |
| `OCR_TIMEOUT_SEC` | Timeout indicatif |
| `OCR_CORS_ORIGINS` | CORS |

## Local

```bash
cd ocr-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
OCR_REQUIRE_API_KEY=false uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
OCR_REQUIRE_API_KEY=false pytest app/tests -q
```

## Docker / Railway

```bash
docker build -t citymo-ocr .
docker run -p 8000:8000 -e OCR_SERVICE_API_KEY=secret citymo-ocr
```
