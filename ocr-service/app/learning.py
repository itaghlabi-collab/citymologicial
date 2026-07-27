"""
Base d'apprentissage CITYMO — fréquences noms / prénoms / villes.

Pas d'IA : dictionnaire de correspondance enrichi par les ouvriers existants.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Optional

logger = logging.getLogger("citymo.ocr.learning")

_lock = threading.Lock()

# Villes / communes fréquentes (Maroc) — graines
SEED_CITIES = [
    "CASABLANCA", "RABAT", "SALE", "SALA", "MARRAKECH", "FES", "FEZ", "TANGER", "AGADIR",
    "MEKNES", "OUJDA", "KENITRA", "TETOUAN", "SAFI", "MOHAMMEDIA", "EL JADIDA",
    "BENI MELLAL", "NADOR", "SETTAT", "BERRECHID", "BENSLIMANE", "KHOURIBGA",
    "LARACHE", "KSAR EL KEBIR", "TAZA", "ESSAOUIRA", "INEZGANE", "TEMARA",
    "SKHIRAT", "BOUSKOURA", "DAR BOUAZZA", "SIDI BERNNOUSSI", "AIN SEBAA",
    "HAY HASSANI", "SIDI OTHMANE", "SIDI MOUMEN", "MEDIOUNA", "NOUACEUR",
    "TIT MELLIL", "AZEMMAR", "AZEMMOUR", "BERKANE", "GUELMIM", "LAAYOUNE",
    "DAKHLA", "OUARZAZATE", "ERRACHIDIA", "IFRANE", "KHEMISSET", "SIDI SLIMANE",
]

SEED_NAMES = [
    "ALAOUI", "ALAOUI", "EL ALAOUI", "BENNANI", "BENJELLOUN", "IDRISSI", "EL IDRISSI",
    "AMRANI", "TAZI", "CHRAIBI", "FADILI", "MANSOURI", "FILALI", "OUAZZANI",
    "SQALLI", "BENCHEKROUN", "LAHLOU", "SEFRIOUI", "KETTANI", "BERRADA",
]

_DEFAULT_PATH = Path(os.environ.get(
    "CITYMO_LEARNING_PATH",
    str(Path(__file__).resolve().parent.parent / "data" / "learning.json"),
))


class LearningBase:
    def __init__(self, path: Optional[Path] = None):
        self.path = Path(path) if path else _DEFAULT_PATH
        self.noms: Counter = Counter()
        self.prenoms: Counter = Counter()
        self.villes: Counter = Counter()
        self._load_seeds()
        self.load()

    def _load_seeds(self) -> None:
        for c in SEED_CITIES:
            self.villes[c.upper()] += 3
        for n in SEED_NAMES:
            self.noms[n.upper()] += 2

    def load(self) -> None:
        try:
            if not self.path.exists():
                return
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.noms.update({k.upper(): int(v) for k, v in (data.get("noms") or {}).items()})
            self.prenoms.update({k.upper(): int(v) for k, v in (data.get("prenoms") or {}).items()})
            self.villes.update({k.upper(): int(v) for k, v in (data.get("villes") or {}).items()})
        except Exception as exc:
            logger.warning("Lecture learning base: %s", exc)

    def save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "noms": dict(self.noms),
                "prenoms": dict(self.prenoms),
                "villes": dict(self.villes),
            }
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
        except Exception as exc:
            logger.warning("Écriture learning base: %s", exc)

    def ingest_workers(self, workers: Iterable[dict[str, Any]]) -> dict[str, int]:
        """Incrémente à partir d'une liste {nom, prenom, ville_naissance|lieu}."""
        added = {"noms": 0, "prenoms": 0, "villes": 0}
        with _lock:
            for w in workers or []:
                nom = str(w.get("nom") or "").strip().upper()
                prenom = str(w.get("prenom") or "").strip().upper()
                ville = str(
                    w.get("ville_naissance")
                    or w.get("lieu_naissance")
                    or w.get("ville")
                    or ""
                ).strip().upper()
                if nom and len(nom) >= 2:
                    self.noms[nom] += 1
                    added["noms"] += 1
                if prenom and len(prenom) >= 2:
                    self.prenoms[prenom] += 1
                    added["prenoms"] += 1
                if ville and len(ville) >= 3:
                    self.villes[ville] += 1
                    added["villes"] += 1
            self.save()
        return added

    def prior(self, kind: str, value: str) -> float:
        """Score 0–1 basé sur la fréquence relative."""
        value = (value or "").strip().upper()
        if not value:
            return 0.0
        bucket = {
            "nom": self.noms,
            "prenom": self.prenoms,
            "ville": self.villes,
        }.get(kind)
        if not bucket:
            return 0.0
        count = bucket.get(value, 0)
        if count <= 0:
            # fuzzy soft match
            best = 0
            for k, c in bucket.items():
                if value in k or k in value:
                    best = max(best, c)
            count = best
        if count <= 0:
            return 0.0
        # saturates around 50 observations
        return min(1.0, count / 50.0)

    def best_match(self, kind: str, raw: str, max_dist: int = 2) -> tuple[str, float]:
        """Retourne (valeur_connue, score) si proche d'une entrée fréquente."""
        from .smart import edit_distance, normalize_person_token

        raw_n = normalize_person_token(raw) if kind != "ville" else (raw or "").strip().upper()
        if not raw_n:
            return "", 0.0
        bucket = {
            "nom": self.noms,
            "prenom": self.prenoms,
            "ville": self.villes,
        }.get(kind) or Counter()
        best_key = ""
        best_score = 0.0
        for key, count in bucket.most_common(400):
            d = edit_distance(raw_n, key)
            if d > max_dist and raw_n not in key and key not in raw_n:
                continue
            freq = min(1.0, count / 50.0)
            dist_score = 1.0 - (d / max(len(key), len(raw_n), 1))
            score = 0.55 * dist_score + 0.45 * freq
            if score > best_score:
                best_score = score
                best_key = key
        return best_key, best_score

    def stats(self) -> dict[str, Any]:
        return {
            "noms": len(self.noms),
            "prenoms": len(self.prenoms),
            "villes": len(self.villes),
            "path": str(self.path),
            "top_noms": self.noms.most_common(10),
            "top_villes": self.villes.most_common(10),
        }


_BASE: Optional[LearningBase] = None


def get_learning_base() -> LearningBase:
    global _BASE
    if _BASE is None:
        _BASE = LearningBase()
    return _BASE
