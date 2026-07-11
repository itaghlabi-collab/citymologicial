/**
 * POST /api/finance/sync-charges-to-projects — Alimente project_expenses depuis finance_charges (service_role).
 */
import { verifySupabaseAccessTokenVercel } from '../../lib/verifySupabaseTokenVercel.mjs';
import { getSupabaseAdmin } from '../../lib/supabaseAdminVercel.mjs';

export const config = { maxDuration: 60 };

const SKIP_STATUTS = ['Annulé', 'Refusé', 'Refusée', 'Brouillon'];
const CHARGE_SYNC_STATUT = 'Payé';
const OP_SYNC_STATUT = 'Payé';

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProjectIndexes(projects) {
  const projectById = Object.fromEntries((projects || []).map((p) => [String(p.id), p]));
  const projectByName = {};
  const projectByRef = {};
  (projects || []).forEach((p) => {
    projectByName[normalizeName(p.nom)] = p;
    if (p.ref) projectByRef[p.ref] = p;
  });
  return { projectById, projectByName, projectByRef };
}

function resolveChargeProject(charge, indexes) {
  const { projectById, projectByName, projectByRef } = indexes;
  if (charge.project_id) {
    const id = String(charge.project_id);
    return projectById[id] || { id };
  }
  const label = String(charge.projet_lie || '').trim();
  if (!label) return null;
  const refPart = label.split(' — ')[0]?.trim();
  if (refPart && projectByRef[refPart]) return projectByRef[refPart];
  const nomPart = label.split(' — ')[1]?.trim() || label;
  return projectByName[normalizeName(nomPart)] || projectByName[normalizeName(label)] || null;
}

function chargeRow(charge, projectId) {
  return {
    project_id: projectId,
    project_match_status: 'matched',
    date_depense: charge.date_charge,
    categorie: charge.categorie,
    element_depense: charge.libelle || charge.categorie || 'Charge',
    description: charge.commentaire,
    fournisseur: charge.fournisseur,
    montant: Number(charge.montant) || 0,
    observation: charge.ref_charge ? `Réf. ${charge.ref_charge}` : null,
    origine: 'charge_manuelle',
    source_type: 'finance_charge',
    source_id: charge.id,
    statut: 'payee',
    mode_paiement: charge.mode_paiement,
    montant_paye: Number(charge.montant) || 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Session requise.' });
  }

  try {
    const clientApiKey = req.headers.apikey || req.headers.Apikey || '';
    const user = await verifySupabaseAccessTokenVercel(token, clientApiKey);
    if (!user?.id) {
      return res.status(401).json({ error: 'Session invalide.' });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('statut')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.statut && String(profile.statut).toLowerCase() !== 'actif') {
      return res.status(403).json({ error: 'Compte désactivé.' });
    }

    const [{ data: projects }, { data: charges, error: chargesErr }] = await Promise.all([
      admin.from('projects').select('id, ref, nom'),
      admin
        .from('finance_charges')
        .select('id, project_id, projet_lie, date_charge, libelle, categorie, fournisseur, montant, mode_paiement, statut, ref_charge, commentaire')
        .eq('statut', CHARGE_SYNC_STATUT)
        .or('project_id.not.is.null,projet_lie.not.is.null'),
    ]);

    if (chargesErr) {
      return res.status(500).json({ error: chargesErr.message });
    }

    const indexes = buildProjectIndexes(projects || []);
    const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

    for (const charge of charges || []) {
      if (charge.statut !== CHARGE_SYNC_STATUT) {
        stats.skipped++;
        continue;
      }
      const project = resolveChargeProject(charge, indexes);
      if (!project?.id) {
        stats.skipped++;
        continue;
      }

      const row = chargeRow(charge, project.id);
      const { data: existing } = await admin
        .from('project_expenses')
        .select('id')
        .eq('source_type', 'finance_charge')
        .eq('source_id', charge.id)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await admin.from('project_expenses').update(row).eq('id', existing.id);
        if (error) stats.errors++;
        else stats.updated++;
      } else {
        const { error } = await admin.from('project_expenses').insert(row);
        if (error) stats.errors++;
        else stats.created++;
      }
    }

    return res.status(200).json({ ok: true, stats });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}
