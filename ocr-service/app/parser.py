"""Parser CITYMO — texte OCR → champs CIN marocaine (indépendant du moteur)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any, Optional


CIN_RE = re.compile(r"\b([A-Z]{1,2}\s?\d{4,7})\b", re.I)
DATE_RE = re.compile(
    r"\b(\d{1,2})[\s./\-](\d{1,2})[\s./\-](\d{2,4})\b"
)
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
    raw: str = ""
    candidates: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def empty_fields() -> dict[str, FieldValue]:
    keys = [
        "numero_cin",
        "nom",
        "prenom",
        "nom_arabe",
        "prenom_arabe",
        "date_naissance",
        "lieu_naissance",
        "nationalite",
        "sexe",
        "date_expiration",
        "autorite",
    ]
    return {k: FieldValue() for k in keys}


def normalize_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def normalize_cin(raw: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    m = re.match(r"^([A-Z]{1,2})(\d{4,7})$", s)
    if not m:
        return s
    return f"{m.group(1)}{m.group(2)}"


def plausible_cin(s: str) -> bool:
    s = normalize_cin(s)
    return bool(re.match(r"^[A-Z]{1,2}\d{4,7}$", s))


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
    # Prefer DD/MM/YYYY (Maroc)
    iso = to_iso_date(d, mo, y)
    if iso:
        return iso
    return to_iso_date(mo, d, y) or ""


def conf_from_score(score: float, has_value: bool) -> str:
    if not has_value:
        return CONF_NONE
    if score >= 0.82:
        return CONF_HIGH
    if score >= 0.55:
        return CONF_MED
    return CONF_LOW


def extract_arabic_names(text: str) -> tuple[str, str]:
    lines = [normalize_spaces(l) for l in (text or "").splitlines() if ARABIC_RE.search(l)]
    if not lines:
        return "", ""
    # Heuristique : premières lignes arabes = nom / prénom
    parts = ARABIC_RE.findall(lines[0])
    if len(parts) >= 2:
        return parts[0], " ".join(parts[1:])
    if len(lines) >= 2:
        a = " ".join(ARABIC_RE.findall(lines[0]))
        b = " ".join(ARABIC_RE.findall(lines[1]))
        return a, b
    return " ".join(ARABIC_RE.findall(lines[0])), ""


def parse_mrz(text: str, fields: dict[str, FieldValue]) -> None:
    lines = [l for l in (text or "").upper().replace(" ", "").splitlines() if "<" in l or MRZ_LINE_RE.search(l)]
    mrz = []
    for l in lines:
        cleaned = re.sub(r"[^A-Z0-9<]", "", l)
        if len(cleaned) >= 20:
            mrz.append(cleaned)
    if len(mrz) < 2:
        return
    # Format ID-1 approx : line0 names, line1 dates
    name_line = mrz[0]
    if "<<" in name_line:
        # I<MARLAST<<FIRST
        body = re.sub(r"^I<?[A-Z]{0,3}", "", name_line)
        parts = body.split("<<")
        if parts:
            nom = parts[0].replace("<", " ").strip()
            prenom = parts[1].replace("<", " ").strip() if len(parts) > 1 else ""
            if nom and not fields["nom"].value:
                fields["nom"] = FieldValue(nom, CONF_MED, name_line)
            if prenom and not fields["prenom"].value:
                fields["prenom"] = FieldValue(prenom, CONF_MED, name_line)
    data_line = mrz[1] if len(mrz) > 1 else ""
    # Optional: document number at start
    doc = re.match(r"^([A-Z]{1,2}\d{4,7})", data_line.replace("<", ""))
    if doc and plausible_cin(doc.group(1)) and not fields["numero_cin"].value:
        fields["numero_cin"] = FieldValue(normalize_cin(doc.group(1)), CONF_MED, data_line)
    # Dates YYMMDD
    dates = re.findall(r"(\d{6})", data_line)
    if len(dates) >= 1 and not fields["date_naissance"].value:
        yy, mm, dd = int(dates[0][:2]), int(dates[0][2:4]), int(dates[0][4:6])
        iso = to_iso_date(dd, mm, 2000 + yy if yy < 40 else 1900 + yy)
        if iso:
            fields["date_naissance"] = FieldValue(iso, CONF_MED, dates[0])
    if len(dates) >= 2 and not fields["date_expiration"].value:
        yy, mm, dd = int(dates[1][:2]), int(dates[1][2:4]), int(dates[1][4:6])
        iso = to_iso_date(dd, mm, 2000 + yy if yy < 40 else 1900 + yy)
        if iso:
            fields["date_expiration"] = FieldValue(iso, CONF_MED, dates[1])
    sex_m = re.search(r"[0-9]([MF])[0-9]", data_line)
    if sex_m and not fields["sexe"].value:
        fields["sexe"] = FieldValue(sex_m.group(1), CONF_MED, sex_m.group(0))


def set_field(fields: dict[str, FieldValue], key: str, value: str, score: float, raw: str = "") -> None:
    value = normalize_spaces(value)
    if not value:
        return
    conf = conf_from_score(score, True)
    cur = fields[key]
    order = {CONF_NONE: 0, CONF_LOW: 1, CONF_MED: 2, CONF_HIGH: 3}
    if not cur.value or order[conf] > order[cur.confidence]:
        cands = list(dict.fromkeys((cur.candidates or []) + ([cur.value] if cur.value and cur.value != value else []) + [value]))
        fields[key] = FieldValue(value, conf, raw or value, cands if len(cands) > 1 else [])
    elif cur.value and cur.value != value:
        cands = list(dict.fromkeys((cur.candidates or [cur.value]) + [value]))
        if len(cands) > 1:
            fields[key].candidates = cands
            if fields[key].confidence == CONF_HIGH:
                fields[key].confidence = CONF_MED


LABEL_NOM = re.compile(r"^(?:NOM|SURNAM?E|LAST\s*NAME|الاسم\s*العائلي)\s*[:.]?\s*(.*)$", re.I)
LABEL_PRENOM = re.compile(r"^(?:PR[EÉ]NOM|GIVEN\s*NAMES?|FIRST\s*NAME|الاسم\s*الشخصي)\s*[:.]?\s*(.*)$", re.I)
LABEL_NE = re.compile(r"^(?:N[EÉ][EÉ]?\s*(?:LE|A|À)?|DATE\s*(?:DE\s*)?NAISSANCE|BORN)\s*[:.]?\s*(.*)$", re.I)
LABEL_LIEU = re.compile(r"^(?:A\s+|À\s+|LIEU\s*(?:DE\s*)?NAISSANCE|PLACE\s*OF\s*BIRTH)\s*[:.]?\s*(.*)$", re.I)
LABEL_SEXE = re.compile(r"^(?:SEXE|SEX)\s*[:.]?\s*([MF]|MASCULIN|FEMININ|FEMALE|MALE)\b", re.I)
LABEL_VAL = re.compile(r"^(?:VALABLE|EXPIR|VALID)\s*.*?(\d{1,2}[\s./\-]\d{1,2}[\s./\-]\d{2,4})", re.I)
LABEL_NAT = re.compile(r"^(?:NATIONALIT[EÉ]|NATIONALITY)\s*[:.]?\s*(.*)$", re.I)


def parse_labeled_lines(text: str, fields: dict[str, FieldValue], base_score: float) -> None:
    lines = [normalize_spaces(l) for l in (text or "").splitlines() if normalize_spaces(l)]
    for i, line in enumerate(lines):
        m = LABEL_NOM.match(line)
        if m:
            val = m.group(1) or (lines[i + 1] if i + 1 < len(lines) else "")
            if val and not re.match(r"^(NOM|PRENOM|NAME)", val, re.I):
                set_field(fields, "nom", val.upper(), base_score, line)
            continue
        m = LABEL_PRENOM.match(line)
        if m:
            val = m.group(1) or (lines[i + 1] if i + 1 < len(lines) else "")
            if val and not re.match(r"^(NOM|PRENOM|NAME)", val, re.I):
                set_field(fields, "prenom", val.upper(), base_score, line)
            continue
        m = LABEL_NE.match(line)
        if m:
            d = parse_date_token(m.group(1) or line)
            if d:
                set_field(fields, "date_naissance", d, base_score, line)
            continue
        m = LABEL_LIEU.match(line)
        if m:
            val = m.group(1) or (lines[i + 1] if i + 1 < len(lines) else "")
            if val and len(val) > 2:
                set_field(fields, "lieu_naissance", val.upper(), base_score * 0.9, line)
            continue
        m = LABEL_SEXE.match(line)
        if m:
            s = m.group(1).upper()
            s = "F" if s.startswith("F") else "M"
            set_field(fields, "sexe", s, base_score, line)
            continue
        m = LABEL_VAL.search(line)
        if m:
            d = parse_date_token(m.group(1))
            if d:
                set_field(fields, "date_expiration", d, base_score, line)
            continue
        m = LABEL_NAT.match(line)
        if m:
            val = m.group(1) or ""
            if re.search(r"MAROC|MAR", val, re.I) or not val:
                set_field(fields, "nationalite", "Marocaine", base_score, line)
            else:
                set_field(fields, "nationalite", val, base_score * 0.8, line)


def extract_cin_numbers(text: str, fields: dict[str, FieldValue], base_score: float) -> None:
    found = []
    for m in CIN_RE.finditer(text or ""):
        cand = normalize_cin(m.group(1))
        if plausible_cin(cand):
            found.append(cand)
    found = list(dict.fromkeys(found))
    if not found:
        return
    if len(found) == 1:
        set_field(fields, "numero_cin", found[0], base_score, found[0])
    else:
        # Ambigu — proposer sans auto-choisir risqué
        fields["numero_cin"] = FieldValue(
            value="",
            confidence=CONF_LOW,
            raw=",".join(found),
            candidates=found,
        )


def merge_side_fields(recto: dict[str, FieldValue], verso: dict[str, FieldValue]) -> dict[str, FieldValue]:
    out = empty_fields()
    order = {CONF_NONE: 0, CONF_LOW: 1, CONF_MED: 2, CONF_HIGH: 3}
    for key in out:
        a, b = recto.get(key, FieldValue()), verso.get(key, FieldValue())
        cands = []
        for f in (a, b):
            if f.value:
                cands.append(f.value)
            cands.extend(f.candidates or [])
        cands = list(dict.fromkeys(cands))
        best = a if order[a.confidence] >= order[b.confidence] else b
        if not best.value and cands:
            # ambigu
            out[key] = FieldValue("", CONF_LOW, "", cands)
        elif a.value and b.value and a.value != b.value and key == "numero_cin":
            out[key] = FieldValue("", CONF_LOW, "", list(dict.fromkeys([a.value, b.value])))
        else:
            out[key] = FieldValue(
                best.value,
                best.confidence if best.value else CONF_NONE,
                best.raw,
                cands if len(cands) > 1 else [],
            )
    if not out["nationalite"].value:
        out["nationalite"] = FieldValue("Marocaine", CONF_LOW, "default")
    return out


def parse_ocr_text(text: str, side: str = "recto", avg_confidence: float = 0.7) -> dict[str, FieldValue]:
    fields = empty_fields()
    raw = text or ""
    parse_mrz(raw, fields)
    parse_labeled_lines(raw, fields, avg_confidence)
    extract_cin_numbers(raw, fields, avg_confidence)
    ar_nom, ar_prenom = extract_arabic_names(raw)
    if ar_nom:
        set_field(fields, "nom_arabe", ar_nom, avg_confidence * 0.85, ar_nom)
    if ar_prenom:
        set_field(fields, "prenom_arabe", ar_prenom, avg_confidence * 0.85, ar_prenom)
    # Dates génériques restantes
    if not fields["date_naissance"].value:
        for m in DATE_RE.finditer(raw):
            iso = parse_date_token(m.group(0))
            if iso and iso < "2010-01-01":
                set_field(fields, "date_naissance", iso, avg_confidence * 0.6, m.group(0))
                break
    return fields


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
