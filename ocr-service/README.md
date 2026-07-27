# CITYMO — Service OCR CIN (indépendant de Express)

## Architecture

```
Vercel (React)
   → API CITYMO Express (proxy léger uniquement)
      → OCR SERVICE Python (ce dossier)
           ├── OpenCV
           ├── PaddleOCR 3.x  — fr_PP-OCRv5 + arabic_PP-OCRv5
           └── Parser CIN Maroc (cerveau + base d'apprentissage)
   → Supabase Storage (images privées)
```

Express **ne charge jamais** Paddle ni OpenCV. Si l'OCR plante, l'ERP continue.

## Ressources Railway recommandées

| | |
|--|--|
| vCPU | **2** |
| RAM | **4 Go** |
| Disque | 5 Go+ (modèles) |

## Modèles

| Rôle | Identifiant |
|------|-------------|
| Latin / français | `fr_PP-OCRv5` |
| Arabe | `arabic_PP-OCRv5` |
| Package | PaddleOCR **3.x** |
| Secours | Tesseract `fra+ara` |

`GET /health` expose `engine.models` et la version installée.

## Démarrage local

```bash
cd ocr-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install paddlepaddle==3.0.0 "paddleocr>=3.0.0,<4"
# OS : tesseract-ocr tesseract-ocr-fra tesseract-ocr-ara
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

API Express :

```bash
OCR_SERVICE_URL=http://127.0.0.1:8000
```

## Base d'apprentissage

`POST /learning/sync` avec `{ "workers": [{ "nom", "prenom", "ville_naissance" }] }`  
enrichit noms / prénoms / villes (Casablanca, Mohammedia, Berrechid, Settat, …).

## Tests

```bash
pytest tests/
```
