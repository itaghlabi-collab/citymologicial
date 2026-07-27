"""
Post-traitement spécialisé champs CIN marocaine.

- suppression parasites
- corrections OCR fréquentes
- validation CIN / dates
- nettoyage accents & espaces
- rejet des « noms » type MRZ / alphanum bruit
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional

from .smart import (
    cin_variants,
    normalize_person_token,
    pick_best_cin,
    score_cin_candidate,
    score_date_iso,
    score_person_name,
)


_LABEL_NOISE = re.compile(
    r"\b(?:NOM|PRENOM|PRÉNOM|SURNAM?E|GIVEN|NAME|NATIONALIT[EÉ]|SEXE|SEX|"
    r"N[EÉ][EÉ]?|LE|LA|DU|DE|DES|CARTE|NATIONALE|IDENTIT[EÉ]|ROYAUME|MAROC|"
    r"VALABLE|JUSQU|AU|DATE|LIEU|NAISSANCE|BORN|PLACE)\b",
    re.I,
)

_MRZ_LIKE = re.compile(r"[<]{2,}|(?:[A-Z0-9]<){3,}|^[A-Z0-9]{10,}$")
_DIGIT_HEAVY = re.compile(r"\d")
_MULTI_SPACE = re.compile(r"\s+")


def strip_accents_keep_case(s: str) -> str:
    """NFD puis retire diacritiques — utile pour matching, pas pour affichage."""
    nk = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in nk if unicodedata.category(c) != "Mn")


def clean_spaces(s: str) -> str:
    return _MULTI_SPACE.sub(" ", (s or "").strip())


def remove_label_noise(s: str) -> str:
    t = _LABEL_NOISE.sub(" ", s or "")
    return clean_spaces(t)


def fix_ocr_letter_digit_confusions_in_cin(raw: str) -> str:
    best, score, _ = pick_best_cin([raw])
    if best and score >= 0.5:
        return best
    variants = cin_variants(raw)
    return variants[0] if variants else re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()


def is_plausible_person_name(value: str) -> bool:
    raw = value or ""
    # Un vrai nom ne contient jamais de chiffres (évite ROPI9VXW7…)
    if _DIGIT_HEAVY.search(raw):
        return False
    v = normalize_person_token(raw)
    if len(v) < 2 or len(v) > 45:
        return False
    if _MRZ_LIKE.search(v.replace(" ", "")):
        return False
    compact = re.sub(r"[^A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]", "", v)
    if len(compact) >= 8:
        vowels = len(re.findall(r"[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]", compact))
        if vowels / max(1, len(compact)) < 0.18:
            return False
    # CIN réelle uniquement (lettres + chiffres déjà présents) — ne pas
    # appliquer les confusions OCR O→0 sur des noms purement alphabétiques
    # (sinon "EL ALAOUI" → faux positif CIN).
    compact_alnum = re.sub(r"[^A-Z0-9]", "", v)
    if re.match(r"^[A-Z]{1,2}\d{4,7}$", compact_alnum):
        return False
    if score_person_name(v) < 0.35:
        return False
    return True


def clean_person_name(raw: str) -> str:
    if _DIGIT_HEAVY.search(raw or ""):
        return ""
    t = remove_label_noise(raw or "")
    t = normalize_person_token(t)
    t = clean_spaces(t)
    if not is_plausible_person_name(t):
        return ""
    return t


def clean_city(raw: str) -> str:
    t = remove_label_noise(raw or "")
    t = re.sub(r"[^A-Za-zÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ\-\s']", "", t)
    t = clean_spaces(t).upper()
    if len(t) < 3 or _DIGIT_HEAVY.search(t):
        return ""
    if _MRZ_LIKE.search(t.replace(" ", "")):
        return ""
    return t


def clean_date(raw: str) -> str:
    """Retourne ISO YYYY-MM-DD ou ''."""
    from .parser import parse_date_token

    t = clean_spaces(raw or "")
    t = re.sub(r"[Oo]", "0", t)
    t = re.sub(r"[Il|]", "1", t)
    t = re.sub(r"[Ss]", "5", t)
    iso = parse_date_token(t)
    return iso or ""


def validate_date(iso: str, role: str) -> str:
    if not iso:
        return ""
    if score_date_iso(iso, role) < 0.3:
        return ""
    return iso


def clean_cin(raw: str) -> str:
    t = fix_ocr_letter_digit_confusions_in_cin(raw or "")
    if score_cin_candidate(t) < 0.5:
        return ""
    m = re.match(r"^([A-Z]{1,2})(\d{4,7})$", t)
    return f"{m.group(1)}{m.group(2)}" if m else ""


def clean_sexe(raw: str) -> str:
    t = (raw or "").upper()
    if re.search(r"\bF\b|FEM", t):
        return "F"
    if re.search(r"\bM\b|MASC", t):
        return "M"
    t2 = re.sub(r"[^MF]", "", t)
    if t2[:1] in ("M", "F"):
        return t2[:1]
    return ""


def clean_nationalite(raw: str) -> str:
    t = clean_spaces(raw or "").upper()
    if not t or re.search(r"MAROC|MAR\b|MA\b", t):
        return "Marocaine"
    t = remove_label_noise(t)
    return clean_spaces(t)[:40] or "Marocaine"


def clean_mrz_block(raw: str) -> str:
    lines = []
    for line in (raw or "").upper().splitlines():
        cleaned = re.sub(r"[^A-Z0-9<]", "", line.replace(" ", ""))
        if len(cleaned) >= 20:
            lines.append(cleaned)
    return "\n".join(lines)


def postprocess_zone_text(field: str, raw: str) -> str:
    """Nettoie le texte brut d'une zone selon le type de champ."""
    if not raw or not str(raw).strip():
        return ""
    f = field.replace("_alt", "")
    if f in ("nom", "prenom"):
        return clean_person_name(raw)
    if f in ("nom_arabe", "prenom_arabe"):
        # Garder caractères arabes uniquement
        ar = re.findall(r"[\u0600-\u06FF\s]+", raw)
        return clean_spaces(" ".join(ar))
    if f == "numero_cin":
        return clean_cin(raw)
    if f in ("date_naissance", "date_expiration", "date_emission"):
        role = "naissance" if "naissance" in f or "emission" in f else "expiration"
        if f == "date_emission":
            role = "expiration"  # passé récent OK via score expiration soft
        iso = clean_date(raw)
        if f == "date_naissance":
            return validate_date(iso, "naissance")
        if f == "date_expiration":
            return validate_date(iso, "expiration")
        return iso
    if f == "lieu_naissance" or f == "autorite":
        return clean_city(raw)
    if f == "sexe":
        return clean_sexe(raw)
    if f == "nationalite":
        return clean_nationalite(raw)
    if f == "mrz":
        return clean_mrz_block(raw)
    if f == "adresse":
        return clean_spaces(remove_label_noise(raw))[:120]
    return clean_spaces(raw)


def prefer_non_empty(*values: str) -> str:
    for v in values:
        if v and str(v).strip():
            return str(v).strip()
    return ""
