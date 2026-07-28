"""Chargement et sélection des templates CIN."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ..config import TEMPLATES_DIR


def load_templates(face: str) -> List[Dict[str, Any]]:
    out = []
    for path in sorted(TEMPLATES_DIR.glob(f"cin_ma_{'front' if face == 'front' else 'back'}_*.json")):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["_path"] = str(path)
        out.append(data)
    return out


def score_template_fields(fields: Dict[str, Any]) -> float:
    """Score = somme confidences des champs valides."""
    total = 0.0
    n = 0
    for f in fields.values():
        if getattr(f, "valid", False):
            total += float(getattr(f, "confidence", 0) or 0)
            n += 1
    # bonus pour cin + nom + prenom
    keys = set(fields.keys())
    bonus = 0.0
    for k in ("cin", "nom", "prenom"):
        fr = fields.get(k)
        if fr is not None and getattr(fr, "valid", False):
            bonus += 0.15
    return total + bonus + (0.05 * n)
