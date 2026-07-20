/**
 * attendanceExcelParse.js — Lecture / aperçu pointage hebdomadaire Excel.
 * Étape 1 : aucune écriture BDD. Les dates viennent uniquement du contenu fichier.
 */
import * as XLSX from 'xlsx';

const DAY_NAME_RE = /^(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)$/i;
const WEEK_RE = /semaine\s+du\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*au\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
const ABSENT_TOKENS = new Set(['ABSENT', 'ABSENCE', 'A', 'MALADIE', 'CONGE', 'CONGÉ', 'OFF']);
const SKIP_TITLES = new Set(['NOM', 'FONCTION', 'REMUNERATION', 'RÉMUNÉRATION']);

export function normalizeSiteKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Centres de coûts internes CITYMO (hors KPI projets clients). */
export function classifySiteKind(siteTitle) {
  const key = normalizeSiteKey(siteTitle);
  if (!key) return { kind: 'unknown', affectationLabel: 'Non classé' };
  if (key === 'ATELIER' || key.startsWith('ATELIER ')) {
    return { kind: 'internal_atelier', affectationLabel: 'Hors projet — Atelier' };
  }
  if (key === 'DEPOT' || key.startsWith('DEPOT ')) {
    return { kind: 'internal_depot', affectationLabel: 'Hors projet — Dépôt' };
  }
  return { kind: 'project', affectationLabel: 'Projet' };
}

export function parseBlockTitle(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { title: '', responsable: '', raw: '' };
  const m = text.match(/^(.+?)\s*\(\s*([^)]+?)\s*\)\s*$/);
  if (m) {
    return {
      title: m[1].replace(/\s+/g, ' ').trim(),
      responsable: m[2].replace(/\s+/g, ' ').trim(),
      raw: text,
    };
  }
  return { title: text, responsable: '', raw: text };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    /** Excel date cells often shift ±1h around UTC midnight — ancrage midi UTC. */
    const shifted = new Date(val.getTime() + 12 * 60 * 60 * 1000);
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${pad2(m[2])}-${pad2(m[1])}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function cellStr(val) {
  if (val == null) return '';
  if (val instanceof Date) return toIsoDate(val) || '';
  return String(val).replace(/\s+/g, ' ').trim();
}

function isNomHeaderRow(row) {
  return (row || []).some((cell) => cellStr(cell).toUpperCase() === 'NOM');
}

function findNomCol(row) {
  const idx = (row || []).findIndex((cell) => cellStr(cell).toUpperCase() === 'NOM');
  return idx >= 0 ? idx : -1;
}

function looksLikeBlockTitle(val) {
  if (val instanceof Date) return false;
  if (typeof val === 'number') return false;
  const s = cellStr(val);
  if (!s || s.length < 2) return false;
  const up = normalizeSiteKey(s);
  if (!up) return false;
  if (SKIP_TITLES.has(up) || SKIP_TITLES.has(s.toUpperCase())) return false;
  if (WEEK_RE.test(s)) return false;
  if (DAY_NAME_RE.test(s)) return false;
  if (/^\d+(\.\d+)?$/.test(s)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  if (/^(total|rem\/h|heurs|heures)/i.test(s)) return false;
  return true;
}

function findWeekFromRows(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    for (let c = 0; c < Math.min((rows[r] || []).length, 20); c++) {
      const raw = cellStr(rows[r][c]);
      if (!raw) continue;
      const m = raw.match(WEEK_RE);
      if (!m) continue;
      const debut = toIsoDate(m[1]);
      const fin = toIsoDate(m[2]);
      return {
        label: raw.replace(/\.$/, '').trim(),
        debut,
        fin,
        sourceRow: r + 1,
      };
    }
  }
  return null;
}

