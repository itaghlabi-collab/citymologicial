/**
 * attendanceExcelImport.js — Étape 3 : création présences + HS via services RH existants.
 * Aucun calcul de salaire ici.
 */
import { getSupabase } from '../../lib/supabase';
import {
  createAttendance,
  STANDARD_SHIFT_START,
  STANDARD_SHIFT_END,
  listAttendance,
} from './attendance';
import { createOvertime } from './overtime';
import { createWorker, workerTarifHoraire } from './workers';
import { ensureWorkerAssignedToProject } from './workerProjectAssignments';
import {
  buildPlannedImportLines,
  formatImportBatchRef,
} from './attendanceExcelMatch';
import { normalizeSiteKey } from './attendanceExcelParse';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function addHoursToTime(startHHMM, hours) {
  const [h, m] = String(startHHMM || '09:00').split(':').map(Number);
  const total = (h * 60 + (m || 0)) + Math.round(Number(hours) * 60);
  const hh = Math.floor(((total % (24 * 60)) + (24 * 60)) % (24 * 60) / 60);
  const mm = ((total % (24 * 60)) + (24 * 60)) % (24 * 60) % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function splitPersonName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { prenom: 'Ouvrier', nom: 'Import' };
  if (parts.length === 1) return { prenom: parts[0], nom: '—' };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

async function getAuthUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user;
}

async function nextImportBatchRef(year) {
  const y = Number(year) || new Date().getFullYear();
  const prefix = `IMP-${y}-`;
  try {
    const { data, error } = await getSupabase()
      .from('attendance_excel_imports')
      .select('ref')
      .like('ref', `${prefix}%`)
      .order('ref', { ascending: false })
      .limit(1);
    if (error) throw error;
    const last = data?.[0]?.ref || '';
    const seq = last.startsWith(prefix) ? (Number(last.slice(prefix.length)) || 0) + 1 : 1;
    return formatImportBatchRef(y, seq);
  } catch {
    return formatImportBatchRef(y, 1);
  }
}

