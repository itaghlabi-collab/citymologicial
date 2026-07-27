"""
Cerveau du parser CITYMO — ranking intelligent des candidats OCR.

L'OCR lit. Ce module décide (CIN, dates, noms, villes) avec scores.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Iterable, Optional


# Confusions OCR fréquentes (lettre ↔ chiffre)
OCR_CONFUSIONS = str.maketrans({
    "O": "0", "Q": "0", "D": "0",
    "I": "1", "L": "1", "|": "1",
    "Z": "2",
    "A": "4",
    "S": "5",
    "G": "6", "B": "8",
    "T": "7",
})

DIGIT_TO_LETTER = str.maketrans({
    "0": "O",
    "1": "I",
    "5": "S",
    "8": "B",
})


def edit_distance(a: str, b: str) -> int:
    a, b = a or "", b or ""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def normalize_person_token(s: str) -> str:
    s = (s or "").upper()
    s = re.sub(r"[^A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\-\s']", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def cin_variants(raw: str) -> list[str]:
    """Génère des variantes plausibles d'un token CIN lu par OCR."""
    s = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    if not s:
        return []
    out = {s}
    m = re.match(r"^([A-Z0-9]{1,2})([A-Z0-9]{4,8})$", s)
    if not m:
        return list(out)
    prefix, digits = m.group(1), m.group(2)
    p1 = prefix.translate(DIGIT_TO_LETTER)
    p1 = re.sub(r"[^A-Z]", "", p1)[:2] or re.sub(r"[^A-Z]", "", prefix.translate(DIGIT_TO_LETTER))
    d1 = re.sub(r"[^0-9]", "", digits.translate(OCR_CONFUSIONS))
    if p1 and 4 <= len(d1) <= 7:
        out.add(f"{p1}{d1}")
    # Si la zone chiffres contient encore des lettres, tenter substitutions partielles
    if re.search(r"[A-Z]", digits):
        d2 = digits.translate(OCR_CONFUSIONS)
        d2 = re.sub(r"[^0-9]", "", d2)
        if p1 and 4 <= len(d2) <= 7:
            out.add(f"{p1}{d2}")
    return [x for x in out if x]


def score_cin_candidate(token: str) -> float:
    """
    Score 0–1 : CIN marocaine = 1–2 lettres + 4–7 chiffres (idéal 6).
    Ex. BK354428 → élevé ; BK35442B → récupéré via variante.
    """
    variants = cin_variants(token)
    best = 0.0
    for v in variants:
        m = re.match(r"^([A-Z]{1,2})(\d{4,7})$", v)
        if not m:
            best = max(best, 0.12)
            continue
        letters, digits = m.group(1), m.group(2)
        score = 0.5
        if len(letters) in (1, 2):
            score += 0.15
        if len(digits) == 6:
            score += 0.3
        elif len(digits) in (5, 7):
            score += 0.18
        elif len(digits) == 4:
            score += 0.08
        raw = re.sub(r"[^A-Za-z0-9]", "", token or "").upper()
        if raw != v:
            score -= 0.04 * edit_distance(raw, v)
        else:
            score += 0.05
        best = max(best, min(1.0, score))
    return best


def pick_best_cin(candidates: Iterable[str]) -> tuple[str, float, list[str]]:
    """
    Parmi BK354428 / BK35442B / BK354A28 → choisit le plus plausible.
    """
    scored = []
    seen = set()
    for raw in candidates:
        for v in cin_variants(raw) or []:
            m = re.match(r"^([A-Z]{1,2})(\d{4,7})$", v)
            canon = f"{m.group(1)}{m.group(2)}" if m else v
            if not canon or canon in seen:
                continue
            # ne garder que forme canonique lettres+chiffres
            if not m:
                continue
            seen.add(canon)
            scored.append((canon, score_cin_candidate(raw if raw else canon), len(canon)))
    # score desc, puis longueur desc (préférer 6 chiffres)
    scored.sort(key=lambda x: (x[1], x[2]), reverse=True)
    if not scored:
        return "", 0.0, []
    best_val, best_score, _ = scored[0]
    ranked = [v for v, s, _ in scored[:5]]
    return best_val, best_score, ranked


def score_date_iso(iso: str, role: str) -> float:
    """role: naissance | expiration"""
    if not iso or not re.match(r"^\d{4}-\d{2}-\d{2}$", iso):
        return 0.0
    try:
        y, m, d = map(int, iso.split("-"))
        dt = date(y, m, d)
    except Exception:
        return 0.0
    today = date.today()
    if role == "naissance":
        if dt >= today:
            return 0.05
        age = (today - dt).days / 365.25
        if 16 <= age <= 75:
            return 0.95
        if 14 <= age <= 90:
            return 0.7
        return 0.35
    # expiration
    if dt < today:
        # carte expirée — plausible mais confiance moyenne
        return 0.55
    years = (dt - today).days / 365.25
    if 0 <= years <= 15:
        return 0.92
    return 0.5


