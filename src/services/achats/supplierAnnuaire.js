/**
 * supplierAnnuaire.js — Favoris + liens achats (lecture seule) + détection colonnes
 */
import { getSupabase } from '../../lib/supabase';

const FAV_TABLE = 'purchase_supplier_favorites';
const ORDERS_TABLE = 'purchase_orders';
const EXPENSES_TABLE = 'project_expenses';

export function isMissingAnnuaireSchema(err) {
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42P01'
    || code === '42703'
    || code === 'PGRST204'
    || code === 'PGRST205'
    || msg.includes('does not exist')
    || msg.includes('schema cache')
    || msg.includes('could not find')
  );
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function listMyFavoriteSupplierIds() {
  const uid = await requireUser();
  try {
    const { data, error } = await getSupabase()
      .from(FAV_TABLE)
      .select('supplier_id')
      .eq('user_id', uid);
    if (error) throw error;
    return (data || []).map((r) => r.supplier_id).filter(Boolean);
  } catch (err) {
    if (isMissingAnnuaireSchema(err)) return [];
    throw err;
  }
}

export async function toggleFavoriteSupplier(supplierId, currentlyFavorite) {
  const uid = await requireUser();
  if (!supplierId) throw new Error('Fournisseur requis.');
  try {
    if (currentlyFavorite) {
      const { error } = await getSupabase()
        .from(FAV_TABLE)
        .delete()
        .eq('user_id', uid)
        .eq('supplier_id', supplierId);
      if (error) throw error;
      return false;
    }
    const { error } = await getSupabase()
      .from(FAV_TABLE)
      .insert([{ user_id: uid, supplier_id: supplierId }]);
    if (error) throw error;
    return true;
  } catch (err) {
    if (isMissingAnnuaireSchema(err)) {
      throw new Error('Exécutez RUN_PURCHASE_SUPPLIERS_ANNUAIRE.sql pour activer les favoris.');
    }
    throw err;
  }
}

/** Bons de commande liés (lecture seule) — ne modifie aucune logique BC. */
export async function listPurchaseOrdersForSupplier(supplierId, { limit = 30 } = {}) {
  if (!supplierId) return [];
  try {
    const { data, error } = await getSupabase()
      .from(ORDERS_TABLE)
      .select('id, ref_bc, supplier_id, supplier_name, status, total_ttc, created_at, order_date')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      ref: r.ref_bc || '',
      status: r.status || '',
      total_ttc: r.total_ttc ?? null,
      date: r.order_date || (r.created_at ? String(r.created_at).slice(0, 10) : ''),
      supplier_name: r.supplier_name || '',
    }));
  } catch (err) {
    console.warn('[CITYMO] listPurchaseOrdersForSupplier', err);
    return [];
  }
}

/** Dépenses projet mentionnant le fournisseur (par nom — lecture seule). */
export async function listExpensesForSupplierName(supplierName, { limit = 30 } = {}) {
  const name = String(supplierName || '').trim();
  if (!name) return [];
  try {
    const { data, error } = await getSupabase()
      .from(EXPENSES_TABLE)
      .select('id, project_id, montant, fournisseur, categorie, description, date_depense, created_at, statut')
      .ilike('fournisseur', name)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      project_id: r.project_id,
      montant: r.montant,
      fournisseur: r.fournisseur || '',
      categorie: r.categorie || '',
      description: r.description || '',
      date: r.date_depense || (r.created_at ? String(r.created_at).slice(0, 10) : ''),
      statut: r.statut || '',
    }));
  } catch (err) {
    console.warn('[CITYMO] listExpensesForSupplierName', err);
    return [];
  }
}

const RECENT_KEY = 'citymo_supplier_recent';

export function pushRecentSupplier(supplierId) {
  if (!supplierId || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const prev = raw ? JSON.parse(raw) : [];
    const next = [supplierId, ...(Array.isArray(prev) ? prev : []).filter((id) => id !== supplierId)].slice(0, 20);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecentSupplierIds() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const prev = raw ? JSON.parse(raw) : [];
    return Array.isArray(prev) ? prev : [];
  } catch {
    return [];
  }
}

/** Alerte doublons potentiels (ICE / raison sociale / tel / email). */
export function findSimilarSuppliers(candidates, form, { excludeId } = {}) {
  const ice = String(form.ice || '').replace(/\s+/g, '').toLowerCase();
  const name = String(form.company_name || form.raison_sociale || '').trim().toLowerCase();
  const phone = String(form.phone || form.telephone || '').replace(/\D/g, '');
  const email = String(form.email || '').trim().toLowerCase();
  if (!ice && !name && !phone && !email) return [];

  return (candidates || []).filter((s) => {
    if (!s || s.id === excludeId) return false;
    if (ice && String(s.ice || '').replace(/\s+/g, '').toLowerCase() === ice) return true;
    if (email && String(s.email || '').trim().toLowerCase() === email) return true;
    if (phone && phone.length >= 8) {
      const other = String(s.phone || '').replace(/\D/g, '');
      if (other && (other.endsWith(phone.slice(-8)) || phone.endsWith(other.slice(-8)))) return true;
    }
    if (name && name.length >= 3 && String(s.company_name || '').trim().toLowerCase() === name) return true;
    return false;
  }).slice(0, 5);
}

export function whatsappHref(whatsappOrPhone) {
  const digits = String(whatsappOrPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function telHref(phone) {
  const cleaned = String(phone || '').trim();
  if (!cleaned) return null;
  return `tel:${cleaned.replace(/\s+/g, '')}`;
}

export function mailHref(email) {
  const e = String(email || '').trim();
  if (!e) return null;
  return `mailto:${e}`;
}
