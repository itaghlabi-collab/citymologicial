/**
 * suppliers.js — Fournisseurs achats (Supabase purchase_suppliers)
 * Champs annuaire optionnels : écrits si colonnes présentes, sinon fallback sans casser.
 */
import { getSupabase } from '../../lib/supabase';
import {
  attachCategoriesToSuppliers,
  isMissingCategorySchema,
  listCategoryLinksForSuppliers,
  setSupplierCategoryLinks,
} from './supplierCategories';
import { isMissingAnnuaireSchema } from './supplierAnnuaire';

const TABLE = 'purchase_suppliers';

const STATUS_UI_TO_DB = {
  Actif: 'active',
  Inactif: 'inactive',
  Archivé: 'archived',
  active: 'active',
  inactive: 'inactive',
  archived: 'archived',
};

const STATUS_DB_TO_UI = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé',
};

export function statusToDb(statut) {
  return STATUS_UI_TO_DB[statut] || 'active';
}

export function statusToUi(status) {
  return STATUS_DB_TO_UI[status] || 'Actif';
}

function boolField(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ratingOrNull(v) {
  const n = numOrNull(v);
  if (n == null) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r;
}

export function normalizeSupplier(row) {
  if (!row) return null;
  const status = row.status || 'active';
  return {
    id: row.id,
    company_name: row.company_name || '',
    trade_name: row.trade_name || '',
    ice: row.ice || '',
    rc: row.rc || '',
    tax_id: row.tax_id || '',
    cnss: row.cnss || '',
    phone: row.phone || '',
    phone_secondary: row.phone_secondary || '',
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    website: row.website || '',
    address: row.address || '',
    city: row.city || '',
    region: row.region || '',
    main_contact: row.main_contact || '',
    contact_role: row.contact_role || '',
    contact_phone: row.contact_phone || '',
    contact_email: row.contact_email || '',
    supplier_category: row.supplier_category || '',
    products_services: row.products_services || '',
    brands: row.brands || '',
    delivery_zone: row.delivery_zone || '',
    avg_delivery_delay: row.avg_delivery_delay || '',
    payment_terms: row.payment_terms || '',
    preferred_payment_method: row.preferred_payment_method || 'Virement',
    min_order_amount: row.min_order_amount ?? '',
    rib: row.rib || '',
    bank: row.bank || '',
    delivery_available: boolField(row.delivery_available),
    installation_available: boolField(row.installation_available),
    sav_available: boolField(row.sav_available),
    is_recommended: boolField(row.is_recommended),
    rating_quality_price: ratingOrNull(row.rating_quality_price),
    rating_comment: row.rating_comment || '',
    status,
    notes: row.notes || '',
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    commandes_liees: 0,
    primary_category_id: row.primary_category_id || null,
    secondary_category_ids: Array.isArray(row.secondary_category_ids) ? row.secondary_category_ids : [],
    category_ids: Array.isArray(row.category_ids) ? row.category_ids : [],
    categories: Array.isArray(row.categories) ? row.categories : [],
    secondary_categories: Array.isArray(row.secondary_categories) ? row.secondary_categories : [],
    favori: !!row.favori,
    // Alias rétrocompatibilité autres sous-modules Achats
    raison_sociale: row.company_name || '',
    contact: row.main_contact || '',
    telephone: row.phone || '',
    if_field: row.tax_id || '',
    adresse: row.address || '',
    ville: row.city || '',
    mode_paiement: row.preferred_payment_method || 'Virement',
    banque: row.bank || '',
    categorie: row.supplier_category || '',
    statut: statusToUi(status),
  };
}

function toSupplierRowBase(form) {
  return {
    company_name: (form.company_name || form.raison_sociale || '').trim(),
    ice: form.ice?.trim() || null,
    rc: form.rc?.trim() || null,
    tax_id: (form.tax_id || form.if_field || '').trim() || null,
    phone: (form.phone || form.telephone || '').trim() || null,
    email: form.email?.trim() || null,
    address: (form.address || form.adresse || '').trim() || null,
    city: (form.city || form.ville || '').trim() || null,
    main_contact: (form.main_contact || form.contact || '').trim() || null,
    contact_role: form.contact_role?.trim() || null,
    contact_phone: form.contact_phone?.trim() || null,
    contact_email: form.contact_email?.trim() || null,
    supplier_category: (form.supplier_category || form.categorie || '').trim() || null,
    payment_terms: form.payment_terms?.trim() || null,
    preferred_payment_method: form.preferred_payment_method || form.mode_paiement || 'Virement',
    rib: form.rib?.trim() || null,
    bank: (form.bank || form.banque || '').trim() || null,
    status: statusToDb(form.status || form.statut || 'active'),
    notes: form.notes?.trim() || null,
  };
}

function toSupplierRowExtended(form) {
  return {
    trade_name: form.trade_name?.trim() || null,
    cnss: form.cnss?.trim() || null,
    region: form.region?.trim() || null,
    phone_secondary: form.phone_secondary?.trim() || null,
    whatsapp: form.whatsapp?.trim() || null,
    website: form.website?.trim() || null,
    products_services: form.products_services?.trim() || null,
    brands: form.brands?.trim() || null,
    delivery_zone: form.delivery_zone?.trim() || null,
    avg_delivery_delay: form.avg_delivery_delay?.trim() || null,
    min_order_amount: numOrNull(form.min_order_amount),
    delivery_available: boolField(form.delivery_available),
    installation_available: boolField(form.installation_available),
    sav_available: boolField(form.sav_available),
    is_recommended: boolField(form.is_recommended),
    rating_quality_price: ratingOrNull(form.rating_quality_price),
    rating_comment: form.rating_comment?.trim() || null,
  };
}

export function toSupplierRow(form, { includeExtended = true } = {}) {
  const base = toSupplierRowBase(form);
  if (!includeExtended) return base;
  return { ...base, ...toSupplierRowExtended(form) };
}

async function enrichSuppliersWithCategories(list) {
  if (!list?.length) return list || [];
  try {
    const links = await listCategoryLinksForSuppliers(list.map((s) => s.id));
    return attachCategoriesToSuppliers(list, links);
  } catch (err) {
    if (isMissingCategorySchema(err)) return list;
    console.warn('[CITYMO] enrichSuppliersWithCategories', err);
    return list;
  }
}

async function syncSupplierCategories(supplierId, form) {
  if (!supplierId) return;
  if (!('primary_category_id' in (form || {})) && !('secondary_category_ids' in (form || {}))) {
    return;
  }
  const primaryCategoryId = form.primary_category_id || null;
  const secondaryCategoryIds = Array.isArray(form.secondary_category_ids)
    ? form.secondary_category_ids
    : [];
  try {
    const { primaryName } = await setSupplierCategoryLinks(supplierId, {
      primaryCategoryId,
      secondaryCategoryIds,
    });
    const { error } = await getSupabase()
      .from(TABLE)
      .update({
        supplier_category: primaryName || form.supplier_category || null,
      })
      .eq('id', supplierId);
    if (error) throw error;
  } catch (err) {
    if (isMissingCategorySchema(err)) return;
    throw err;
  }
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

async function insertSupplierRow(row) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateSupplierRow(id, row) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Écrit champs étendus ; si colonnes absentes → retry sans casser l’existant. */
async function persistSupplier(form, { id, created_by } = {}) {
  const full = { ...toSupplierRow(form, { includeExtended: true }), ...(created_by ? { created_by } : {}) };
  try {
    return id ? await updateSupplierRow(id, full) : await insertSupplierRow(full);
  } catch (err) {
    if (!isMissingAnnuaireSchema(err)) throw err;
    const base = { ...toSupplierRow(form, { includeExtended: false }), ...(created_by ? { created_by } : {}) };
    return id ? await updateSupplierRow(id, base) : await insertSupplierRow(base);
  }
}

export async function listSuppliers({ includeArchived = true } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select('*')
    .order('company_name', { ascending: true });
  if (!includeArchived) {
    q = q.neq('status', 'archived');
  }
  const { data, error } = await q;
  if (error) throw error;
  const list = (data || []).map(normalizeSupplier);
  return enrichSuppliersWithCategories(list);
}

export async function getSupplierById(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const [enriched] = await enrichSuppliersWithCategories([normalizeSupplier(data)].filter(Boolean));
  return enriched || null;
}

export async function createSupplier(form) {
  const uid = await requireUser();
  const data = await persistSupplier(form, { created_by: uid });
  await syncSupplierCategories(data.id, form);
  const [enriched] = await enrichSuppliersWithCategories([normalizeSupplier(data)]);
  return enriched;
}

export async function updateSupplier(id, form) {
  await requireUser();
  const data = await persistSupplier(form, { id });
  await syncSupplierCategories(id, form);
  const [enriched] = await enrichSuppliersWithCategories([normalizeSupplier(data)]);
  return enriched;
}

export async function archiveSupplier(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ status: 'archived' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeSupplier(data);
}

export async function deleteSupplier(id) {
  return archiveSupplier(id);
}

export function exportSuppliersCsv(suppliers) {
  const headers = [
    'Société', 'Nom commercial', 'ICE', 'RC', 'IF', 'CNSS', 'Téléphone', 'Tél. 2', 'WhatsApp',
    'Email', 'Site web', 'Adresse', 'Ville', 'Région', 'Contact', 'Fonction',
    'Catégorie', 'Marques', 'Produits/services', 'Zone livraison', 'Délai livraison',
    'Délai paiement', 'Mode paiement', 'Min commande',     'Livraison', 'Installation', 'SAV',
    'Recommandé', 'Note qualité/prix', 'Commentaire note', 'RIB', 'Banque', 'Statut', 'Notes',
  ];
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const yn = (b) => (b ? 'Oui' : 'Non');
  const rows = (suppliers || []).map((s) => [
    s.company_name,
    s.trade_name,
    s.ice,
    s.rc,
    s.tax_id,
    s.cnss,
    s.phone,
    s.phone_secondary,
    s.whatsapp,
    s.email,
    s.website,
    s.address,
    s.city,
    s.region,
    s.main_contact,
    s.contact_role,
    s.supplier_category,
    s.brands,
    s.products_services,
    s.delivery_zone,
    s.avg_delivery_delay,
    s.payment_terms,
    s.preferred_payment_method,
    s.min_order_amount,
    yn(s.delivery_available),
    yn(s.installation_available),
    yn(s.sav_available),
    yn(s.is_recommended),
    s.rating_quality_price ?? '',
    s.rating_comment,
    s.rib,
    s.bank,
    s.statut,
    s.notes,
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fournisseurs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