def pick_best_date(candidates: Iterable[str], role: str) -> tuple[str, float, list[str]]:
    scored = []
    for c in candidates:
        iso = c if re.match(r"^\d{4}-\d{2}-\d{2}$", c or "") else ""
        if not iso:
            continue
        scored.append((iso, score_date_iso(iso, role)))
    scored.sort(key=lambda x: x[1], reverse=True)
    if not scored:
        return "", 0.0, []
    return scored[0][0], scored[0][1], [v for v, _ in scored[:4]]


def score_person_name(value: str, learning_prior: float = 0.0) -> float:
    v = normalize_person_token(value)
    if len(v) < 2:
        return 0.0
    # Rejet fort : chiffres, MRZ, codes OCR type ROPI9VXW7 / 5BE884115
    if re.search(r"\d", value or "") or re.search(r"\d", v):
        return 0.0
    compact = re.sub(r"[^A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]", "", v)
    if "<" in (value or "") or re.search(r"(?:[A-Z0-9]<){2,}", (value or "").upper()):
        return 0.0
    if len(compact) >= 8:
        vowels = len(re.findall(r"[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]", compact))
        if vowels / max(1, len(compact)) < 0.18:
            return 0.0
    # Faux positifs CIN : seulement si forme lettres+chiffres déjà présente
    compact_alnum = re.sub(r"[^A-Z0-9]", "", v)
    if re.match(r"^[A-Z]{1,2}\d{4,7}$", compact_alnum):
        return 0.0
    banned = {
        "NOM", "PRENOM", "NAME", "GIVEN", "SURNAMES", "ROYAUME", "MAROC",
        "CARTE", "NATIONALE", "IDENTITE", "IDENTITÉ", "SEXE", "NATIONALITE",
    }
    if v in banned:
        return 0.0
    score = 0.45
    if 2 <= len(v) <= 40:
        score += 0.2
    if " " in v or "-" in v:
        score += 0.05  # composé OK
    score += 0.3 * learning_prior
    return min(1.0, score)


def pick_best_name(
    candidates: Iterable[str],
    learning_prior_fn,
    kind: str,
) -> tuple[str, float, list[str]]:
    scored = []
    for raw in candidates:
        base = normalize_person_token(raw)
        if not base:
            continue
        prior = float(learning_prior_fn(kind, base) or 0.0)
        # match appris
        matched, match_score = learning_prior_fn.__self__.best_match(kind, base) if hasattr(learning_prior_fn, "__self__") else ("", 0.0)
        # learning_prior_fn is unbound-style — caller passes lambdas
        val = base
        sc = score_person_name(base, prior)
        scored.append((val, sc, matched, match_score))
    # Prefer learned correction if strong
    final = []
    for val, sc, matched, match_score in scored:
        if matched and match_score >= 0.72 and match_score > sc:
            final.append((matched, match_score))
        else:
            final.append((val, sc))
    # dedupe keep max
    best_map = {}
    for v, s in final:
        best_map[v] = max(s, best_map.get(v, 0.0))
    ordered = sorted(best_map.items(), key=lambda x: x[1], reverse=True)
    if not ordered:
        return "", 0.0, []
    return ordered[0][0], ordered[0][1], [v for v, _ in ordered[:5]]


def pick_best_city(candidates: Iterable[str], learning) -> tuple[str, float, list[str]]:
    scored = []
    for raw in candidates:
        v = (raw or "").strip().upper()
        v = re.sub(r"\s+", " ", v)
        if len(v) < 3:
            continue
        prior = learning.prior("ville", v)
        matched, ms = learning.best_match("ville", v, max_dist=3)
        if matched and ms >= 0.65:
            scored.append((matched, ms))
        else:
            scored.append((v, 0.4 + 0.5 * prior))
    best_map = {}
    for v, s in scored:
        best_map[v] = max(s, best_map.get(v, 0.0))
    ordered = sorted(best_map.items(), key=lambda x: x[1], reverse=True)
    if not ordered:
        return "", 0.0, []
    return ordered[0][0], ordered[0][1], [v for v, _ in ordered[:5]]


def conf_label(score: float, has_value: bool) -> str:
    if not has_value:
        return "non_detecte"
    if score >= 0.82:
        return "elevee"
    if score >= 0.55:
        return "moyenne"
    return "faible"


def confidence_percent(score: float) -> int:
    return int(round(max(0.0, min(1.0, score)) * 100))
