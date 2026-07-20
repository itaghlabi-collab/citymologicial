/**
 * attendanceExcelMatch.js — Correspondance chantiers / ouvriers (étape 2).
 * Aucune écriture BDD.
 */
import { classifySiteKind, normalizeSiteKey, parseBlockTitle } from './attendanceExcelParse.js';

/** Alias fréquents Excel → libellés ERP / blocs. */
const SITE_ALIASES = [
  ['BENSOUDA', 'VILLA BEN SOUDA'],
  ['VILLA BEN SOUDA', 'BENSOUDA'],
  ['AERONAUTICA', 'AERAUNOTICA'],
  ['AERAUNOTICA', 'AERONAUTICA'],
  ['AERONOTICA', 'AERONAUTICA'],
];

function expandSiteKeys(key) {
  const keys = new Set([key].filter(Boolean));
  for (const [a, b] of SITE_ALIASES) {
    if (keys.has(a)) keys.add(b);
    if (keys.has(b)) keys.add(a);
  }
  return [...keys];
}

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

function normalizeCin(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizePersonName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function personTokenKey(s) {
  return normalizePersonName(s).split(' ').filter(Boolean).sort().join(' ');
}

function personNamesMatch(a, b) {
  if (!a || !b) return false;
  const ka = personTokenKey(a);
  const kb = personTokenKey(b);
  if (ka && kb && ka === kb) return true;
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  return Boolean(na && nb && (na === nb || na.includes(nb) || nb.includes(na)));
}

function workerFullName(w) {
  return `${w?.prenom || ''} ${w?.nom || ''}`.replace(/\s+/g, ' ').trim();
}

function scoreSiteAgainstProject(siteKey, siteTitle, project) {
  const pKey = normalizeSiteKey(project?.nom);
  const pRef = normalizeSiteKey(project?.ref);
  const candidates = expandSiteKeys(siteKey);
  if (!pKey && !pRef) return { score: 0, reason: '' };

  for (const k of candidates) {
    if (k && pKey && k === pKey) return { score: 100, reason: 'nom exact' };
    if (k && pRef && k === pRef) return { score: 95, reason: 'référence exacte' };
  }

  /** Suggestions partielles — jamais pré-sélectionnées (évite BENSOUDA2 → BENSOUDA). */
  for (const k of candidates) {
    if (k && pKey && k.length >= 5 && pKey.length >= 5 && (pKey.includes(k) || k.includes(pKey)) && k !== pKey) {
      return { score: 50, reason: 'suggestion partielle (à valider)' };
    }
  }
  const titleKey = normalizeSiteKey(siteTitle);
  if (titleKey && pKey && titleKey !== pKey && titleKey.length >= 5 && (pKey.includes(titleKey) || titleKey.includes(pKey))) {
    return { score: 45, reason: 'suggestion partielle (à valider)' };
  }
  return { score: 0, reason: '' };
}

/**
 * Sites à mapper = blocs Excel + cibles de redirection (cellule jour).
 */
export function collectMatchSites(preview) {
  const map = new Map();

  for (const s of preview?.sites || []) {
    const key = s.key || normalizeSiteKey(s.title);
    if (!key) continue;
    map.set(key, {
      key,
      title: s.title,
      rawTitle: s.rawTitle || s.title,
      responsable: s.responsable || '',
      kind: s.kind,
      affectationLabel: s.affectationLabel,
      fromBlock: true,
      redirectOnly: false,
      workerCount: s.workerCount || 0,
      presenceCount: s.presenceCount || 0,
      absenceCount: s.absenceCount || 0,
      redirectCount: s.redirectCount || 0,
    });
  }

  for (const line of preview?.presenceLines || []) {
    const key = line.targetSiteKey || normalizeSiteKey(line.targetSiteTitle);
    if (!key) continue;
    if (!map.has(key)) {
      const classif = classifySiteKind(line.targetSiteTitle);
      map.set(key, {
        key,
        title: parseBlockTitle(line.targetSiteTitle).title || line.targetSiteTitle,
        rawTitle: line.targetSiteTitle,
        responsable: '',
        kind: line.targetKind || classif.kind,
        affectationLabel: line.affectationLabel || classif.affectationLabel,
        fromBlock: false,
        redirectOnly: true,
        workerCount: 0,
        presenceCount: 0,
        absenceCount: 0,
        redirectCount: 0,
      });
    }
    const row = map.get(key);
    if (line.statut === 'present') row.presenceCount += 1;
    if (line.statut === 'absent') row.absenceCount += 1;
    if (line.redirectedFromBlock) row.redirectCount += 1;
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

export function suggestProjectForSite(site, projects) {
  let best = null;
  for (const p of projects || []) {
    const scored = scoreSiteAgainstProject(site.key, site.title, p);
    if (scored.score <= 0) continue;
    if (!best || scored.score > best.score) {
      best = {
        projectId: String(p.id),
        projectLabel: p.nom || p.ref || String(p.id),
        score: scored.score,
        reason: scored.reason,
      };
    }
  }
  return best;
}

export function buildInitialSiteMappings(preview, projects) {
  return collectMatchSites(preview).map((site) => {
    const suggestion = suggestProjectForSite(site, projects);
    const suggestions = (projects || [])
      .map((p) => {
        const scored = scoreSiteAgainstProject(site.key, site.title, p);
        if (scored.score <= 0) return null;
        return {
          projectId: String(p.id),
          projectLabel: p.nom || p.ref || String(p.id),
          score: scored.score,
          reason: scored.reason,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    /** Auto uniquement si correspondance exacte (ou alias exact). Jamais de création projet. */
    const autoOk = suggestion && suggestion.score >= 95;

    return {
      ...site,
      /** Tous les sites doivent être liés à un projet ERP existant (y compris Atelier/Dépôt). */
      needsProject: true,
      status: autoOk ? 'auto' : (suggestion ? 'a_resoudre' : 'a_resoudre'),
      projectId: autoOk ? suggestion.projectId : '',
      projectLabel: autoOk ? suggestion.projectLabel : '',
      matchScore: suggestion?.score || 0,
      matchReason: suggestion?.reason || '',
      suggestions,
    };
  });
}

export function suggestWorkerMatches(excelName, workers, { cin = '', telephone = '' } = {}) {
  const cinN = normalizeCin(cin);
  const telN = normalizePhone(telephone);
  const results = [];

  for (const w of workers || []) {
    let score = 0;
    let reason = '';
    const wCin = normalizeCin(w.cin || w.numero_cin);
    const wTel = normalizePhone(w.telephone);
    const full = workerFullName(w);

    if (cinN && wCin && cinN === wCin) {
      score = 100;
      reason = 'CIN';
    } else if (telN && wTel && telN.length >= 8 && wTel.endsWith(telN.slice(-9))) {
      score = 92;
      reason = 'téléphone';
    } else if (excelName && full && personNamesMatch(excelName, full)) {
      const a = normalizeSiteKey(excelName);
      const b = normalizeSiteKey(full);
      score = a === b ? 88 : 72;
      reason = score >= 88 ? 'nom exact' : 'nom approximatif';
    }

    if (score > 0) {
      results.push({
        workerId: String(w.id),
        label: full,
        fonction: w.fonction || '',
        cin: w.cin || '',
        telephone: w.telephone || '',
        score,
        reason,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function buildInitialWorkerMappings(preview, workers) {
  const unique = preview?.uniqueWorkers || [];
  return unique.map((uw) => {
    const suggestions = suggestWorkerMatches(uw.name, workers);
    const best = suggestions[0] || null;
    const second = suggestions[1] || null;
    const uncertain = Boolean(
      best
      && (
        best.score < 88
        || (second && second.score >= best.score - 8)
      ),
    );

    let status = 'unmatched';
    if (best && best.score >= 88 && !uncertain) status = 'auto';
    else if (best && best.score >= 70) status = uncertain ? 'uncertain' : 'suggested';

    return {
      key: normalizeSiteKey(uw.name) || uw.name,
      excelName: uw.name,
      siteCount: uw.siteCount || 0,
      sites: uw.sites || [],
      status,
      action: best ? 'link' : 'unset', // link | create | unset
      workerId: best && !uncertain && best.score >= 88 ? best.workerId : (best?.workerId || ''),
      workerLabel: best && !uncertain && best.score >= 88 ? best.label : (best?.label || ''),
      matchScore: best?.score || 0,
      matchReason: best?.reason || '',
      suggestions: suggestions.slice(0, 6),
    };
  });
}

export function buildPlannedImportLines({
  preview,
  siteMappings,
  workerMappings,
  workers = [],
  projects = [],
}) {
  const siteByKey = new Map((siteMappings || []).map((s) => [s.key, s]));
  const workerByKey = new Map((workerMappings || []).map((w) => [w.key, w]));
  const workerById = new Map((workers || []).map((w) => [String(w.id), w]));
  const projectById = new Map((projects || []).map((p) => [String(p.id), p]));

  const planned = [];
  for (const line of preview?.presenceLines || []) {
    const siteKey = line.targetSiteKey || normalizeSiteKey(line.targetSiteTitle);
    const site = siteByKey.get(siteKey);
    const wKey = normalizeSiteKey(line.workerFullName);
    const wMap = workerByKey.get(wKey);
    const workerId = wMap?.action === 'link' ? wMap.workerId : '';
    const worker = workerId ? workerById.get(String(workerId)) : null;
    const projectId = site?.projectId || '';
    const project = projectId ? projectById.get(String(projectId)) : null;

    const assigned = Boolean(
      worker
      && projectId
      && (
        (Array.isArray(worker.assigned_project_ids) && worker.assigned_project_ids.map(String).includes(String(projectId)))
        || String(worker.project_id || '') === String(projectId)
      ),
    );

    const siteResolved = Boolean(projectId);
    const workerResolved = Boolean(
      (wMap?.action === 'link' && workerId) || wMap?.action === 'create',
    );

    let blockingReason = '';
    if (!siteResolved) blockingReason = 'Chantier à résoudre';
    else if (!workerResolved) blockingReason = 'Ouvrier à résoudre';
    else if (wMap?.action === 'link' && workerId && !assigned) blockingReason = 'Ouvrier non affecté au projet';

    planned.push({
      key: `${wKey}|${line.date}|${siteKey}`,
      excelRow: line.excelRow,
      date: line.date,
      dayLabel: line.dayLabel,
      workerKey: wKey,
      workerExcelName: line.workerFullName,
      workerId: workerId || '',
      workerLabel: wMap?.action === 'create'
        ? `${line.workerFullName} (création)`
        : (wMap?.workerLabel || line.workerFullName),
      workerAction: wMap?.action || 'unset',
      fonction: line.fonction,
      siteKey,
      siteTitle: line.targetSiteTitle,
      siteKind: line.targetKind || site?.kind || 'project',
      affectationLabel: line.affectationLabel || site?.affectationLabel || '',
      projectId,
      projectLabel: site?.projectLabel || project?.nom || '',
      blockTitle: line.blockTitle,
      blockResponsable: line.blockResponsable || '',
      redirectedFromBlock: Boolean(line.redirectedFromBlock),
      statut: line.statut,
      motif: line.motif || '',
      hoursExcel: line.hours,
      normalHours: Number(line.normalHours) || 0,
      overtimeHours: Number(line.overtimeHours) || 0,
      assigned,
      siteResolved,
      workerResolved,
      ready: siteResolved && workerResolved && (wMap?.action === 'create' || assigned),
      blockingReason,
      willCreateAttendance: siteResolved && workerResolved,
      willCreateOvertime: siteResolved && workerResolved && Number(line.overtimeHours) > 0 && line.statut === 'present',
    });
  }

  /** Dédupe ouvrier × date × chantier (plusieurs blocs Excel peuvent répéter la même journée). */
  const deduped = new Map();
  for (const row of planned) {
    const prev = deduped.get(row.key);
    if (!prev) {
      deduped.set(row.key, row);
      continue;
    }
    const score = (r) => (
      (r.statut === 'present' ? 10 : 0)
      + Number(r.normalHours || 0)
      + Number(r.overtimeHours || 0)
      + (r.redirectedFromBlock ? 1 : 0)
    );
    if (score(row) >= score(prev)) deduped.set(row.key, row);
  }

  return [...deduped.values()].sort((a, b) => {
    const n = String(a.workerExcelName).localeCompare(String(b.workerExcelName), 'fr');
    if (n !== 0) return n;
    return String(a.date).localeCompare(String(b.date));
  });
}

export function summarizeImportValidation({
  preview,
  siteMappings,
  workerMappings,
  plannedLines = [],
}) {
  const sites = siteMappings || [];
  const workersMap = workerMappings || [];
  const lines = preview?.presenceLines || [];
  const planned = plannedLines || [];

  const projectsResolved = sites.filter((s) => s.projectId);
  const projectsUnresolved = sites.filter((s) => !s.projectId);
  const costCenters = sites.filter((s) => s.kind === 'internal_atelier' || s.kind === 'internal_depot');

  const workersLinked = workersMap.filter((w) => w.action === 'link' && w.workerId);
  const workersCreate = workersMap.filter((w) => w.action === 'create');
  const workersUnknown = workersMap.filter((w) => w.action === 'unset' || (w.action === 'link' && !w.workerId));
  const workersUncertain = workersMap.filter((w) => w.status === 'uncertain' && w.action === 'link');

  const unassignedPairs = planned.filter((p) => (
    p.siteResolved
    && p.workerAction === 'link'
    && p.workerId
    && !p.assigned
  ));
  const uniqueUnassigned = [...new Map(
    unassignedPairs.map((p) => [`${p.workerId}|${p.projectId}`, p]),
  ).values()];

  const overtimeLines = planned.filter((p) => p.willCreateOvertime || Number(p.overtimeHours) > 0);
  const redirects = lines.filter((l) => l.redirectedFromBlock);
  const anomalies = [...(preview?.anomalies || [])];

  if (projectsUnresolved.length) {
    anomalies.push({
      level: 'error',
      code: 'PROJECTS_UNMAPPED',
      message: `${projectsUnresolved.length} chantier(s) à résoudre (aucune présence ne sera créée sans validation).`,
    });
  }
  if (workersUnknown.length) {
    anomalies.push({
      level: 'error',
      code: 'WORKERS_UNKNOWN',
      message: `${workersUnknown.length} ouvrier(s) non associés (lier ou créer).`,
    });
  }
  if (uniqueUnassigned.length) {
    anomalies.push({
      level: 'error',
      code: 'WORKERS_NOT_ASSIGNED',
      message: `${uniqueUnassigned.length} couple(s) ouvrier/projet non affecté(s) — utilisez « Affecter maintenant ».`,
    });
  }
  if (workersUncertain.length) {
    anomalies.push({
      level: 'warning',
      code: 'WORKERS_UNCERTAIN',
      message: `${workersUncertain.length} correspondance(s) ouvrier incertaine(s) à vérifier.`,
    });
  }

  const blockingErrors = anomalies.filter((a) => a.level === 'error');
  const readyLines = planned.filter((p) => p.ready && p.willCreateAttendance);
  const canValidate = blockingErrors.length === 0 && readyLines.length > 0;

  return {
    workersRecognized: workersLinked.length,
    workersUnknown: workersUnknown.length,
    workersToCreate: workersCreate.length,
    workersUncertain: workersUncertain.length,
    projectsRecognized: projectsResolved.length,
    projectsUnknown: projectsUnresolved.length,
    costCenterCount: costCenters.length,
    redirectCount: redirects.length,
    overtimeCount: overtimeLines.filter((p) => Number(p.overtimeHours) > 0).length,
    unassignedCount: uniqueUnassigned.length,
    unassignedPairs: uniqueUnassigned,
    plannedCount: planned.length,
    readyCount: readyLines.length,
    anomalyCount: anomalies.length,
    anomalies,
    canValidate,
    presenceCount: preview?.stats?.presenceCount || 0,
    absenceCount: preview?.stats?.absenceCount || 0,
    workerCount: workersMap.length,
    siteCount: sites.length,
    overtimeDetails: overtimeLines.filter((p) => Number(p.overtimeHours) > 0),
    plannedLines: planned,
  };
}

/** Référence d’import (format). La séquence réelle sera attribuée à l’écriture BDD. */
export function formatImportBatchRef(year, seq) {
  const y = Number(year) || new Date().getFullYear();
  const n = String(Number(seq) || 1).padStart(5, '0');
  return `IMP-${y}-${n}`;
}

export function buildImportBatchPreview(preview, summary, { userLabel = '' } = {}) {
  const year = preview?.week?.debut
    ? Number(String(preview.week.debut).slice(0, 4))
    : new Date().getFullYear();
  return {
    refPreview: formatImportBatchRef(year, 1),
    refNote: 'Numéro définitif attribué à la validation (séquence annuelle).',
    userLabel,
    importedAtPreview: new Date().toISOString(),
    weekDebut: preview?.week?.debut || '',
    weekFin: preview?.week?.fin || '',
    workerCount: summary?.workerCount || 0,
    presenceCount: summary?.readyCount || summary?.presenceCount || 0,
    statut: 'Analyse',
  };
}
