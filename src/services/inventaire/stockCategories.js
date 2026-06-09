/**
 * stockCategories.js — Catégories stock (Supabase stock_categories)
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const TABLE = 'stock_categories';
const ARTICLES_TABLE = 'stock_articles';

export function normalizeStockCategory(row) {
  if (!row) return null;
  const active = row.is_active !== false && row.is_active !== 'false';
  return {
    id: row.id,
    legacy_id: row.legacy_id ?? null,
    code: row.code || '',
    name: row.name || row.nom || '',
    nom: row.name || row.nom || '',
    description: row.description || '',
    department: row.department || 'LOGISTIQUE',
    stock_type: row.stock_type || 'OUTILLAGE',
    color: row.color || '',
    icon: row.icon || '',
    is_active: active,
    actif: active ? 'Oui' : 'Non',
    statut: active ? 'Actif' : 'Inactif',
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    articles_lies: Number(row.articles_lies) || 0,
    valeur_stock: Number(row.valeur_stock) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toStockCategoryRow(form) {
  const active = form.is_active !== false
    && form.is_active !== 'false'
    && form.actif !== 'Non';
  return {
    code: (form.code || '').trim().toUpperCase().replace(/\s+/g, '_'),
    name: (form.name || form.nom || '').trim(),
    nom: (form.name || form.nom || '').trim(),
    description: (form.description || '').trim() || null,
    department: (form.department || 'LOGISTIQUE').trim(),
    stock_type: (form.stock_type || 'OUTILLAGE').trim(),
    color: (form.color || '').trim() || null,
    icon: (form.icon || '').trim() || null,
    is_active: active,
    statut: active ? 'Active' : 'Inactive',
  };
}

async function attachArticleStats(categories) {
  if (!categories.length) return categories;
  const { data: articles, error } = await getSupabase()
    .from(ARTICLES_TABLE)
    .select('id, category_id, categorie, prix_unitaire');
  if (error) return categories;

  const counts = {};
  const values = {};
  (articles || []).forEach((a) => {
    const price = Number(a.prix_unitaire) || 0;
    let catId = a.category_id;
    if (!catId && a.categorie) {
      const match = categories.find(
        (c) => c.code.toLowerCase() === String(a.categorie).trim().toLowerCase()
          || c.name.toLowerCase() === String(a.categorie).trim().toLowerCase(),
      );
      if (match) catId = match.id;
    }
    if (!catId) return;
    counts[catId] = (counts[catId] || 0) + 1;
    values[catId] = (values[catId] || 0) + price;
  });

  return categories.map((cat) => ({
    ...cat,
    articles_lies: counts[cat.id] || 0,
    valeur_stock: values[cat.id] || 0,
  }));
}

export async function listStockCategories() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  const normalized = (data || []).map(normalizeStockCategory).filter(Boolean);
  return attachArticleStats(normalized);
}

export async function createStockCategory(form) {
  const uid = await requireSupabaseUserId();
  const row = toStockCategoryRow(form);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  const [withStats] = await attachArticleStats([normalizeStockCategory(data)]);
  return withStats;
}

export async function updateStockCategory(id, form) {
  await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toStockCategoryRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const [withStats] = await attachArticleStats([normalizeStockCategory(data)]);
  return withStats;
}

export async function setStockCategoryActive(id, isActive) {
  await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      is_active: Boolean(isActive),
      statut: isActive ? 'Active' : 'Inactive',
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeStockCategory(data);
}

export async function deleteStockCategory(id) {
  await requireSupabaseUserId();

  const { count: linkedById, error: byIdErr } = await getSupabase()
    .from(ARTICLES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  if (byIdErr) throw byIdErr;
  if (linkedById > 0) {
    throw new Error('Impossible de supprimer : des articles sont liés à cette catégorie. Désactivez-la plutôt.');
  }

  const { data: cat, error: catErr } = await getSupabase()
    .from(TABLE)
    .select('name, code')
    .eq('id', id)
    .single();
  if (catErr) throw catErr;

  if (cat?.name || cat?.code) {
    const filters = [];
    if (cat.name) filters.push(`categorie.ilike.${cat.name}`);
    if (cat.code) filters.push(`categorie.ilike.${cat.code}`);
    const { count: linkedByName, error: byNameErr } = await getSupabase()
      .from(ARTICLES_TABLE)
      .select('id', { count: 'exact', head: true })
      .or(filters.join(','));
    if (byNameErr) throw byNameErr;
    if (linkedByName > 0) {
      throw new Error('Impossible de supprimer : des articles référencent cette catégorie. Désactivez-la plutôt.');
    }
  }

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportStockCategoriesCsv(categories) {
  const headers = ['Référence', 'Code', 'Nom', 'Département', 'Type stock', 'Actif', 'Description', 'Articles liés', 'Valeur stock'];
  const rows = (categories || []).map((c) => [
    c.legacy_id ?? '',
    c.code,
    c.name,
    c.department,
    c.stock_type,
    c.actif,
    c.description,
    c.articles_lies,
    c.valeur_stock ? Number(c.valeur_stock).toFixed(2) : '0',
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `categories-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export « Excel » — CSV UTF-8 BOM (compatible Excel FR). */
export function exportStockCategoriesExcel(categories) {
  exportStockCategoriesCsv(categories);
}

export function exportStockCategoriesPdf(categories) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const title = 'CITYMO — Catégories stock';
    doc.setFontSize(14);
    doc.text(title, 14, 14);
    doc.setFontSize(9);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 20);

    let y = 28;
    const cols = ['Code', 'Nom', 'Dépt', 'Type', 'Actif', 'Art.'];
    doc.setFont(undefined, 'bold');
    doc.text(cols.join(' | '), 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    (categories || []).forEach((c) => {
      if (y > 190) {
        doc.addPage();
        y = 14;
      }
      const line = [
        c.code,
        (c.name || '').slice(0, 28),
        (c.department || '').slice(0, 12),
        (c.stock_type || '').slice(0, 12),
        c.actif,
        String(c.articles_lies || 0),
      ].join(' | ');
      doc.text(line, 14, y);
      y += 5;
    });

    doc.save(`categories-stock-${new Date().toISOString().slice(0, 10)}.pdf`);
  });
}
