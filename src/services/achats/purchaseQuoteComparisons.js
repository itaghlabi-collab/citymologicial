/**
 * purchaseQuoteComparisons.js — Comparaison de devis (Supabase)
 */
import { getSupabase } from '../../lib/supabase';
import { listProjects } from '../projects/projects';
import { listSuppliers } from './suppliers';
import { projectOptionLabel } from './purchaseRequests';

const TABLE = 'purchase_quote_comparisons';

function lineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const EMPTY_LINE = () => ({
  id: lineId(),
  supplier_id: '',
  fournisseur: '',
  supplier_name: '',
  montant: '',
  delai: '',
  validite: '',
  observations: '',
  selectionne: false,
});

export function computeBestPriceLine(lignes) {
  return (lignes || []).reduce((best, l) => {
    const amount = Number(l.montant);
    if (!amount || Number.isNaN(amount)) return best;
    if (!best || amount < Number(best.montant)) return l;
    return best;
  }, null);
}

function normalizeLines(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  if (!arr.length) return [EMPTY_LINE()];
  return arr.map((l) => ({
    id: l.id || lineId(),
    supplier_id: l.supplier_id || '',
    fournisseur: l.fournisseur || l.supplier_name || '',
    supplier_name: l.supplier_name || l.fournisseur || '',
    montant: l.montant ?? l.amount ?? '',
    delai: l.delai || l.delivery_delay || '',
    validite: l.validite || l.offer_validity || '',
    observations: l.observations || '',
    selectionne: Boolean(l.selectionne ?? l.selected),
  }));
}

export function normalizeQuoteComparison(row) {
  if (!row) return null;
  const lignes = normalizeLines(row.lines);
  const projectLabel = row.project_ref && row.project_name
    ? projectOptionLabel({ ref: row.project_ref, nom: row.project_name, client: '' })
    : row.project_name || row.project_ref || '';
  const best = computeBestPriceLine(lignes);
  const selected = lignes.find((l) => l.selectionne);

  return {
    id: row.id,
    ref: row.ref_comparison || '',
    ref_comparison: row.ref_comparison || '',
    titre: row.title || '',
    title: row.title || '',
    project_id: row.project_id || null,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    projet_lie: projectLabel,
    categorie_achat: row.purchase_category || '',
    purchase_category: row.purchase_category || '',
    description: row.description || '',
    statut: row.status || 'En cours',
    status: row.status || 'En cours',
    lignes,
    lines: lignes,
    selected_supplier_id: row.selected_supplier_id || selected?.supplier_id || null,
    selected_supplier_name: row.selected_supplier_name || selected?.fournisseur || '',
    best_price: row.best_price != null ? Number(row.best_price) : (best ? Number(best.montant) : null),
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toQuoteComparisonRow(form) {
  const lignes = normalizeLines(form.lignes || form.lines);
  const selected = lignes.find((l) => l.selectionne);
  const best = computeBestPriceLine(lignes);

  return {
    ref_comparison: form.ref || form.ref_comparison || null,
    title: (form.titre || form.title || '').trim(),
    project_id: form.project_id || null,
    project_ref: form.project_ref || null,
    project_name: form.project_name || null,
    purchase_category: form.categorie_achat || form.purchase_category || null,
    description: form.description?.trim() || null,
    status: form.statut || form.status || 'En cours',
    selected_supplier_id: selected?.supplier_id || null,
    selected_supplier_name: selected?.fournisseur || selected?.supplier_name || null,
    best_price: best ? Number(best.montant) : null,
    lines: lignes.map((l) => ({
      id: l.id,
      supplier_id: l.supplier_id || null,
      supplier_name: (l.fournisseur || l.supplier_name || '').trim(),
      amount: l.montant === '' || l.montant == null ? null : Number(l.montant),
      delivery_delay: l.delai || null,
      offer_validity: l.validite || null,
      observations: l.observations || null,
      selected: Boolean(l.selectionne),
    })),
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function generateQuoteComparisonRef() {
  const year = new Date().getFullYear();
  const prefix = `COMP-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_comparison', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

export async function listQuoteComparisons() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeQuoteComparison);
}

export async function createQuoteComparison(form) {
  const uid = await requireUser();
  const row = toQuoteComparisonRow(form);
  if (!row.ref_comparison) row.ref_comparison = await generateQuoteComparisonRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizeQuoteComparison(data);
}

export async function updateQuoteComparison(id, form) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toQuoteComparisonRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeQuoteComparison(data);
}

export async function deleteQuoteComparison(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function loadQuoteComparisonFormOptions() {
  const [projects, suppliers] = await Promise.all([
    listProjects().catch(() => []),
    listSuppliers({ includeArchived: false }).catch(() => []),
  ]);
  return {
    projects,
    suppliers: suppliers.filter((s) => s.statut === 'Actif' || s.status === 'active'),
  };
}

export function exportQuoteComparisonsCsv(comparisons) {
  const headers = [
    'Référence', 'Titre', 'Projet', 'Catégorie', 'Statut',
    'Nb devis', 'Meilleur prix', 'Fournisseur retenu', 'Date création',
  ];
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = (comparisons || []).map((c) => {
    const nb = (c.lignes || []).filter((l) => l.fournisseur).length;
    const selected = (c.lignes || []).find((l) => l.selectionne);
    return [
      c.ref,
      c.titre,
      c.projet_lie || c.project_ref,
      c.categorie_achat,
      c.statut,
      nb,
      c.best_price ?? '',
      selected?.fournisseur || c.selected_supplier_name || '',
      c.date_creation,
    ];
  });
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `comparaison-devis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export { EMPTY_LINE };
