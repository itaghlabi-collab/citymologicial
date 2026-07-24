/**
 * equipmentRentalRequests.js — Demandes d'engin de location (module Projets)
 * Accès via Supabase (RLS) — pas de route Express dédiée.
 */
import { getSupabase } from '../../lib/supabase';
import { formatProfileDisplayName } from '../admin/users';
import {
  EQUIPMENT_STATUS_TRANSITIONS,
  equipmentStatutLabel,
  equipmentTypeDisplay,
} from '../../constants/equipmentRentalRequests';

const TABLE = 'equipment_rental_requests';
const HISTORY = 'equipment_rental_request_history';

const SELECT = '*';

export function normalizeEquipmentRentalRequest(row, history = []) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference || '',
    projetId: row.projet_id ? String(row.projet_id) : '',
    projetLieId: row.projet_lie_id ? String(row.projet_lie_id) : (row.projet_id ? String(row.projet_id) : ''),
    projetNom: row.projet_nom || '',
    projetLieNom: row.projet_lie_nom || row.projet_nom || '',
    projetRef: '',
    demandeurId: row.demandeur_id || null,
    demandeurNom: row.demandeur_nom || '',
    demandeurFonction: row.demandeur_fonction || '',
    typeEngin: row.type_engin || '',
    typeEnginAutre: row.type_engin_autre || '',
    typeEnginLabel: equipmentTypeDisplay(row.type_engin, row.type_engin_autre),
    dateDemande: row.date_demande || '',
    dateDebutSouhaitee: row.date_debut_souhaitee || '',
    dureePrevue: Number(row.duree_prevue) || 0,
    uniteDuree: row.unite_duree || 'journee',
    quantite: Number(row.quantite) || 1,
    motifTravaux: row.motif_travaux || '',
    niveauUrgence: row.niveau_urgence || 'normal',
    avecChauffeur: !!row.avec_chauffeur,
    observation: row.observation || '',
    statut: row.statut || 'brouillon',
    statutLabel: equipmentStatutLabel(row.statut),
    motifRefus: row.motif_refus || '',
    motifAnnulation: row.motif_annulation || '',
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null,
    history: history || [],
  };
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

async function getProfileInfo(userId) {
  if (!userId) return { name: '', role: '', fonction: '' };
  const { data } = await getSupabase()
    .from('profiles')
    .select('nom, prenom, email, role, fonction')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return { name: '', role: '', fonction: '' };
  return {
    name: formatProfileDisplayName(data) || data.email || '',
    role: data.role || '',
    fonction: data.fonction || data.role || '',
  };
}