function findDayColumns(rows, headerRowIndex) {
  /** Dates souvent 1–2 lignes au-dessus de NOM */
  const candidates = [headerRowIndex - 1, headerRowIndex - 2, headerRowIndex - 3].filter((i) => i >= 0);
  for (const ri of candidates) {
    const row = rows[ri] || [];
    const days = [];
    for (let c = 0; c < row.length; c++) {
      const iso = toIsoDate(row[c]);
      if (!iso) continue;
      const nameAbove = cellStr(rows[ri - 1]?.[c]);
      days.push({
        col: c,
        date: iso,
        dayLabel: DAY_NAME_RE.test(nameAbove) ? nameAbove : nameAbove || iso,
      });
    }
    if (days.length >= 4) return days;
  }
  return [];
}

function parseDayCell(raw) {
  if (raw == null || raw === '') return { kind: 'empty' };
  if (raw instanceof Date) return { kind: 'ignored', raw };
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 0 && raw <= 24) {
      return {
        kind: 'hours',
        hours: raw,
        isOvertimeHint: raw > 8,
      };
    }
    return { kind: 'ignored', raw };
  }
  const s = cellStr(raw);
  if (!s) return { kind: 'empty' };
  const up = normalizeSiteKey(s);
  if (ABSENT_TOKENS.has(up) || ABSENT_TOKENS.has(s.toUpperCase())) {
    return { kind: 'absent', motif: s };
  }
  const asNum = Number(String(s).replace(',', '.'));
  if (Number.isFinite(asNum) && asNum > 0 && asNum <= 24) {
    return { kind: 'hours', hours: asNum, isOvertimeHint: asNum > 8 };
  }
  /** Autre chantier indiqué dans la cellule — prioritaire sur le bloc parent */
  if (s.length >= 2 && /[A-Za-zÀ-ÿ]/.test(s) && !/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return { kind: 'redirect_site', siteLabel: s };
  }
  return { kind: 'unknown', raw: s };
}

function readDayValue(row, dayCol) {
  const primary = row?.[dayCol];
  const secondary = row?.[dayCol + 1];
  const a = parseDayCell(primary);
  const b = parseDayCell(secondary);
  if (a.kind === 'hours' || a.kind === 'absent' || a.kind === 'redirect_site') return a;
  if (b.kind === 'hours' || b.kind === 'absent' || b.kind === 'redirect_site') return b;
  if (a.kind !== 'empty') return a;
  return b;
}

function isWorkerRow(row, nomCol, fonctionCol) {
  const nom = cellStr(row?.[nomCol]);
  const fonction = cellStr(row?.[fonctionCol]);
  if (!nom || !fonction) return false;
  if (nom.toUpperCase() === 'NOM') return false;
  /** Une ligne titre de bloc n'a en général pas de vraie fonction métier à côté */
  if (looksLikeBlockTitle(row?.[nomCol]) && /\(/.test(cellStr(row?.[nomCol]))) return false;
  return true;
}

function splitPersonName(fullName) {
  const parts = cellStr(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: '', nom: '', fullName: '' };
  if (parts.length === 1) return { prenom: parts[0], nom: '', fullName: parts[0] };
  return {
    prenom: parts[0],
    nom: parts.slice(1).join(' '),
    fullName: parts.join(' '),
  };
}

/**
 * Stratégie robuste : partir des en-têtes NOM, remonter au titre de bloc.
 * Évite de prendre des dates / noms d'ouvriers pour des chantiers.
 */
function collectBlockRows(rows) {
  const blocks = [];
  const seenHeaders = new Set();

  for (let r = 0; r < rows.length; r++) {
    if (!isNomHeaderRow(rows[r])) continue;
    const nomCol = findNomCol(rows[r]);
    if (nomCol < 0 || seenHeaders.has(r)) continue;
    seenHeaders.add(r);

    let titleCell = null;
    let startRow = r;
    for (let up = 1; up <= 5; up++) {
      const ri = r - up;
      if (ri < 0) break;
      const row = rows[ri] || [];
      /** Priorité à la colonne NOM (souvent le titre du chantier). */
      const candidates = [row[nomCol], row[nomCol - 1], row[0], row[1], row[2]].filter((v) => v != null);
      let found = null;
      for (const cell of candidates) {
        if (looksLikeBlockTitle(cell)) {
          found = cell;
          break;
        }
      }
      if (!found) continue;
      /** Ignorer les lignes qui sont clairement des jours / dates */
      const hasManyDates = (row || []).filter((c) => toIsoDate(c)).length >= 3;
      if (hasManyDates) continue;
      titleCell = found;
      startRow = ri;
      break;
    }

    if (!titleCell) continue;
    const parsed = parseBlockTitle(titleCell);
    if (!parsed.title || normalizeSiteKey(parsed.title) === 'NOM') continue;

    blocks.push({
      startRow,
      headerRow: r,
      nomCol,
      fonctionCol: nomCol + 1,
      remCol: nomCol + 2,
      ...parsed,
    });
  }

  return blocks;
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ fileName?: string }} [meta]
 */
