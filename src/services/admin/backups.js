/**
 * backups.js — Journal des sauvegardes ERP (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import { moduleLabel } from './constants';

const TABLE = 'erp_backups';

const STATUT_DB = {
  succes: 'Succès',
  en_cours: 'En cours',
  erreur: 'Erreur',
  planifie: 'Planifié',
};

const STATUT_UI = {
  Succès: 'succes',
  'En cours': 'en_cours',
  Erreur: 'erreur',
  Planifié: 'planifie',
};

const TYPE_UI = {
  Complète: 'complete',
  'Base données': 'base_donnees',
  Documents: 'documents',
  Système: 'systeme',
  Manuelle: 'manuelle',
  Automatique: 'automatique',
};

const TYPE_DB = Object.fromEntries(Object.entries(TYPE_UI).map(([k, v]) => [v, k]));

function formatTaille(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function mapBackup(row) {
  return {
    id: row.id,
    ref: row.ref,
    nom: row.nom || '—',
    type: TYPE_DB[row.type] || row.type || 'Manuelle',
    module: row.module_code ? moduleLabel(row.module_code) : '—',
    planification: row.planification === 'manuelle' ? 'Manuelle' : row.planification,
    date: row.created_at
      ? new Date(row.created_at).toLocaleString('fr-FR')
      : '—',
    taille: formatTaille(row.taille_bytes),
    taille_bytes: row.taille_bytes,
    statut: STATUT_DB[row.statut] || 'En cours',
    cree_par: row.cree_par_nom || '—',
    description: row.description || '',
    created_at: row.created_at,
  };
}

export function genBackupRef() {
  const y = new Date().getFullYear();
  const n = String(Math.floor(Math.random() * 9000) + 1000);
  return `BCK-${y}-${n}`;
}

export async function listBackups() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapBackup);
}

export async function createBackupLog({ type, planification, description, module_code }, actor) {
  const sb = getSupabase();
  const ref = genBackupRef();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const typeKey = TYPE_UI[type] || 'manuelle';
  const nom = `backup_citymo_${today}_${typeKey}.sql`;

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      ref,
      nom,
      type: typeKey,
      module_code: module_code || null,
      planification: (planification || 'Manuelle').toLowerCase(),
      statut: 'en_cours',
      description: description?.trim() || null,
      cree_par: actor?.id || null,
      cree_par_nom: actor?.nom || actor?.email || 'Administrateur',
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapBackup(data);
}

export async function finalizeBackup(id, { statut = 'Succès', taille_bytes = null } = {}) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .update({
      statut: STATUT_UI[statut] || 'succes',
      taille_bytes,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapBackup(data);
}

export async function deleteBackup(id) {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function requestRestore(backup) {
  // Journal uniquement — pas de restauration destructive réelle
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).insert({
    ref: genBackupRef(),
    nom: `restore_request_${backup.ref}.log`,
    type: 'systeme',
    planification: 'manuelle',
    statut: 'planifie',
    description: `Demande de restauration pour ${backup.ref} — confirmation manuelle requise en production.`,
    cree_par_nom: 'Système',
  });
  if (error) throw error;
}
