/**
 * fabricationProductions.js — Productions : désignations, affectations, opérations, avancement
 * Les productions restent stockées dans fabrication_plans (table existante).
 */
import { getSupabase } from '../../lib/supabase';
import { formatProfileDisplayName } from '../admin/users';
import { formatSupabaseError } from '../supabase/formatError';
import {
  todayISO,
  fabLinesPercent,
  FAB_SUIVI_STATUTS,
} from '../../constants/fabrication';
import { uploadFabricationFile } from './fabricationStorage';
import { generateFabricationRef } from './fabricationPlans';

const PROD = 'fabrication_plans';
const LINES = 'fabrication_production_lines';
const ASSIGN = 'fabrication_assignments';
const OPS = 'fabrication_operations';
const HIST = 'fabrication_history';
const ATT = 'fabrication_attachments';

function prodError(error, fallback = 'Erreur production.') {
  return new Error(formatSupabaseError(error, fallback));
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user;
}

async function getProfileName(userId) {
  if (!userId) return '';
  const { data } = await getSupabase()
    .from('profiles')
    .select('nom, prenom, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return '';
  return formatProfileDisplayName(data) || data.email || '';
}

function employeeName(e) {
  return [e?.firstname, e?.lastname].filter(Boolean).join(' ').trim() || e?.email || '—';
}

/**
 * Personnel affectable : employés RH actifs (+ compte ERP lié s'il existe).
 * Lecture seule, aucune donnée RH modifiée.
 */
export async function listAtelierStaff() {
  await requireUser();
  const sb = getSupabase();
  const [{ data: emps, error }, { data: profs }] = await Promise.all([
    sb.from('employees')
      .select('id, firstname, lastname, email, poste, department, statut')
      .order('lastname', { ascending: true }),
    sb.from('profiles').select('id, employee_id').not('employee_id', 'is', null),
  ]);
  if (error) {
    console.warn('[CITYMO] fabrication staff', error.message);
    return [];
  }
  const profileByEmployee = new Map((profs || []).map((p) => [p.employee_id, p.id]));
  return (emps || [])
    .filter((e) => !e.statut || String(e.statut).toLowerCase() === 'actif')
    .map((e) => ({
      id: e.id,
      nom: employeeName(e),
      poste: e.poste || '',
      department: e.department || '',
      profile_id: profileByEmployee.get(e.id) || null,
    }));
}

function normalizeLine(r) {
  return {
    id: r.id,
    production_id: r.production_id,
    ordre: Number(r.ordre || 0),
    designation: r.designation || '',
    description: r.description || '',
    quantite: Number(r.quantite || 0),
    unite: r.unite || 'unite',
    unite_autre: r.unite_autre || '',
    atelier: r.atelier || '',
    machine_type: r.machine_type || '',
    quantite_realisee: Number(r.quantite_realisee || 0),
  };
}

function normalizeOperation(r) {
  return {
    id: r.id,
    production_id: r.production_id,
    ordre: Number(r.ordre || 0),
    travail: r.travail || '',
    responsable_employee_id: r.responsable_employee_id || null,
    responsable_nom: r.responsable_nom || '',
    date_prevue: r.date_prevue || '',
    date_limite: r.date_limite || '',
    statut: r.statut || 'a_faire',
  };
}

/** Désignations, ouvriers et opérations de plusieurs productions en 3 requêtes groupées. */
export async function loadProductionExtras(productionIds = []) {
  const ids = productionIds.filter(Boolean);
  if (!ids.length) return {};
  const sb = getSupabase();
  const [lines, assigns, ops] = await Promise.all([
    sb.from(LINES).select('*').in('production_id', ids).order('ordre', { ascending: true }),
    sb.from(ASSIGN).select('*').in('production_id', ids).order('created_at', { ascending: true }),
    sb.from(OPS).select('*').in('production_id', ids).order('ordre', { ascending: true }),
  ]);
  for (const res of [lines, assigns, ops]) {
    if (res.error && res.error.code !== '42P01') throw prodError(res.error);
  }
  const out = {};
  const bucket = (id) => (out[id] ||= { lines: [], ouvriers: [], operations: [] });
  (lines.data || []).forEach((r) => bucket(r.production_id).lines.push(normalizeLine(r)));
  (assigns.data || []).forEach((r) => bucket(r.production_id).ouvriers.push({
    id: r.id,
    employee_id: r.employee_id,
    nom: r.employee_nom || '',
    poste: r.poste || '',
  }));
  (ops.data || []).forEach((r) => bucket(r.production_id).operations.push(normalizeOperation(r)));
  return out;
}

/**
 * Chevauchements : pour chaque employé, productions actives qui recouvrent la période.
 * Purement indicatif — n'empêche jamais l'affectation.
 */
export async function findStaffOverlaps(employeeIds = [], dateDebut, dateFin, excludeProductionId = null) {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (!ids.length || !dateDebut || !dateFin) return {};
  const sb = getSupabase();
  const [{ data: assigns }, { data: asResp }] = await Promise.all([
    sb.from(ASSIGN).select('production_id, employee_id').in('employee_id', ids),
    sb.from(PROD).select('id, responsable_employee_id').in('responsable_employee_id', ids),
  ]);
  const pairs = [
    ...(assigns || []).map((a) => ({ production_id: a.production_id, employee_id: a.employee_id })),
    ...(asResp || []).map((p) => ({ production_id: p.id, employee_id: p.responsable_employee_id })),
  ].filter((p) => p.production_id !== excludeProductionId);
  const prodIds = [...new Set(pairs.map((p) => p.production_id))];
  if (!prodIds.length) return {};
  const { data: prods } = await sb
    .from(PROD)
    .select('id, reference, designation, statut, date_debut_prevue, date_fin_prevue')
    .in('id', prodIds)
    .in('statut', FAB_SUIVI_STATUTS);
  const byId = new Map((prods || []).map((p) => [p.id, p]));
  const out = {};
  pairs.forEach(({ production_id, employee_id }) => {
    const p = byId.get(production_id);
    if (!p) return;
    const start = p.date_debut_prevue || p.date_fin_prevue;
    const end = p.date_fin_prevue || p.date_debut_prevue;
    if (!start || !end) return;
    if (start <= dateFin && end >= dateDebut) {
      const list = (out[employee_id] ||= []);
      if (!list.some((x) => x.id === p.id)) list.push(p);
    }
  });
  return out;
}

function cleanLines(lines = []) {
  return lines
    .map((l, i) => ({
      ordre: i,
      designation: String(l.designation || '').trim(),
      description: String(l.description || '').trim(),
      quantite: Number(l.quantite),
      unite: l.unite || 'unite',
      unite_autre: l.unite === 'autre' ? String(l.unite_autre || '').trim() : '',
      atelier: l.atelier || null,
      machine_type: l.atelier === 'machinerie' ? (l.machine_type || null) : null,
    }))
    .filter((l) => l.designation);
}

function validateProduction(payload, lines, draft) {
  if (!payload.project?.id) throw new Error('Le projet est obligatoire.');
  if (!lines.length) throw new Error('Ajoutez au moins une désignation.');
  if (draft) return;
  if (!payload.library_plan_id) throw new Error('Sélectionnez un plan.');
  lines.forEach((l, i) => {
    if (!(l.quantite > 0)) throw new Error(`Désignation ${i + 1} : quantité obligatoire (> 0).`);
    if (!l.atelier) throw new Error(`Désignation ${i + 1} : atelier obligatoire.`);
  });
  if (!payload.atelier) throw new Error('L’atelier principal est obligatoire.');
  if (!payload.date_debut) throw new Error('La date de début est obligatoire.');
  if (!payload.date_limite) throw new Error('La date limite est obligatoire.');
  if (payload.date_limite < payload.date_debut) throw new Error('La date limite doit être après la date de début.');
}

function headerDesignation(lines) {
  if (!lines.length) return '';
  const first = lines[0].designation;
  return lines.length > 1 ? `${first} (+${lines.length - 1})` : first;
}

async function replaceChildren(productionId, userId, { lines, ouvriers, operations }) {
  const sb = getSupabase();
  await Promise.all([
    sb.from(LINES).delete().eq('production_id', productionId),
    sb.from(ASSIGN).delete().eq('production_id', productionId),
    sb.from(OPS).delete().eq('production_id', productionId),
  ]);
  const inserts = [];
  if (lines.length) {
    inserts.push(sb.from(LINES).insert(lines.map((l) => ({ ...l, production_id: productionId }))));
  }
  const uniqueOuvriers = [];
  const seen = new Set();
  (ouvriers || []).forEach((o) => {
    if (o?.id && !seen.has(o.id)) {
      seen.add(o.id);
      uniqueOuvriers.push(o);
    }
  });
  if (uniqueOuvriers.length) {
    inserts.push(sb.from(ASSIGN).insert(uniqueOuvriers.map((o) => ({
      production_id: productionId,
      employee_id: o.id,
      employee_nom: o.nom || '',
      poste: o.poste || '',
      created_by: userId,
    }))));
  }
  const ops = (operations || [])
    .map((o, i) => ({
      production_id: productionId,
      ordre: i,
      travail: String(o.travail || '').trim(),
      responsable_employee_id: o.responsable_employee_id || null,
      responsable_nom: o.responsable_nom || '',
      date_prevue: o.date_prevue || null,
      date_limite: o.date_limite || null,
      statut: o.statut || 'a_faire',
    }))
    .filter((o) => o.travail);
  if (ops.length) inserts.push(sb.from(OPS).insert(ops));
  const results = await Promise.all(inserts);
  const failed = results.find((r) => r.error);
  if (failed) throw prodError(failed.error);
}

async function insertHistory(row) {
  const { error } = await getSupabase().from(HIST).insert([row]);
  if (error) throw prodError(error);
}

/**
 * Crée ou met à jour une production (brouillon ou démarrée).
 * draft=true  → statut « brouillon » (non compté comme démarrée)
 * draft=false → statut « en_fabrication » (apparaît dans le Suivi)
 */
export async function saveProduction(payload, { draft = false, productionId = null } = {}) {
  const user = await requireUser();
  const lines = cleanLines(payload.lines);
  validateProduction(payload, lines, draft);
  const userName = await getProfileName(user.id);
  const sb = getSupabase();
  const resp = payload.responsable || null;

  let current = null;
  if (productionId) {
    const { data, error } = await sb.from(PROD).select('*').eq('id', productionId).maybeSingle();
    if (error) throw prodError(error);
    if (!data) throw new Error('Production introuvable.');
    if (data.statut !== 'brouillon' && data.statut !== 'plan_recu') {
      throw new Error('Seuls les brouillons peuvent être modifiés ici.');
    }
    current = data;
  }

  const nextStatut = draft ? 'brouillon' : 'en_fabrication';
  const fields = {
    library_plan_id: payload.library_plan_id || null,
    project_id: payload.project.id,
    projet_nom: payload.project.nom || '',
    projet_ref: payload.project.ref || '',
    designation: headerDesignation(lines),
    description: String(payload.description || '').trim(),
    observations: String(payload.observations || '').trim(),
    atelier: payload.atelier || null,
    machine_type: payload.atelier === 'machinerie' ? (payload.machine_type || null) : null,
    priorite: payload.priorite || 'normale',
    date_debut_prevue: payload.date_debut || null,
    date_fin_prevue: payload.date_limite || null,
    consigne: String(payload.instructions || '').trim(),
    responsable_employee_id: resp?.id || null,
    chef_atelier_user_id: resp?.profile_id || null,
    chef_atelier_nom: resp?.nom || '',
    statut: nextStatut,
    avancement: 0,
    affecte_par_id: user.id,
    affecte_par_nom: userName,
    date_affectation: new Date().toISOString(),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (!draft) fields.date_debut_reelle = todayISO();

  let id = productionId;
  if (current) {
    const { error } = await sb.from(PROD).update(fields).eq('id', id);
    if (error) throw prodError(error);
  } else {
    const reference = await generateFabricationRef();
    const { data, error } = await sb
      .from(PROD)
      .insert([{
        ...fields,
        reference,
        commentaire_transmission: '',
        transmetteur_id: payload.transmetteur_id || user.id,
        transmetteur_nom: payload.transmetteur_nom || userName,
        created_by: user.id,
      }])
      .select('id')
      .single();
    if (error) throw prodError(error);
    id = data.id;
  }

  await replaceChildren(id, user.id, {
    lines,
    ouvriers: payload.ouvriers,
    operations: payload.operations,
  });

  if (!current || current.statut !== nextStatut) {
    await insertHistory({
      plan_id: id,
      utilisateur_id: user.id,
      utilisateur_nom: userName,
      ancien_statut: current?.statut || null,
      nouveau_statut: nextStatut,
      avancement: 0,
      commentaire: draft ? 'Production enregistrée en brouillon' : 'Production débutée',
    });
  }
  return id;
}

/**
 * Saisie d'avancement par désignation.
 * lineUpdates : [{ line_id, quantite_realisee }] (quantité réalisée cumulée)
 */
export async function recordProductionProgress(productionId, {
  lineUpdates = [],
  statut,
  commentaire,
  probleme,
  motif_blocage,
  date_saisie,
  photos = [],
}) {
  const user = await requireUser();
  const userName = await getProfileName(user.id);
  const sb = getSupabase();

  const [{ data: prod, error: prodErr }, { data: lineRows, error: linesErr }] = await Promise.all([
    sb.from(PROD).select('*').eq('id', productionId).maybeSingle(),
    sb.from(LINES).select('*').eq('production_id', productionId).order('ordre', { ascending: true }),
  ]);
  if (prodErr) throw prodError(prodErr);
  if (linesErr) throw prodError(linesErr);
  if (!prod) throw new Error('Production introuvable.');

  const lines = (lineRows || []).map(normalizeLine);
  const updates = lineUpdates
    .map((u) => ({ ...u, quantite_realisee: Number(u.quantite_realisee) }))
    .filter((u) => {
      const line = lines.find((l) => l.id === u.line_id);
      return line && Number.isFinite(u.quantite_realisee) && u.quantite_realisee >= 0
        && u.quantite_realisee !== line.quantite_realisee;
    });

  const now = new Date().toISOString();
  for (const u of updates) {
    const { error } = await sb
      .from(LINES)
      .update({ quantite_realisee: u.quantite_realisee, updated_at: now })
      .eq('id', u.line_id);
    if (error) throw prodError(error);
    const line = lines.find((l) => l.id === u.line_id);
    line.quantite_realisee = u.quantite_realisee;
  }

  const pct = fabLinesPercent(lines);
  const avancement = pct == null ? Number(prod.avancement || 0) : pct;
  let nextStatut = statut || prod.statut;
  if (pct === 100 && !statut) nextStatut = 'termine';
  if (nextStatut === 'bloque' && !String(motif_blocage || prod.motif_blocage || '').trim()) {
    throw new Error('Le motif du blocage est obligatoire.');
  }

  const patch = { avancement, statut: nextStatut, updated_by: user.id, updated_at: now };
  if (nextStatut === 'bloque') {
    patch.motif_blocage = String(motif_blocage || prod.motif_blocage || '').trim();
  } else if (prod.statut === 'bloque') {
    patch.motif_blocage = null;
  }
  if (nextStatut === 'en_fabrication' && !prod.date_debut_reelle) patch.date_debut_reelle = todayISO();
  if (nextStatut === 'termine' && !prod.date_fin_reelle) {
    patch.date_fin_reelle = date_saisie || todayISO();
    if (!prod.date_debut_reelle) patch.date_debut_reelle = todayISO();
  }
  const { error: upErr } = await sb.from(PROD).update(patch).eq('id', productionId);
  if (upErr) throw prodError(upErr);

  for (const file of photos) {
    if (!file) continue;
    const storage_path = await uploadFabricationFile(productionId, file);
    const { error } = await sb.from(ATT).insert([{
      plan_id: productionId,
      kind: 'photo',
      storage_path,
      file_name: file.name || '',
      mime_type: file.type || null,
      file_size: file.size || null,
      created_by: user.id,
    }]);
    if (error) throw prodError(error);
  }

  const base = {
    plan_id: productionId,
    utilisateur_id: user.id,
    utilisateur_nom: userName,
    date_saisie: date_saisie || todayISO(),
  };
  const comment = String(commentaire || '').trim();
  const problem = String(probleme || '').trim();
  const rows = updates.map((u, i) => ({
    ...base,
    line_id: u.line_id,
    quantite_realisee: u.quantite_realisee,
    ancien_statut: i === 0 ? prod.statut : null,
    nouveau_statut: i === 0 ? nextStatut : null,
    avancement,
    commentaire: comment,
    probleme: problem || null,
  }));
  if (!rows.length) {
    rows.push({
      ...base,
      ancien_statut: prod.statut,
      nouveau_statut: nextStatut,
      avancement,
      commentaire: comment || (nextStatut === 'bloque' ? patch.motif_blocage : ''),
      probleme: problem || null,
    });
  }
  const { error: hErr } = await sb.from(HIST).insert(rows);
  if (hErr) throw prodError(hErr);
}

export async function updateOperationStatut(operationId, statut) {
  await requireUser();
  const { error } = await getSupabase()
    .from(OPS)
    .update({ statut, updated_at: new Date().toISOString() })
    .eq('id', operationId);
  if (error) throw prodError(error);
}
