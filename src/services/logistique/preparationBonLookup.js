/**
 * preparationBonLookup.js — Lecture seule des bons de préparation pour la logistique.
 * Aucune écriture : pas de changement de statut, lignes, quantités ni stock.
 */
import { listSiteMaterialRequests, getSiteMaterialRequest } from '../inventaire/siteMaterialRequests';
import { isPreparationBon, decodeSourceEmplacement } from '../inventaire/siteRequestPreparation';
import { canAccessRoute } from '../admin/permissions';
import { linesFromBonSnapshot } from './pickupRequests';

function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function depotFromBon(bon) {
  const emps = (bon?.lines || []).map((l) => (
    l.emplacement_source || decodeSourceEmplacement(l.remarque, l.emplacement_source).emplacement
  )).filter(Boolean);
  return [...new Set(emps)].join(', ');
}

export function snapshotPreparationBon(bon) {
  if (!bon) return null;
  const lines = (bon.lines || []).map((l) => {
    const emp = l.emplacement_source || decodeSourceEmplacement(l.remarque, l.emplacement_source).emplacement;
    return {
      ...l,
      emplacement_source: emp,
    };
  });
  return {
    id: bon.id,
    ref: bon.ref || '',
    statut: bon.statut,
    statutLabel: bon.statutLabel || '',
    project_id: bon.project_id || null,
    project_ref: bon.project_ref || '',
    project_name: bon.project_name || '',
    destination: bon.project_name || bon.project_ref || '',
    depot_source: depotFromBon({ ...bon, lines }),
    date_souhaitee: bon.date_souhaitee || '',
    observation: bon.observation || '',
    lines,
  };
}

export async function canLookupPreparationBons(user) {
  if (!user) return false;
  try {
    return await canAccessRoute(user, 'demandes-chantier');
  } catch {
    return false;
  }
}

export async function searchPreparationBons(query = '') {
  const rows = await listSiteMaterialRequests();
  const bons = (rows || []).filter((r) => isPreparationBon(r));
  const q = normalizeSearch(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  const matched = !q ? bons : bons.filter((b) => {
    const hay = normalizeSearch([b.ref, b.project_ref, b.project_name, b.client_name].join(' '));
    return tokens.every((t) => hay.includes(t));
  });
  return matched.map(snapshotPreparationBon);
}

export async function getPreparationBonSnapshot(id) {
  const bon = await getSiteMaterialRequest(id);
  if (!bon || !isPreparationBon(bon)) return null;
  return snapshotPreparationBon(bon);
}

export function pickupFormFromBon(snapshot) {
  if (!snapshot) return {};
  return {
    bon_id: snapshot.id,
    bon_ref: snapshot.ref,
    bon_snapshot: snapshot,
    lines: linesFromBonSnapshot(snapshot),
  };
}
