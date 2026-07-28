"""Validation métier stricte — aucune valeur parasite acceptée."""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime
from typing import Optional, Tuple

_MULTI_SPACE = re.compile(r"\s+")
_DIGIT = re.compile(r"\d")
_LABEL_NOISE = re.compile(
    r"\b(?:NOM|PRENOM|PRÉNOM|SURNAM?E|GIVEN|NAME|NATIONALIT[EÉ]|SEXE|SEX|"
    r"N[EÉ][EÉ]?|LE|LA|DU|DE|DES|CARTE|NATIONALE|IDENTIT[EÉ]|ROYAUME|MAROC|"
    r"VALABLE|JUSQU|AU|DATE|LIEU|NAISSANCE|BORN|PLACE|ADRESSE|DELIVREE|"
    r"D[EÉ]LIVRANCE|EXPIRATION|AUTORIT[EÉ])\b",
    re.I,
)
_MRZ_LIKE = re.compile(r"[<]{2,}|(?:[A-Z0-9]<){3,}|^[A-Z0-9]{10,}$")
_CIN_RE = re.compile(r"^[A-Z]{1,2}\d{4,7}$")
_NAME_CHARS = re.compile(r"^[A-Za-zÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒàâäçéèêëîïôöùûüÿæœ][A-Za-zÀ-ÿÆŒæœ\-\s']{0,44}$")


def clean_spaces(s: str) -> str:
    return _MULTI_SPACE.sub(" ", (s or "").strip())


def strip_accents(s: str) -> str:
    nk = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in nk if unicodedata.category(c) != "Mn")


def remove_label_noise(s: str) -> str:
    return clean_spaces(_LABEL_NOISE.sub(" ", s or ""))


def normalize_cin_raw(raw: str) -> str:
    t = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    # confusions OCR fréquentes sur segment numérique
    if len(t) >= 5:
        letters = re.match(r"^[A-Z]{1,2}", t)
        if letters:
            head = letters.group(0)
            rest = t[len(head) :]
            rest = rest.replace("O", "0").replace("I", "1").replace("L", "1").replace("S", "5").replace("B", "8")
            t = head + rest
    return t


def validate_cin(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    if not raw:
        return None, False
    t = normalize_cin_raw(raw)
    if not _CIN_RE.match(t):
        return None, False
    # rejeter concaténations type ROPI9VXW75BE884115
    if len(t) > 9:
        return None, False
    return t, True


def validate_person_name(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    if not raw:
        return None, False
    if _DIGIT.search(raw):
        return None, False
    t = remove_label_noise(raw)
    t = clean_spaces(re.sub(r"[^A-Za-zÀ-ÿÆŒæœ\-\s']", "", t))
    if len(t) < 2 or len(t) > 45:
        return None, False
    if _MRZ_LIKE.search(t.replace(" ", "")):
        return None, False
    # rejeter CIN déguisée
    compact = re.sub(r"[^A-Z0-9]", "", strip_accents(t).upper())
    if _CIN_RE.match(compact):
        return None, False
    if not _NAME_CHARS.match(t):
        return None, False
    # trop peu de voyelles = bruit OCR
    letters = re.sub(r"[^A-Za-zÀ-ÿ]", "", strip_accents(t).upper())
    if len(letters) >= 8:
        vowels = len(re.findall(r"[AEIOUY]", letters))
        if vowels / max(1, len(letters)) < 0.18:
            return None, False
    return t.upper(), True


def validate_arabic_name(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    if not raw:
        return None, False
    t = clean_spaces(raw)
    # garder caractères arabes + espaces
    t = re.sub(r"[^\u0600-\u06FF\s]", "", t)
    t = clean_spaces(t)
    if len(t) < 2 or len(t) > 60:
        return None, False
    if _DIGIT.search(t):
        return None, False
    return t, True


def _parse_date_token(raw: str) -> Optional[str]:
    t = clean_spaces(raw or "")
    t = re.sub(r"[Oo]", "0", t)
    t = re.sub(r"[Il|]", "1", t)
    t = re.sub(r"[Ss]", "5", t)
    m = re.search(r"(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})", t)
    if not m:
        m = re.search(r"(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})", t)
        if m:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        else:
            return None
    else:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 1900 if y > 30 else 2000
    try:
        dt = date(y, mo, d)
    except ValueError:
        return None
    return dt.isoformat()


def validate_date(raw: Optional[str], role: str = "naissance") -> Tuple[Optional[str], bool]:
    iso = _parse_date_token(raw or "")
    if not iso:
        return None, False
    try:
        dt = datetime.strptime(iso, "%Y-%m-%d").date()
    except ValueError:
        return None, False
    today = date.today()
    if role == "naissance":
        if dt > today:
            return None, False
        age = (today - dt).days / 365.25
        if age < 14 or age > 100:
            return None, False
    if role in ("delivrance", "expiration"):
        if dt.year < 1990 or dt.year > today.year + 20:
            return None, False
    return iso, True


def validate_dates_pair(naissance: Optional[str], delivrance: Optional[str], expiration: Optional[str]) -> dict:
    out = {}
    n, ok_n = validate_date(naissance, "naissance") if naissance else (None, False)
    d, ok_d = validate_date(delivrance, "delivrance") if delivrance else (None, False)
    e, ok_e = validate_date(expiration, "expiration") if expiration else (None, False)
    if ok_d and ok_e and d and e and e < d:
        ok_e = False
        e = None
    out["date_naissance"] = (n, ok_n)
    out["date_delivrance"] = (d, ok_d)
    out["date_expiration"] = (e, ok_e)
    return out


def validate_sexe(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    t = (raw or "").upper()
    if re.search(r"\bF\b|FEM", t):
        return "F", True
    if re.search(r"\bM\b|MASC|HOMME", t):
        return "M", True
    t2 = re.sub(r"[^MF]", "", t)
    if t2[:1] in ("M", "F"):
        return t2[:1], True
    return None, False


def validate_nationalite(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    """Ne jamais accepter « À », « A », symbole ou vide comme nationalité."""
    t = clean_spaces(raw or "")
    if not t:
        return None, False
    if len(t) <= 2:
        return None, False
    if re.fullmatch(r"[ÀÂÄAÁÄÅÆàâäa\W]+", t):
        return None, False
    up = strip_accents(t).upper()
    if up in {"A", "AU", "LA", "LE", "DE", "DU", "ET", "OU"}:
        return None, False
    if "MAROC" in up or up in {"MA", "MAR", "MOROCCAN", "MOROCCANNE"}:
        return "Marocaine", True
    # nationalité alphabétique plausible
    letters = re.sub(r"[^A-Za-zÀ-ÿ\s\-]", "", t)
    if len(letters) < 4:
        return None, False
    return letters[:40].strip().capitalize(), True


def validate_city(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    t = remove_label_noise(raw or "")
    t = re.sub(r"[^A-Za-zÀ-ÿÆŒæœ\-\s']", "", t)
    t = clean_spaces(t)
    if len(t) < 3 or _DIGIT.search(t):
        return None, False
    if _MRZ_LIKE.search(t.replace(" ", "")):
        return None, False
    return t.upper(), True


def validate_address(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    t = clean_spaces(remove_label_noise(raw or ""))
    if len(t) < 5 or len(t) > 120:
        return None, False
    return t, True
