/**
 * backups.js — Sauvegardes ERP CITYMO (Supabase + API Railway sécurisée).
 */
import { getSupabase } from '../../lib/supabase';
import { ENV, resolveApiBaseUrl } from '../../config/env';
import { moduleLabel } from './constants';

const TABLE = 'erp_backups';
const BACKUP_TIMEOUT_MS = 300000;

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
    planification: capitalizePlan(row.planification),
    date: row.created_at
      ? new Date(row.created_at).toLocaleString('fr-FR')
      : '—',
    taille: formatTaille(row.taille_bytes),
    taille_bytes: row.taille_bytes,
    statut: STATUT_DB[row.statut] || 'En cours',
    cree_par: row.cree_par_nom || '—',
    description: row.description || '',
    error_message: row.error_message || '',
    file_path: row.file_path || null,
    storage_provider: row.storage_provider || 'supabase_storage',
    drive_synced: Boolean(row.drive_synced),
    drive_folder_id: row.drive_folder_id || null,
    drive_sync_error: row.drive_sync_error || '',
    created_at: row.created_at,
  };
}

function capitalizePlan(p) {
  if (!p || p === 'manuelle') return 'Manuelle';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

async function resolveBackupAuthToken() {
  const sb = getSupabase();
  const { data: { session: current }, error: sessionError } = await sb.auth.getSession();

  if (sessionError || !current?.access_token) {
    throw new Error('Session expirée. Reconnectez-vous.');
  }

  let session = current;
  const expiresAtMs = current.expires_at ? current.expires_at * 1000 : 0;
  const shouldRefresh = !expiresAtMs || expiresAtMs < Date.now() + 120_000;

  if (shouldRefresh && current.refresh_token) {
    const { data: refreshed, error: refreshError } = await sb.auth.refreshSession();
    if (!refreshError && refreshed?.session?.access_token) {
      session = refreshed.session;
    }
  }

  const token = session.access_token?.trim();
  if (!token) {
    throw new Error('Session expirée. Reconnectez-vous.');
  }

  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user) {
    throw new Error('Session expirée. Reconnectez-vous.');
  }

  return token;
}

async function backupApiFetch(path, options = {}) {
  const token = await resolveBackupAuthToken();
  const anonKey = ENV.SUPABASE_ANON_KEY?.trim();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BACKUP_TIMEOUT_MS);

  try {
    const res = await fetch(`${resolveApiBaseUrl()}${path}`, {
      ...options,
      signal: ctrl.signal,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Supabase-Token': token,
        ...(anonKey ? { apikey: anonKey } : {}),
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try {
        const err = await res.json();
        msg = err.error || err.message || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Lance une vraie sauvegarde via le backend sécurisé (Super Admin).
 * Planification quotidienne/hebdo/mensuelle → enregistre un schedule.
 */
export async function runBackup({ type, planification, description }) {
  const result = await backupApiFetch('/backups', {
    method: 'POST',
    body: JSON.stringify({
      type,
      planification,
      description,
    }),
  });

  if (result.scheduled) {
    return {
      scheduled: true,
      message: result.message,
    };
  }

  return mapBackup(result.backup);
}

export async function downloadBackup(id) {
  const result = await backupApiFetch(`/backups/${id}/download`);
  if (result.url) {
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }
  return result;
}

export async function openDriveFolder(id) {
  const result = await backupApiFetch(`/backups/${id}/drive`);
  if (result.url) {
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }
  return result;
}

export async function restoreBackup(id, confirmation) {
  return backupApiFetch(`/backups/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify({ confirmation }),
  });
}

export async function deleteBackup(id) {
  await backupApiFetch(`/backups/${id}`, { method: 'DELETE' });
}

/** @deprecated Utiliser runBackup */
export async function createBackupLog(data, actor) {
  return runBackup({
    type: data.type,
    planification: data.planification,
    description: data.description,
  });
}

/** @deprecated Géré par le backend */
export async function finalizeBackup() {
  throw new Error('finalizeBackup est géré par le backend.');
}

/** @deprecated Utiliser restoreBackup */
export async function requestRestore(backup, confirmation) {
  return restoreBackup(backup.id, confirmation);
}

export { mapBackup, formatTaille };
