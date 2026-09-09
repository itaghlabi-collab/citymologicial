/**
 * fabricationDeliveryNotes.js — Bons de livraison Fabrication (isolé)
 * Table : fabrication_delivery_notes — distinct de CRM delivery_notes.
 */
import { getSupabase } from '../../lib/supabase';
import { formatSupabaseError } from '../supabase/formatError';

const TABLE = 'fabrication_delivery_notes';
const SCHEMA_HINT =
  'Table Fabrication BL absente — exécutez supabase/RUN_FABRICATION_DELIVERY_NOTES.sql dans Supabase (SQL Editor).';

function schemaError(error) {
  const msg = String(error?.message || error || '');
  if (error?.code === '42P01' || msg.includes('fabrication_delivery_notes')) {
    return new Error(SCHEMA_HINT);
  }
  return new Error(formatSupabaseError(error, 'Erreur bon de livraison Fabrication.'));
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

function lineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeLines(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((l) => ({
      id: l.id || lineId(),
      designation: String(l.designation || '').trim(),
      quantite: l.quantite === '' || l.quantite == null ? '' : String(l.quantite),
    }))
    .filter((l) => l.designation);
}

export function normalizeFabricationDeliveryNote(row) {
  if (!row) return null;
  const lines = normalizeLines(row.lines);
  return {
    id: row.id,
    numero: row.numero || '',
    date_bl: row.date_bl || '',
    client_societe: row.client_societe || '',
    destinataire_nom: row.destinataire_nom || '',
    adresse: row.adresse || '',
    telephone: row.telephone || '',
    lines,
    lignes: lines,
    statut: row.statut || 'Brouillon',
    note: row.note || '',
    nb_lignes: lines.length,
    created_at: row.created_at,
    updated_at: row.updated_at,
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
  };
}

function toRow(form) {
  const lines = normalizeLines(form.lines || form.lignes);
  return {
    numero: (form.numero || '').trim() || null,
    date_bl: form.date_bl || form.date || null,
    client_societe: (form.client_societe || '').trim(),
    destinataire_nom: (form.destinataire_nom || '').trim(),
    adresse: (form.adresse || '').trim(),
    telephone: (form.telephone || '').trim(),
    lines,
    statut: form.statut || 'Brouillon',
    note: form.note?.trim() || null,
  };
}

/** BL-2026-0001 — séquence annuelle isolée (table Fabrication uniquement). */
export async function generateFabricationDeliveryNoteNumero() {
  await requireUser();
  const year = new Date().getFullYear();
  const prefix = `BL-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('numero')
    .like('numero', `${prefix}%`)
    .order('numero', { ascending: false })
    .limit(50);
  if (error) throw schemaError(error);
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.numero || '').match(/^BL-\d{4}-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export async function listFabricationDeliveryNotes() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw schemaError(error);
  return (data || []).map(normalizeFabricationDeliveryNote);
}

export async function getFabricationDeliveryNote(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw schemaError(error);
  return normalizeFabricationDeliveryNote(data);
}

export async function createFabricationDeliveryNote(form) {
  const uid = await requireUser();
  const row = toRow(form);
  if (!row.numero) row.numero = await generateFabricationDeliveryNoteNumero();
  if (!row.date_bl) row.date_bl = new Date().toISOString().slice(0, 10);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid, updated_by: uid }])
    .select()
    .single();
  if (error) throw schemaError(error);
  return normalizeFabricationDeliveryNote(data);
}

export async function updateFabricationDeliveryNote(id, form) {
  const uid = await requireUser();
  const row = toRow(form);
  delete row.numero;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ ...row, updated_by: uid })
    .eq('id', id)
    .select()
    .single();
  if (error) throw schemaError(error);
  return normalizeFabricationDeliveryNote(data);
}

export async function deleteFabricationDeliveryNote(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw schemaError(error);
}