export function parseAttendanceExcel(arrayBuffer, meta = {}) {
  const anomalies = [];
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  if (!wb.SheetNames?.length) {
    return {
      ok: false,
      error: 'Fichier Excel vide ou illisible.',
      fileName: meta.fileName || '',
    };
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  /** Forcer une plage depuis A1 pour des index de colonnes stables (A=0). */
  const ref = sheet['!ref'];
  if (ref) {
    const decoded = XLSX.utils.decode_range(ref);
    decoded.s.c = 0;
    decoded.s.r = 0;
    sheet['!ref'] = XLSX.utils.encode_range(decoded);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

  const week = findWeekFromRows(rows);
  if (!week?.debut || !week?.fin) {
    anomalies.push({
      level: 'error',
      code: 'WEEK_NOT_FOUND',
      message: 'Période de semaine introuvable dans le contenu du fichier.',
    });
  }

  const blockMetas = collectBlockRows(rows);
  if (!blockMetas.length) {
    anomalies.push({
      level: 'error',
      code: 'NO_BLOCKS',
      message: 'Aucun bloc chantier / atelier / dépôt détecté.',
    });
  }

  const sites = [];
  const presenceLines = [];
  const workerKeys = new Map();

  for (let bi = 0; bi < blockMetas.length; bi++) {
    const metaBlock = blockMetas[bi];
    const nextStart = bi + 1 < blockMetas.length ? blockMetas[bi + 1].startRow : rows.length;
    const days = findDayColumns(rows, metaBlock.headerRow);
    if (!days.length) {
      anomalies.push({
        level: 'warning',
        code: 'NO_DAYS',
        message: `Colonnes de jours introuvables pour « ${metaBlock.raw} ».`,
        site: metaBlock.raw,
      });
    }

    const classif = classifySiteKind(metaBlock.title);
    const site = {
      key: normalizeSiteKey(metaBlock.title) || `SITE_${bi}`,
      title: metaBlock.title,
      rawTitle: metaBlock.raw,
      responsable: metaBlock.responsable,
      kind: classif.kind,
      affectationLabel: classif.affectationLabel,
      startRow: metaBlock.startRow + 1,
      dayCount: days.length,
      workerCount: 0,
      presenceCount: 0,
      absenceCount: 0,
      overtimeHintCount: 0,
      redirectCount: 0,
    };

    const { nomCol, fonctionCol, remCol } = metaBlock;

    for (let r = metaBlock.headerRow + 1; r < nextStart; r++) {
      const row = rows[r] || [];
      if (!isWorkerRow(row, nomCol, fonctionCol)) continue;

      const person = splitPersonName(row[nomCol]);
      const fonction = cellStr(row[fonctionCol]);
      const remuneration = cellStr(row[remCol]);
      site.workerCount += 1;

      const wk = normalizeSiteKey(person.fullName);
      if (wk) {
        const prev = workerKeys.get(wk) || { name: person.fullName, sites: new Set() };
        prev.sites.add(site.key);
        workerKeys.set(wk, prev);
      }

      for (const day of days) {
        const parsed = readDayValue(row, day.col);
        if (parsed.kind === 'empty' || parsed.kind === 'ignored') continue;

        let targetSiteTitle = site.title;
        let targetSiteKey = site.key;
        let targetKind = site.kind;
        let targetAffectation = site.affectationLabel;
        let redirected = false;

        if (parsed.kind === 'redirect_site') {
          redirected = true;
          targetSiteTitle = parseBlockTitle(parsed.siteLabel).title || parsed.siteLabel;
          targetSiteKey = normalizeSiteKey(targetSiteTitle);
          const c2 = classifySiteKind(targetSiteTitle);
          targetKind = c2.kind;
          targetAffectation = c2.affectationLabel;
          site.redirectCount += 1;
        }

        const isAbsent = parsed.kind === 'absent';
        const hours = isAbsent ? 0 : Number(parsed.hours) || 0;
        const normalHours = isAbsent ? 0 : Math.min(hours, 8);
        const overtimeHours = isAbsent ? 0 : Math.max(0, hours - 8);
        if (isAbsent) site.absenceCount += 1;
        else site.presenceCount += 1;
        if (overtimeHours > 0) site.overtimeHintCount += 1;

        presenceLines.push({
          workerFullName: person.fullName,
          prenom: person.prenom,
          nom: person.nom,
          fonction,
          remunerationExcel: remuneration,
          date: day.date,
          dayLabel: day.dayLabel,
          statut: isAbsent ? 'absent' : 'present',
          hours,
          /** Présence normale plafonnée à 8h — le surplus ira au module HS (jamais en paie directe). */
          normalHours,
          overtimeHours,
          overtimeHint: overtimeHours > 0,
          motif: isAbsent ? (parsed.motif || '') : '',
          blockTitle: site.title,
          blockRaw: site.rawTitle,
          blockResponsable: site.responsable,
          targetSiteTitle,
          targetSiteKey,
          targetKind,
          affectationLabel: targetAffectation,
          redirectedFromBlock: redirected,
          excelRow: r + 1,
        });
      }
    }

    sites.push(site);
  }

  const uniqueWorkers = [...workerKeys.values()].map((w) => ({
    name: w.name,
    siteCount: w.sites.size,
    sites: [...w.sites],
  }));

  const presentCount = presenceLines.filter((l) => l.statut === 'present').length;
  const absentCount = presenceLines.filter((l) => l.statut === 'absent').length;
  const overtimeHints = presenceLines.filter((l) => l.overtimeHint).length;
  const redirects = presenceLines.filter((l) => l.redirectedFromBlock).length;

  if (week?.debut && week?.fin && presenceLines.length) {
    const allDates = presenceLines.map((l) => l.date).filter(Boolean).sort();
    if (allDates.length) {
      if (allDates[0] < week.debut || allDates[allDates.length - 1] > week.fin) {
        anomalies.push({
          level: 'warning',
          code: 'DATE_OUT_OF_WEEK',
          message: 'Certaines dates de colonnes sortent de la période annoncée dans le fichier.',
        });
      }
    }
  }

  const ok = Boolean(week?.debut && week?.fin && sites.length && !anomalies.some((a) => a.level === 'error'));

  return {
    ok,
    error: ok ? null : (anomalies.find((a) => a.level === 'error')?.message || 'Analyse incomplète'),
    fileName: meta.fileName || '',
    sheetName,
    week,
    sites,
    presenceLines,
    uniqueWorkers,
    stats: {
      siteCount: sites.length,
      projectSiteCount: sites.filter((s) => s.kind === 'project').length,
      atelierCount: sites.filter((s) => s.kind === 'internal_atelier').length,
      depotCount: sites.filter((s) => s.kind === 'internal_depot').length,
      workerCount: uniqueWorkers.length,
      presenceCount: presentCount,
      absenceCount: absentCount,
      overtimeHintCount: overtimeHints,
      redirectCount: redirects,
      lineCount: presenceLines.length,
    },
    anomalies,
  };
}

export async function parseAttendanceExcelFile(file) {
  const buffer = await file.arrayBuffer();
  return parseAttendanceExcel(buffer, { fileName: file.name || '' });
}