export async function generateEquipmentRentalRef() {
  await requireUser();
  const year = new Date().getFullYear();
  const prefix = `DENG-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('reference')
    .like('reference', `${prefix}%`)
    .order('reference', { ascending: false })
    .limit(50);
  if (error) throw error;
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.reference || '').match(/DENG-\d{4}-(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

async function logHistory({
  demandeId, userId, userName, action, ancienStatut, nouveauStatut, commentaire,
}) {
  const { error } = await getSupabase().from(HISTORY).insert([{
    demande_id: demandeId,
    utilisateur_id: userId || null,
    utilisateur_nom: userName || null,
    action,
    ancien_statut: ancienStatut || null,
    nouveau_statut: nouveauStatut || null,
    commentaire: commentaire || null,
  }]);
  if (error) console.warn('[CITYMO] equipment_rental_request_history', error);
}

async function loadHistory(demandeId) {
  const { data, error } = await getSupabase()
    .from(HISTORY)
    .select('*')
    .eq('demande_id', demandeId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((h) => ({
    id: h.id,
    demandeId: h.demande_id,
    utilisateurId: h.utilisateur_id,
    utilisateurNom: h.utilisateur_nom || '',
    action: h.action,
    ancienStatut: h.ancien_statut,
    nouveauStatut: h.nouveau_statut,
    commentaire: h.commentaire || '',
    createdAt: h.created_at,
  }));
}

/**
 * Validation métier (français).
 * projetlié : si absent, on réutilise projet_id (même source projets).
 */
export function validateEquipmentRentalForm(form) {
  const err = {};
  if (!form.projetId) err.projetId = 'Projet / chantier requis.';
  if (!form.demandeurNom && !form.demandeurId) err.demandeur = 'Demandeur requis.';
  if (!form.typeEngin) err.typeEngin = 'Type d’engin requis.';
  if (form.typeEngin === 'Autre' && !String(form.typeEnginAutre || '').trim()) {
    err.typeEnginAutre = 'Précisez le type d’engin.';
  }
  if (!form.dateDemande) err.dateDemande = 'Date de la demande requise.';
  if (!form.dateDebutSouhaitee) err.dateDebutSouhaitee = 'Date de début souhaitée requise.';
  if (form.dateDemande && form.dateDebutSouhaitee && form.dateDebutSouhaitee < form.dateDemande) {
    err.dateDebutSouhaitee = 'La date de début ne peut pas être antérieure à la date de la demande.';
  }
  const duree = Number(form.dureePrevue);
  if (!(duree > 0)) err.dureePrevue = 'Durée prévue supérieure à zéro requise.';
  if (!form.uniteDuree) err.uniteDuree = 'Unité de durée requise.';
  const qty = Number(form.quantite);
  if (!Number.isInteger(qty) || qty < 1) err.quantite = 'Quantité entière positive requise.';
  // Projet lié : même source ; obligatoire à l’UI, défaut = projet principal
  if (!form.projetLieId && !form.projetId) err.projetLieId = 'Projet lié requis.';
  if (!String(form.motifTravaux || '').trim()) err.motifTravaux = 'Motif / travaux requis.';
  if (!form.niveauUrgence) err.niveauUrgence = 'Niveau d’urgence requis.';
  if (form.avecChauffeur !== true && form.avecChauffeur !== false
    && form.avecChauffeur !== 'true' && form.avecChauffeur !== 'false'
    && form.avecChauffeur !== '1' && form.avecChauffeur !== '0') {
    err.avecChauffeur = 'Indiquez avec ou sans chauffeur.';
  }
  if (!String(form.observation || '').trim()) err.observation = 'Observation requise.';
  return err;
}

function toRow(form, { userId, profile, reference, statut } = {}) {
  const projetId = form.projetId || null;
  // Même source projets : si projet lié vide ou identique, on stocke le même id (pas de 2e table)
  const projetLieId = form.projetLieId || projetId;
  const avec = form.avecChauffeur === true || form.avecChauffeur === 'true' || form.avecChauffeur === '1';
  return {
    reference: reference || form.reference || null,
    projet_id: projetId,
    projet_lie_id: projetLieId,
    projet_nom: form.projetNom || null,
    projet_lie_nom: form.projetLieNom || form.projetNom || null,
    demandeur_id: form.demandeurId || userId || null,
    demandeur_nom: form.demandeurNom || profile?.name || null,
    demandeur_fonction: form.demandeurFonction || profile?.fonction || null,
    type_engin: form.typeEngin,
    type_engin_autre: form.typeEngin === 'Autre' ? (form.typeEnginAutre || '').trim() : null,
    date_demande: form.dateDemande,
    date_debut_souhaitee: form.dateDebutSouhaitee,
    duree_prevue: Number(form.dureePrevue) || 1,
    unite_duree: form.uniteDuree || 'journee',
    quantite: Math.max(1, parseInt(form.quantite, 10) || 1),
    motif_travaux: String(form.motifTravaux || '').trim(),
    niveau_urgence: form.niveauUrgence || 'normal',
    avec_chauffeur: avec,
    observation: String(form.observation || '').trim(),
    statut: statut || form.statut || 'brouillon',
    updated_by: userId || null,
  };
}

export async function listEquipmentRentalRequests({ includeArchived = true } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (!includeArchived) q = q.neq('statut', 'archivee');
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => normalizeEquipmentRentalRequest(r));
}

export async function getEquipmentRentalRequest(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  const history = await loadHistory(id);
  return normalizeEquipmentRentalRequest(data, history);
}

export async function createEquipmentRentalRequest(form) {
  const user = await requireUser();
  const errs = validateEquipmentRentalForm(form);
  if (Object.keys(errs).length) {
    const err = new Error(Object.values(errs)[0]);
    err.code = 'VALIDATION';
    err.fields = errs;
    throw err;
  }
  const profile = await getProfileInfo(user.id);
  const reference = await generateEquipmentRentalRef();
  const row = toRow(form, {
    userId: user.id,
    profile,
    reference,
    statut: 'brouillon',
  });
  row.created_by = user.id;
  row.demandeur_id = user.id;
  row.demandeur_nom = profile.name || form.demandeurNom;
  row.demandeur_fonction = profile.fonction || form.demandeurFonction || '';

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select(SELECT)
    .single();
  if (error) throw error;

  await logHistory({
    demandeId: data.id,
    userId: user.id,
    userName: profile.name,
    action: 'creation',
    ancienStatut: null,
    nouveauStatut: 'brouillon',
    commentaire: 'Création de la demande',
  });

  return normalizeEquipmentRentalRequest(data);
}

export async function updateEquipmentRentalRequest(id, form) {
  const user = await requireUser();
  const current = await getEquipmentRentalRequest(id);
  if (current.statut !== 'brouillon') {
    const err = new Error('Seules les demandes en brouillon peuvent être modifiées.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (current.createdBy && current.createdBy !== user.id) {
    // autorisé si rôle modifier côté UI — backend soft : créateur uniquement pour v1
  }
  const errs = validateEquipmentRentalForm(form);
  if (Object.keys(errs).length) {
    const err = new Error(Object.values(errs)[0]);
    err.code = 'VALIDATION';
    err.fields = errs;
    throw err;
  }
  const profile = await getProfileInfo(user.id);
  const row = toRow({ ...form, reference: current.reference }, {
    userId: user.id,
    profile,
    reference: current.reference,
    statut: 'brouillon',
  });
  delete row.reference;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw error;

  await logHistory({
    demandeId: id,
    userId: user.id,
    userName: profile.name,
    action: 'modification',
    ancienStatut: 'brouillon',
    nouveauStatut: 'brouillon',
    commentaire: 'Modification du brouillon',
  });

  return normalizeEquipmentRentalRequest(data);
}

export async function changeEquipmentRentalStatus(id, {
  statut,
  motifRefus = '',
  motifAnnulation = '',
  commentaire = '',
} = {}) {
  const user = await requireUser();
  const current = await getEquipmentRentalRequest(id);
  const allowed = EQUIPMENT_STATUS_TRANSITIONS[current.statut] || [];
  if (!allowed.includes(statut)) {
    const err = new Error(`Transition impossible : ${current.statutLabel} → ${equipmentStatutLabel(statut)}.`);
    err.code = 'VALIDATION';
    throw err;
  }
  if (statut === 'refusee' && !String(motifRefus || '').trim()) {
    const err = new Error('Le motif du refus est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (statut === 'annulee' && !String(motifAnnulation || '').trim()) {
    const err = new Error('Le motif de l’annulation est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }

  const profile = await getProfileInfo(user.id);
  const patch = {
    statut,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (statut === 'refusee') patch.motif_refus = String(motifRefus).trim();
  if (statut === 'annulee') patch.motif_annulation = String(motifAnnulation).trim();
  if (statut === 'archivee') patch.archived_at = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw error;

  const actionMap = {
    envoyee: 'envoi',
    en_cours: 'prise_en_charge',
    validee: 'validation',
    refusee: 'refus',
    traitee: 'traitee',
    annulee: 'annulation',
    archivee: 'archivage',
  };

  await logHistory({
    demandeId: id,
    userId: user.id,
    userName: profile.name,
    action: actionMap[statut] || 'changement_statut',
    ancienStatut: current.statut,
    nouveauStatut: statut,
    commentaire: commentaire
      || motifRefus
      || motifAnnulation
      || `Statut : ${equipmentStatutLabel(statut)}`,
  });

  const normalized = normalizeEquipmentRentalRequest(data);
  // Notifications (best-effort)
  try {
    const {
      notifyEquipmentRentalSubmitted,
      notifyEquipmentRentalStatusChange,
    } = await import('../notifications/notificationEvents');
    if (statut === 'envoyee') {
      await notifyEquipmentRentalSubmitted(normalized);
    } else {
      await notifyEquipmentRentalStatusChange(normalized, current.statut);
    }
  } catch (e) {
    console.warn('[CITYMO] notif equipment rental', e);
  }

  return normalized;
}

export async function submitEquipmentRentalRequest(id) {
  return changeEquipmentRentalStatus(id, { statut: 'envoyee', commentaire: 'Demande envoyée' });
}
