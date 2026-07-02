/**
 * projectExpenseImport.js — Import initial Excel DEPENSE CHANTIER
 */
import * as XLSX from 'xlsx';
import {
  bulkInsertProjectExpenses,
  findImportDuplicate,
} from './projectExpenses';

const EXCLUDED_SHEETS = new Set([
  'GENERAL',
  'DIVERS',
  'DEPOT BUREAU',
  'DEPOT - BUREAU',
  'DÉPÔT - BUREAU',
  'DÉPÔT BUREAU',
]);

const HEADER_ALIASES = {
  date: ['date', 'jour', 'date depense', 'date dépense'],
  element: ['element', 'élément', 'element depense', 'élément dépense', 'element de depense', 'poste', 'rubrique'],
  description: ['description', 'detail', 'détail', 'libelle', 'libellé'],
  fournisseur: ['fournisseur', 'supplier', 'prestataire'],
  montant: ['montant', 'amount', 'total', 'prix', 'valeur'],
  observation: ['observation', 'observations', 'notes', 'note', 'remarque', 'commentaire'],
};

export function normalizeSheetName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isExcludedSheet(name) {
  const n = normalizeSheetName(name);
  if (EXCLUDED_SHEETS.has(n)) return true;
  if (n === 'GENERAL' || n === 'DIVERS') return true;
  return n.startsWith('DEPOT');
}

export function matchProjectBySheetName(sheetName, projects) {
  const sheetNorm = normalizeSheetName(sheetName);
  let best = null;
  for (const p of projects) {
    const pNorm = normalizeSheetName(p.nom);
    if (pNorm === sheetNorm) return p;
    if (pNorm.includes(sheetNorm) || sheetNorm.includes(pNorm)) best = p;
  }
  return best;
}

function normalizeHeader(cell) {
  return String(cell || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    const cells = row.map(normalizeHeader);
    const hasDate = cells.some((c) => HEADER_ALIASES.date.some((a) => c.includes(a)));
    const hasMontant = cells.some((c) => HEADER_ALIASES.montant.some((a) => c.includes(a)));
    if (hasDate && hasMontant) return { index: i, cells };
  }
  return null;
}

function colIndex(cells, aliases) {
  return cells.findIndex((c) => aliases.some((a) => c.includes(a)));
}

function parseExcelDate(val) {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const fr = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (fr) {
    const y = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
    return `${y}-${String(fr[2]).padStart(2, '0')}-${String(fr[1]).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

function parseMontant(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return Math.round(val * 100) / 100;
  const s = String(val).replace(/\s/g, '').replace(/MAD/gi, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function rowIsEmpty(vals) {
  return !vals.some((v) => v != null && String(v).trim() !== '');
}

export async function parseDepenseChantierWorkbook(arrayBuffer, projects) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const report = {
    projectsImported: new Set(),
    expensesImported: 0,
    totalMontant: 0,
    duplicates: 0,
    errors: [],
    rowsToInsert: [],
  };

  for (const sheetName of wb.SheetNames) {
    if (isExcludedSheet(sheetName)) continue;

    const project = matchProjectBySheetName(sheetName, projects);
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const header = detectHeaderRow(rows);
    if (!header) {
      report.errors.push({ sheet: sheetName, message: 'En-têtes non détectés' });
      continue;
    }

    const { index: hi, cells } = header;
    const iDate = colIndex(cells, HEADER_ALIASES.date);
    const iElement = colIndex(cells, HEADER_ALIASES.element);
    const iDesc = colIndex(cells, HEADER_ALIASES.description);
    const iFour = colIndex(cells, HEADER_ALIASES.fournisseur);
    const iMontant = colIndex(cells, HEADER_ALIASES.montant);
    const iObs = colIndex(cells, HEADER_ALIASES.observation);

    if (iMontant < 0) {
      report.errors.push({ sheet: sheetName, message: 'Colonne Montant introuvable' });
      continue;
    }

    let lastDate = null;
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (rowIsEmpty(row)) continue;

      let date = parseExcelDate(row[iDate]);
      const montant = parseMontant(row[iMontant]);
      const element = String(row[iElement >= 0 ? iElement : iDesc] || '').trim() || 'Dépense';

      if (date) lastDate = date;
      else if (montant > 0 && element && lastDate) date = lastDate;

      if (!date || montant <= 0) {
        if (montant > 0 || (row[iDate] && String(row[iDate]).trim())) {
          report.errors.push({ sheet: sheetName, row: r + 1, message: 'Date ou montant invalide' });
        }
        continue;
      }

      const payload = {
        project_id: project?.id || null,
        project_name_raw: sheetName,
        project_match_status: project?.id ? 'matched' : 'needs_manual',
        date_depense: date,
        categorie: element,
        element_depense: element,
        description: iDesc >= 0 ? String(row[iDesc] || '').trim() || null : null,
        fournisseur: iFour >= 0 ? String(row[iFour] || '').trim() || null : null,
        montant,
        observation: iObs >= 0 ? String(row[iObs] || '').trim() || null : null,
        origine: 'import_excel',
        statut: 'valide',
      };

      if (project?.id) {
        const dupId = await findImportDuplicate({
          project_id: project.id,
          date_depense: date,
          element_depense: element,
          montant,
        });
        if (dupId) {
          report.duplicates++;
          continue;
        }
      }

      report.rowsToInsert.push(payload);
      report.expensesImported++;
      report.totalMontant += montant;
      if (project?.id) report.projectsImported.add(project.id);
      else report.projectsImported.add(`unmatched:${sheetName}`);
    }
  }

  return report;
}

export async function importDepenseChantierFile(file, projects) {
  const buffer = await file.arrayBuffer();
  const report = await parseDepenseChantierWorkbook(buffer, projects);

  if (report.rowsToInsert.length) {
    await bulkInsertProjectExpenses(report.rowsToInsert);
  }

  return {
    projectsCount: report.projectsImported.size,
    expensesCount: report.expensesImported,
    totalMontant: report.totalMontant,
    duplicates: report.duplicates,
    errorsCount: report.errors.length,
    errors: report.errors,
    unmatchedProjects: [...report.projectsImported].filter((k) => String(k).startsWith('unmatched:')),
  };
}
