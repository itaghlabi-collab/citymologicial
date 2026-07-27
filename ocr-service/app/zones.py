"""
Zones OCR spécialisées CIN marocaine (CNIE / carte biométrique).

Coordonnées relatives 0–1 sur la carte redressée (après warp perspective).
Chaque champ est OCRisé séparément — jamais toute la carte d'un coup.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


LangKind = Literal["fra", "ara", "digits", "mrz", "mixed"]


@dataclass(frozen=True)
class Zone:
    field: str
    x: float
    y: float
    w: float
    h: float
    lang: LangKind = "fra"
    psm: int = 7  # Tesseract: ligne unique
    whitelist: str = ""
    pad: float = 0.012
    # Upscale min pour petites zones
    min_height_px: int = 48


# Whitelists Tesseract
_WL_NAME = "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ-' "
_WL_CITY = "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ-' "
_WL_CIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_WL_DATE = "0123456789./- "
_WL_SEXE = "MF"
_WL_MRZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
_WL_NAT = "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ "


# Recto CNIE — colonne texte à droite de la photo (~30–95 %)
RECTO_ZONES: list[Zone] = [
    Zone("nom_arabe", 0.30, 0.06, 0.64, 0.12, lang="ara", psm=7, whitelist="", pad=0.01),
    Zone("prenom_arabe", 0.30, 0.14, 0.64, 0.10, lang="ara", psm=7, whitelist="", pad=0.01),
    # Valeurs latines (sous les libellés NOM / PRÉNOM)
    Zone("nom", 0.30, 0.22, 0.64, 0.11, lang="fra", psm=7, whitelist=_WL_NAME),
    Zone("prenom", 0.30, 0.32, 0.64, 0.11, lang="fra", psm=7, whitelist=_WL_NAME),
    Zone("date_naissance", 0.30, 0.42, 0.42, 0.10, lang="digits", psm=7, whitelist=_WL_DATE),
    Zone("lieu_naissance", 0.30, 0.51, 0.58, 0.10, lang="fra", psm=7, whitelist=_WL_CITY),
    Zone("sexe", 0.30, 0.60, 0.22, 0.09, lang="fra", psm=7, whitelist=_WL_SEXE + " "),
    Zone("nationalite", 0.50, 0.60, 0.44, 0.09, lang="fra", psm=7, whitelist=_WL_NAT),
    # N° CIN — colonne droite
    Zone("numero_cin", 0.30, 0.70, 0.55, 0.14, lang="digits", psm=7, whitelist=_WL_CIN),
    # Variante sous / près photo (certaines émissions)
    Zone("numero_cin_alt", 0.04, 0.78, 0.28, 0.14, lang="digits", psm=7, whitelist=_WL_CIN),
]

# Verso — adresse / autorité / dates / MRZ bas
VERSO_ZONES: list[Zone] = [
    Zone("adresse", 0.05, 0.06, 0.90, 0.22, lang="mixed", psm=6, whitelist=""),
    Zone("autorite", 0.05, 0.28, 0.90, 0.14, lang="fra", psm=7, whitelist=_WL_CITY),
    Zone("date_emission", 0.05, 0.42, 0.42, 0.12, lang="digits", psm=7, whitelist=_WL_DATE),
    Zone("date_expiration", 0.48, 0.42, 0.46, 0.12, lang="digits", psm=7, whitelist=_WL_DATE),
    Zone("mrz", 0.02, 0.60, 0.96, 0.36, lang="mrz", psm=6, whitelist=_WL_MRZ, pad=0.005, min_height_px=64),
]


def zones_for_side(side: str) -> list[Zone]:
    return list(VERSO_ZONES if side == "verso" else RECTO_ZONES)


def zones_as_dict() -> dict:
    """Export JSON pour sync client / docs."""
    def ser(z: Zone) -> dict:
        return {
            "field": z.field,
            "x": z.x,
            "y": z.y,
            "w": z.w,
            "h": z.h,
            "lang": z.lang,
            "psm": z.psm,
            "whitelist": z.whitelist,
            "pad": z.pad,
            "min_height_px": z.min_height_px,
        }

    return {
        "recto": [ser(z) for z in RECTO_ZONES],
        "verso": [ser(z) for z in VERSO_ZONES],
    }
