/**
 * stockWarehouses.js — Dépôts stock (Supabase stock_warehouses)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'stock_warehouses';

export function normalizeStockWarehouse(row) {
  if (!row) return null;
  return {
    id: row.id,
    nom: row.nom || '',
    type_depot: row.type_depot || 'Depot',
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
