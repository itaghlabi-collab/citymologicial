/**
 * stockWarehouses.js — Emplacements / dépôts stock (Supabase stock_warehouses)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'stock_warehouses';

export const EMPLACEMENT_TYPES = ['Dépôt', 'Chantier', 'Atelier', 'SAV', 'Bureau', 'Autre'];

export function inferTypeFromNom(nom) {
  const n = (nom || '').toUpperCase();
  if (n.startsWith('DEPOT')) return 'Dépôt';
  if (n.startsWith('CHANTIER')) return 'Chantier';
  if (n.startsWith('ATELIER')) return 'Atelier';
  if (n.startsWith('SAV')) return 'SAV';
  if (n.startsWith('BUREAU')) return 'Bureau';
  return 'Autre';
}

export function normalizeStockWarehouse(row) {
  if (!row) return null;
  const typeDepot = row.type_depot || '';
  return {
    id: row.id,
    nom: row.nom || '',
    type_depot: typeDepot,
    type: EMPLACEMENT_TYPES.includes(typeDepot) ? typeDepot : inferTypeFromNom(row.nom),
    projet_lie: row.projet_lie || '',
    adresse: row.adresse || '',
    responsable: row.responsable || '',
    statut: row.statut || 'Actif',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listStockWarehouses() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('nom', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeStockWarehouse).filter(Boolean);
}

/** Insère les emplacements par défaut si la table est vide. */
export async function ensureStockWarehousesSeeded(seedNoms = []) {
  const existing = await listStockWarehouses().catch(() => []);
  if (existing.length) return existing;

  const names = [...new Set((seedNoms || []).map((n) => String(n).trim()).filter(Boolean))];
  if (!names.length) return [];

  const rows = names.map((nom) => ({
    nom,
    type_depot: inferTypeFromNom(nom),
  }));

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert(rows)
    .select('*');
  if (error) throw error;
  return (data || []).map(normalizeStockWarehouse).filter(Boolean);
}

export async function createStockWarehouse({ nom, type_depot, adresse, responsable, projet_lie }) {
  const label = (nom || '').trim();
  if (!label) throw new Error('Le nom de l\'emplacement est requis.');

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{
      nom: label,
      type_depot: type_depot || inferTypeFromNom(label),
      adresse: adresse?.trim() || null,
      responsable: responsable?.trim() || null,
      projet_lie: projet_lie?.trim() || null,
    }])
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Cet emplacement existe déjà.');
    throw error;
  }
  return normalizeStockWarehouse(data);
}

export async function deleteStockWarehouse(id) {
  if (!id) throw new Error('Emplacement introuvable.');
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
