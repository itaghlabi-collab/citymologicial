"""Parser CITYMO — cerveau : ranking intelligent (CIN, dates, noms, villes)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

from .learning import get_learning_base
from .smart import (
    conf_label,
    confidence_percent,
    normalize_person_token,
    pick_best_cin,
    pick_best_city,
    pick_best_date,
    score_person_name,
)

CIN_RE = re.compile(r"\b([A-Z]{1,2}\s?\d{4,7})\b", re.I)
# Variantes OCR (chiffres lus comme lettres en fin de numéro)
CIN_OCR_RE = re.compile(r"\b([A-Z]{1,2}\s?[0-9]{3,6}[0-9A-Z]{1,2})\b", re.I)
DATE_RE = re.compile(r"\b(\d{1,2})[\s./\-](\d{1,2})[\s./\-](\d{2,4})\b")
MRZ_LINE_RE = re.compile(r"[A-Z0-9<]{20,}")
ARABIC_RE = re.compile(r"[\u0600-\u06FF]+")

CONF_HIGH = "elevee"
CONF_MED = "moyenne"
CONF_LOW = "faible"
CONF_NONE = "non_detecte"


@dataclass
class FieldValue:
    value: str = ""
    confidence: str = CONF_NONE
    confidence_pct: int = 0
    raw: str = ""
    candidates: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def empty_fields() -> dict[str, FieldValue]:
    keys = [
        "numero_cin", "nom", "prenom", "nom_arabe", "prenom_arabe",
        "date_naissance", "lieu_naissance", "nationalite", "sexe",
        "date_expiration", "autorite",
    ]
    return {k: FieldValue() for k in keys}


def normalize_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def to_iso_date(d: int, m: int, y: int) -> Optional[str]:
    if y < 100:
        y = 2000 + y if y < 40 else 1900 + y
    if not (1 <= m <= 12 and 1 <= d <= 31 and 1920 <= y <= 2100):
        return None
    return f"{y:04d}-{m:02d}-{d:02d}"


def parse_date_token(raw: str) -> str:
    m = DATE_RE.search(raw or "")
    if not m:
        return ""
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return to_iso_date(d, mo, y) or to_iso_date(mo, d, y) or ""


def fv(value: str, score: float, raw: str = "", candidates: Optional[list] = None) -> FieldValue:
    has = bool(value)
    return FieldValue(
        value=value if has else "",
        confidence=conf_label(score, has),
        confidence_pct=confidence_percent(score) if has else 0,
        raw=raw or value,
        candidates=candidates or [],
    )


def extract_arabic_names(text: str) -> tuple[str, str]:
    lines = [normalize_spaces(l) for l in (text or "").splitlines() if ARABIC_RE.search(l)]
    if not lines:
        return "", ""
    parts = ARABIC_RE.findall(lines[0])
    if len(parts) >= 2:
        return parts[0], " ".join(parts[1:])
    if len(lines) >= 2:
        return " ".join(ARABIC_RE.findall(lines[0])), " ".join(ARABIC_RE.findall(lines[1]))
    return " ".join(ARABIC_RE.findall(lines[0])), ""


def parse_mrz_collect(text: str) -> dict[str, list[str]]:
    bag = {"nom": [], "prenom": [], "cin": [], "naissance": [], "expiration": [], "sexe": []}
    lines = [l for l in (text or "").upper().replace(" ", "").splitlines() if "<" in l or MRZ_LINE_RE.search(l)]
    mrz = []
    for l in lines:
        cleaned = re.sub(r"[^A-Z0-9<]", "", l)
        if len(cleaned) >= 20:
            mrz.append(cleaned)
    if len(mrz) < 1:
        return bag
    name_line = mrz[0]
    if "<<" in name_line:
        body = re.sub(r"^I<?[A-Z]{0,3}", "", name_line)
        parts = body.split("<<")
        if parts:
            bag["nom"].append(parts[0].replace("<", " ").strip())
            if len(parts) > 1:
                bag["prenom"].append(parts[1].replace("<", " ").strip())
    if len(mrz) > 1:
        data_line = mrz[1]
        doc = re.match(r"^([A-Z]{1,2}\d{4,7})", data_line.replace("<", ""))
        if doc:
            bag["cin"].append(doc.group(1))
        dates = re.findall(r"(\d{6})", data_line)
        if dates:
            yy, mm, dd = int(dates[0][:2]), int(dates[0][2:4]), int(dates[0][4:6])
            iso = to_iso_date(dd, mm, 2000 + yy if yy < 40 else 1900 + yy)
            if iso:
                bag["naissance"].append(iso)
        if len(dates) >= 2:
            yy, mm, dd = int(dates[1][:2]), int(dates[1][2:4]), int(dates[1][4:6])
            iso = to_iso_date(dd, mm, 2000 + yy if yy < 40 else 1900 + yy)
            if iso:
                bag["expiration"].append(iso)
        sex_m = re.search(r"[0-9]([MF])[0-9]", data_line)
        if sex_m:
            bag["sexe"].append(sex_m.group(1))
    return bag


LABEL_NOM = re.compile(r"^(?:NOM|SURNAM?E|LAST\s*NAME|الاسم\s*العائلي)\s*[:.]?\s*(.*)$", re.I)
LABEL_PRENOM = re.compile(r"^(?:PR[EÉ]NOM|GIVEN\s*NAMES?|FIRST\s*NAME|الاسم\s*الشخصي)\s*[:.]?\s*(.*)$", re.I)
LABEL_NE = re.compile(r"^(?:N[EÉ][EÉ]?\s*(?:LE|A|À)?|DATE\s*(?:DE\s*)?NAISSANCE|BORN)\s*[:.]?\s*(.*)$", re.I)
LABEL_LIEU = re.compile(r"^(?:A\s+|À\s+|LIEU\s*(?:DE\s*)?NAISSANCE|PLACE\s*OF\s*BIRTH)\s*[:.]?\s*(.*)$", re.I)
LABEL_SEXE = re.compile(r"^(?:SEXE|SEX)\s*[:.]?\s*([MF]|MASCULIN|FEMININ|FEMALE|MALE)\b", re.I)
LABEL_VAL = re.compile(r"^(?:VALABLE|EXPIR|VALID)\s*.*?(\d{1,2}[\s./\-]\d{1,2}[\s./\-]\d{2,4})", re.I)
LABEL_NAT = re.compile(r"^(?:NATIONALIT[EÉ]|NATIONALITY)\s*[:.]?\s*(.*)$", re.I)


def collect_from_labels(text: str) -> dict[str, list[str]]:
    bag = {
        "nom": [], "prenom": [], "naissance": [], "expiration": [],
        "lieu": [], "sexe": [], "nationalite": [], "cin": [],
    }
    lines = [normalize_spaces(l) for l in (text or "").splitlines() if normalize_spaces(l)]
    for i, line in enumerate(lines):
        m = LABEL_NOM.match(line)
        if m:
            val = m.group(1) or (lines[i + 1] if i + 1 < len(lines) else "")
            if val:
                bag["nom"].append(val.upper())
            continue
        m = LABEL_PRENOM.match(line)
        if m:
            val = m.group(1) or (lines[i + 1] if i + 1 < len(lines) else "")
            if val:
                bag["prenom"].append(val.upper())
            continue
        m = LABEL_NE.match(line)
        if m:
            d = parse_date_token(m.group(1) or line)
            if d:
                bag["naissance"].append(d)
            continue
        m = LABEL_LIEU.match(line)
        if m:
            val = m.group(1) or (lines[i + 1] if i + 1 < len(lines) else "")
            if val and len(val) > 2:
                bag["lieu"].append(val.upper())
            continue
        m = LABEL_SEXE.match(line)
        if m:
            s = m.group(1).upper()
            bag["sexe"].append("F" if s.startswith("F") else "M")
            continue
        m = LABEL_VAL.search(line)
        if m:
            d = parse_date_token(m.group(1))
            if d:
                bag["expiration"].append(d)
            continue
        m = LABEL_NAT.match(line)
        if m:
            val = m.group(1) or ""
            bag["nationalite"].append("Marocaine" if re.search(r"MAROC|MAR", val, re.I) or not val else val)
    for m in CIN_RE.finditer(text or ""):
        bag["cin"].append(m.group(1))
    for m in CIN_OCR_RE.finditer(text or ""):
        tok = m.group(1)
        # garder seulement si contient au moins un chiffre et ressemble à une CIN
        if re.search(r"\d", tok) and re.search(r"[A-Za-z]", tok):
            bag["cin"].append(tok)
    for m in DATE_RE.finditer(text or ""):
        iso = parse_date_token(m.group(0))
        if iso and iso < "2010-01-01":
            bag["naissance"].append(iso)
        elif iso and iso >= "2015-01-01":
            bag["expiration"].append(iso)
    return bag


def parse_ocr_text(text: str, side: str = "recto", avg_confidence: float = 0.7) -> dict[str, FieldValue]:
    learning = get_learning_base()
    fields = empty_fields()
    raw = text or ""

    mrz = parse_mrz_collect(raw)
    lab = collect_from_labels(raw)

    # CIN — cerveau
    cin_cands = lab["cin"] + mrz["cin"]
    best_cin, cin_score, cin_ranked = pick_best_cin(cin_cands)
    # Ambigu seulement si plusieurs lectures OCR distinctes (pas des variantes du même token)
    raw_norms = []
    for c in cin_cands:
        b, s, _ = pick_best_cin([c])
        if b and s >= 0.5 and b not in raw_norms:
            raw_norms.append(b)
    if len(raw_norms) >= 2:
        from .smart import score_cin_candidate
        scores = [(v, score_cin_candidate(v)) for v in raw_norms]
        scores.sort(key=lambda x: x[1], reverse=True)
        if abs(scores[0][1] - scores[1][1]) < 0.08:
            fields["numero_cin"] = fv("", 0.4, ",".join(raw_norms[:3]), raw_norms[:3])
        else:
            fields["numero_cin"] = fv(scores[0][0], scores[0][1], scores[0][0], [v for v, _ in scores[1:]])
    else:
        fields["numero_cin"] = fv(best_cin, cin_score, best_cin, [])

    # Noms
    def prior_nom(kind, val):
        return learning.prior(kind, val)

    nom_cands = [normalize_person_token(x) for x in (lab["nom"] + mrz["nom"]) if x]
    prenom_cands = [normalize_person_token(x) for x in (lab["prenom"] + mrz["prenom"]) if x]

    # scoring noms avec learning
    def pick_name(cands, kind):
        scored = {}
        for c in cands:
            if not c:
                continue
            prior = learning.prior(kind, c)
            matched, ms = learning.best_match(kind, c)
            base = score_person_name(c, prior)
            if matched and ms >= 0.72:
                scored[matched] = max(scored.get(matched, 0), ms)
            scored[c] = max(scored.get(c, 0), base)
        ordered = sorted(scored.items(), key=lambda x: x[1], reverse=True)
        if not ordered:
            return "", 0.0, []
        return ordered[0][0], ordered[0][1], [v for v, _ in ordered[:5]]

    bn, ns, nr = pick_name(nom_cands, "nom")
    bp, ps, pr = pick_name(prenom_cands, "prenom")
    fields["nom"] = fv(bn, ns, bn, nr[1:] if len(nr) > 1 else [])
    fields["prenom"] = fv(bp, ps, bp, pr[1:] if len(pr) > 1 else [])

    # Dates
    bd, ds, dr = pick_best_date(lab["naissance"] + mrz["naissance"], "naissance")
    be, es, er = pick_best_date(lab["expiration"] + mrz["expiration"], "expiration")
    fields["date_naissance"] = fv(bd, ds, bd, dr[1:] if len(dr) > 1 else [])
    fields["date_expiration"] = fv(be, es, be, er[1:] if len(er) > 1 else [])

    # Ville
    bv, vs, vr = pick_best_city(lab["lieu"], learning)
    fields["lieu_naissance"] = fv(bv, vs, bv, vr[1:] if len(vr) > 1 else [])

    # Sexe / nationalité
    sexe = (lab["sexe"] + mrz["sexe"] + [None])[0]
    if sexe:
        fields["sexe"] = fv(sexe, 0.85 * avg_confidence + 0.1, sexe)
    nat = (lab["nationalite"] + ["Marocaine"])[0]
    fields["nationalite"] = fv(nat or "Marocaine", 0.7, nat or "Marocaine")

    ar_nom, ar_prenom = extract_arabic_names(raw)
    if ar_nom:
        fields["nom_arabe"] = fv(ar_nom, 0.7 * avg_confidence, ar_nom)
    if ar_prenom:
        fields["prenom_arabe"] = fv(ar_prenom, 0.7 * avg_confidence, ar_prenom)

    return fields


def merge_side_fields(recto: dict[str, FieldValue], verso: dict[str, FieldValue]) -> dict[str, FieldValue]:
    out = empty_fields()
    order = {CONF_NONE: 0, CONF_LOW: 1, CONF_MED: 2, CONF_HIGH: 3}
    for key in out:
        a, b = recto.get(key, FieldValue()), verso.get(key, FieldValue())
        # CIN : re-rank combined
        if key == "numero_cin":
            cands = []
            for f in (a, b):
                if f.value:
                    cands.append(f.value)
                cands.extend(f.candidates or [])
            best, score, ranked = pick_best_cin(cands)
            if len(ranked) >= 2:
                from .smart import score_cin_candidate
                if abs(score_cin_candidate(ranked[0]) - score_cin_candidate(ranked[1])) < 0.08:
                    out[key] = fv("", 0.4, ",".join(ranked[:3]), ranked[:3])
                else:
                    out[key] = fv(best, score, best, ranked[1:])
            else:
                out[key] = fv(best, score, best, [])
            continue
        if key in ("date_naissance", "date_expiration"):
            role = "naissance" if key == "date_naissance" else "expiration"
            cands = []
            for f in (a, b):
                if f.value:
                    cands.append(f.value)
                cands.extend(f.candidates or [])
            best, score, ranked = pick_best_date(cands, role)
            out[key] = fv(best, score, best, ranked[1:] if len(ranked) > 1 else [])
            continue
        best = a if order[a.confidence] >= order[b.confidence] else b
        if a.value and b.value and a.value != b.value and a.confidence_pct and b.confidence_pct:
            if abs(a.confidence_pct - b.confidence_pct) < 8:
                out[key] = fv("", 0.4, "", [a.value, b.value])
                continue
        out[key] = FieldValue(
            best.value,
            best.confidence if best.value else CONF_NONE,
            best.confidence_pct if best.value else 0,
            best.raw,
            best.candidates if len(best.candidates or []) > 0 else [],
        )
    if not out["nationalite"].value:
        out["nationalite"] = fv("Marocaine", 0.5, "default")
    return out


def fields_to_api(fields: dict[str, FieldValue]) -> dict[str, Any]:
    return {k: v.to_dict() for k, v in fields.items()}


def global_confidence(fields: dict[str, FieldValue]) -> str:
    order = {CONF_NONE: 0, CONF_LOW: 1, CONF_MED: 2, CONF_HIGH: 3}
    scores = [order[f.confidence] for f in fields.values() if f.value]
    if not scores:
        return CONF_NONE
    avg = sum(scores) / len(scores)
    if avg >= 2.5:
        return CONF_HIGH
    if avg >= 1.5:
        return CONF_MED
    return CONF_LOW


# Compat exports used elsewhere
def normalize_cin(raw: str) -> str:
    best, _, _ = pick_best_cin([raw])
    return best or re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()


def plausible_cin(s: str) -> bool:
    from .smart import score_cin_candidate
    return score_cin_candidate(s) >= 0.55