async function createImportBatchRow(payload) {
  const { data, error } = await getSupabase()
    .from('attendance_excel_imports')
    .insert([payload])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function updateImportBatchRow(id, patch) {
  const { data, error } = await getSupabase()
    .from('attendance_excel_imports')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function resolveChefForLine(line, projects, chefsChantier) {
  const project = (projects || []).find((p) => String(p.id) === String(line.projectId));
  const candidates = [
    line.blockResponsable,
    project?.chef_chantier,
    project?.chef_projet,
    project?.responsable,
  ].filter(Boolean);

  for (const name of candidates) {
    const match = (chefsChantier || []).find((c) => {
      const label = (c.label || c.name || '').toLowerCase();
      const n = String(name).toLowerCase();
      return label && n && (label.includes(n) || n.includes(label.split('—')[0].trim()));
    });
    if (match) {
      return {
        chefChantierId: match.id,
        chefChantierNom: match.label || name,
      };
    }
  }

  const fallback = (chefsChantier || [])[0];
  if (fallback) {
    return {
      chefChantierId: fallback.id,
      chefChantierNom: fallback.label || '',
    };
  }
  return { chefChantierId: '', chefChantierNom: line.blockResponsable || '' };
}

/**
 * Import validé : ouvriers (optionnel) + affectations + présences + HS.
 * Pas de sync paie ici (étape 4).
 */
export async function executeAttendanceExcelImport({
  preview,
  siteMappings,
  workerMappings,
  workers,
  projects,
  chefsChantier = [],
  onProgress,
} = {}) {
  const user = await getAuthUser();
  const planned = buildPlannedImportLines({
    preview,
    siteMappings,
    workerMappings,
    workers,
    projects,
  });

  const unresolved = planned.filter((p) => !p.siteResolved || !p.workerResolved);
  if (unresolved.length) {
    const err = new Error(`${unresolved.length} ligne(s) non résolues — corrigez avant import.`);
    err.code = 'VALIDATION';
    throw err;
  }

  const year = preview?.week?.debut
    ? Number(String(preview.week.debut).slice(0, 4))
    : new Date().getFullYear();
  const ref = await nextImportBatchRef(year);

  let batch = null;
  try {
    batch = await createImportBatchRow({
      ref,
      file_name: preview?.fileName || '',
      week_debut: preview?.week?.debut || null,
      week_fin: preview?.week?.fin || null,
      imported_by: user.id,
      imported_by_label: user.email || user.id,
      statut: 'Analyse',
      worker_count: 0,
      presence_count: 0,
      overtime_count: 0,
      ignored_count: 0,
      anomalies: preview?.anomalies || [],
      sites: (siteMappings || []).map((s) => ({
        key: s.key,
        title: s.title,
        kind: s.kind,
        projectId: s.projectId,
      })),
    });
  } catch (e) {
    console.warn('[CITYMO] attendance_excel_imports table missing — import continues without history row', e);
  }

  const report = {
    ref,
    batchId: batch?.id || null,
    createdWorkers: 0,
    assignments: 0,
    attendances: 0,
    overtimes: 0,
    skipped: 0,
    errors: [],
  };

  const workerIdByKey = new Map(
    (workerMappings || [])
      .filter((w) => w.action === 'link' && w.workerId)
      .map((w) => [w.key, String(w.workerId)]),
  );

  /** 1) Créer ouvriers explicitement demandés */
  for (const wMap of workerMappings || []) {
    if (wMap.action !== 'create') continue;
    const { prenom, nom } = splitPersonName(wMap.excelName);
    const sample = (preview?.presenceLines || []).find(
      (l) => normalizeSiteKey(l.workerFullName) === wMap.key,
    );
    try {
      onProgress?.({ phase: 'workers', message: `Création ouvrier ${wMap.excelName}` });
      const created = await createWorker({
        prenom,
        nom,
        fonction: sample?.fonction || '',
        tarif: 150,
        tarif_unite: 'jour',
        statut: 'actif',
        disponibilite: 'oui',
      });
      workerIdByKey.set(wMap.key, String(created.id));
      report.createdWorkers += 1;
    } catch (e) {
      report.errors.push({ type: 'worker', name: wMap.excelName, message: e.message || String(e) });
    }
  }

  /** Rafraîchir planned worker ids after creates */
  const plannedReady = planned.map((p) => ({
    ...p,
    workerId: workerIdByKey.get(p.workerKey) || p.workerId,
  })).filter((p) => p.siteResolved && p.workerId);

  /** 2) Affectations manquantes */
  const assignKeys = new Set();
  for (const line of plannedReady) {
    const key = `${line.workerId}|${line.projectId}`;
    if (assignKeys.has(key)) continue;
    assignKeys.add(key);
    if (line.assigned) continue;
    try {
      onProgress?.({ phase: 'assign', message: `Affectation ${line.workerLabel} → ${line.projectLabel}` });
      await ensureWorkerAssignedToProject(line.projectId, line.workerId);
      report.assignments += 1;
    } catch (e) {
      report.errors.push({
        type: 'assignment',
        worker: line.workerLabel,
        project: line.projectLabel,
        message: e.message || String(e),
      });
    }
  }

  /** 3) Présences via createAttendance uniquement */
  let existing = [];
  try {
    existing = await listAttendance({ activeOnly: false });
  } catch {
    existing = [];
  }

  for (const line of plannedReady) {
    try {
      const dup = (existing || []).find((r) => (
        String(r.workerId) === String(line.workerId)
        && String(r.projectId) === String(line.projectId)
        && String(r.date) === String(line.date)
        && !r.isLegacy
      ));
      if (dup) {
        report.skipped += 1;
        continue;
      }

      const chef = resolveChefForLine(line, projects, chefsChantier);
      if (!chef.chefChantierId) {
        report.errors.push({
          type: 'attendance',
          worker: line.workerLabel,
          date: line.date,
          message: 'Chef de chantier introuvable — présence non créée.',
        });
        continue;
      }

      const isAbsent = line.statut === 'absent';
      const normalHours = isAbsent ? 0 : (Number(line.normalHours) || 8);
      const heureEntree = isAbsent ? '' : STANDARD_SHIFT_START;
      const heureSortie = isAbsent
        ? ''
        : (normalHours >= 8 ? STANDARD_SHIFT_END : addHoursToTime(STANDARD_SHIFT_START, normalHours));

      onProgress?.({
        phase: 'attendance',
        message: `${line.workerLabel} · ${line.date} · ${line.projectLabel}`,
      });

      await createAttendance({
        workerId: line.workerId,
        projectId: line.projectId,
        projetNom: line.projectLabel,
        projet: line.projectLabel,
        date: line.date,
        statut: isAbsent ? 'Absent' : (normalHours > 0 && normalHours < 8 ? 'Demi-journee' : 'Present'),
        heureEntree,
        heureSortie,
        chefChantierId: chef.chefChantierId,
        chefChantierNom: chef.chefChantierNom,
        notes: [
          `Import Excel ${ref}`,
          line.redirectedFromBlock ? `redirigé depuis ${line.blockTitle}` : '',
          line.motif ? `motif: ${line.motif}` : '',
        ].filter(Boolean).join(' · '),
        importBatchId: batch?.id || null,
        importSource: 'excel',
      });
      report.attendances += 1;
    } catch (e) {
      report.errors.push({
        type: 'attendance',
        worker: line.workerLabel,
        date: line.date,
        project: line.projectLabel,
        message: e.message || String(e),
      });
    }
  }

  /** 4) HS via createOvertime (module existant) */
  const workersById = new Map((workers || []).map((w) => [String(w.id), w]));
  for (const line of plannedReady) {
    if (!(Number(line.overtimeHours) > 0) || line.statut === 'absent') continue;
    try {
      const w = workersById.get(String(line.workerId));
      const tarif = workerTarifHoraire(w) || Number(w?.tarif) || 0;
      if (!tarif) {
        report.errors.push({
          type: 'overtime',
          worker: line.workerLabel,
          date: line.date,
          message: 'Tarif horaire manquant — HS non créée.',
        });
        continue;
      }
      onProgress?.({
        phase: 'overtime',
        message: `HS ${line.overtimeHours}h · ${line.workerLabel} · ${line.date}`,
      });
      await createOvertime({
        workerId: line.workerId,
        date: line.date,
        projet: line.projectLabel,
        heureDebut: STANDARD_SHIFT_END,
        heureFin: addHoursToTime(STANDARD_SHIFT_END, line.overtimeHours),
        heures: Number(line.overtimeHours),
        tarif,
        motif: `Import Excel ${ref} — surplus au-delà de 8h`,
        statut: 'Valide',
      });
      report.overtimes += 1;
    } catch (e) {
      report.errors.push({
        type: 'overtime',
        worker: line.workerLabel,
        date: line.date,
        message: e.message || String(e),
      });
    }
  }

  if (batch?.id) {
    try {
      await updateImportBatchRow(batch.id, {
        statut: report.errors.length ? 'À corriger' : 'Importé',
        worker_count: new Set(plannedReady.map((p) => p.workerId)).size,
        presence_count: report.attendances,
        overtime_count: report.overtimes,
        ignored_count: report.skipped,
        anomalies: report.errors,
      });
    } catch (e) {
      console.warn('[CITYMO] update import batch', e);
    }
  }

  return report;
}

export { ensureWorkerAssignedToProject };
