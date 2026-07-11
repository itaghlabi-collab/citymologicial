/**
 * POST /api/finance/backfill-project-expenses
 * Rattrapage idempotent : affecte aux projets les dépenses manquantes depuis une date.
 * Body optionnel : { since: "2026-07-01", dryRun: false }
 */
import { verifySupabaseAccessTokenVercel } from '../../lib/verifySupabaseTokenVercel.mjs';
import { getSupabaseAdmin } from '../../lib/supabaseAdminVercel.mjs';
import {
  buildProjectIndexes,
  chargeMatchesSince,
  chargeProjectExpenseRow,
  isChargeEligibleForBackfill,
  orderMatchesSince,
  paymentOrderProjectExpenseRow,
  resolveChargeProject,
  sourceKey,
  upsertProjectExpenseRow,
  OP_LIVE_STATUT,
  SKIP_CHARGE_STATUTS,
} from '../../lib/financeProjectExpenseSync.mjs';

export const config = { maxDuration: 120 };

const DEFAULT_SINCE = '2026-07-01';

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

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const since = String(body.since || DEFAULT_SINCE).slice(0, 10);
    const dryRun = body.dryRun === true;

    const [
      { data: projects },
      { data: charges, error: chargesErr },
      { data: orders, error: ordersErr },
      { data: existingExpenses, error: expErr },
    ] = await Promise.all([
      admin.from('projects').select('id, ref, nom'),
      admin
        .from('finance_charges')
        .select('id, project_id, projet_lie, date_charge, libelle, categorie, fournisseur, montant, mode_paiement, statut, ref_charge, commentaire, created_at')
        .or('project_id.not.is.null,projet_lie.not.is.null'),
      admin
        .from('payment_orders')
        .select('id, project_id, purchase_request_id, purchase_acquisition_order_id, date_ordre, date_paiement, motif, ref_ordre, commentaire, observation, fournisseur_lie, beneficiaire, montant, montant_ttc, mode_paiement, statut, created_at')
        .eq('statut', OP_LIVE_STATUT)
        .not('project_id', 'is', null),
      admin
        .from('project_expenses')
        .select('id, source_type, source_id, project_id, montant, element_depense')
        .not('source_type', 'is', null)
        .not('source_id', 'is', null),
    ]);

    if (chargesErr) return res.status(500).json({ error: chargesErr.message });
    if (ordersErr) return res.status(500).json({ error: ordersErr.message });
    if (expErr) return res.status(500).json({ error: expErr.message });

    const indexes = buildProjectIndexes(projects || []);
    const existingKeys = new Set(
      (existingExpenses || []).map((e) => sourceKey(e.source_type, e.source_id)),
    );

    const report = {
      since,
      dryRun,
      analyzed: { charges: 0, orders: 0, alreadyLinked: 0 },
      missing: { charges: [], orders: [] },
      unresolved: [],
      stats: { created: 0, updated: 0, skipped: 0, errors: 0 },
    };

    for (const charge of charges || []) {
      if (!chargeMatchesSince(charge, since)) continue;
      if (!isChargeEligibleForBackfill(charge)) {
        report.stats.skipped++;
        continue;
      }
      if (!charge.project_id && !String(charge.projet_lie || '').trim()) {
        report.stats.skipped++;
        continue;
      }

      report.analyzed.charges++;
      const key = sourceKey('finance_charge', charge.id);
      if (existingKeys.has(key)) {
        report.analyzed.alreadyLinked++;
        continue;
      }

      const project = resolveChargeProject(charge, indexes);
      if (!project?.id) {
        report.unresolved.push({
          type: 'finance_charge',
          id: charge.id,
          ref: charge.ref_charge,
          libelle: charge.libelle,
          projet_lie: charge.projet_lie,
        });
        report.stats.skipped++;
        continue;
      }

      report.missing.charges.push({
        id: charge.id,
        ref: charge.ref_charge,
        libelle: charge.libelle,
        montant: charge.montant,
        statut: charge.statut,
        project_id: project.id,
        project_ref: projects.find((p) => String(p.id) === String(project.id))?.ref || null,
      });

      if (dryRun) continue;

      const row = chargeProjectExpenseRow(charge, project.id, { backfill: true });
      const result = await upsertProjectExpenseRow(admin, row);
      if (result.action === 'created') {
        report.stats.created++;
        existingKeys.add(key);
      } else if (result.action === 'updated') {
        report.stats.updated++;
        existingKeys.add(key);
      } else {
        report.stats.errors++;
      }
    }

    for (const order of orders || []) {
      if (!orderMatchesSince(order, since)) continue;
      if (String(order.statut || '').trim() !== OP_LIVE_STATUT) {
        report.stats.skipped++;
        continue;
      }

      report.analyzed.orders++;
      const hasPurchase = Boolean(order.purchase_request_id);
      const key = sourceKey(
        hasPurchase ? 'purchase_request' : 'payment_order',
        hasPurchase ? order.purchase_request_id : order.id,
      );
      if (existingKeys.has(key)) {
        report.analyzed.alreadyLinked++;
        continue;
      }

      report.missing.orders.push({
        id: order.id,
        ref: order.ref_ordre,
        motif: order.motif,
        montant: order.montant_ttc ?? order.montant,
        project_id: order.project_id,
      });

      if (dryRun) continue;

      const row = paymentOrderProjectExpenseRow(order);
      const result = await upsertProjectExpenseRow(admin, row);
      if (result.action === 'created') {
        report.stats.created++;
        existingKeys.add(key);
      } else if (result.action === 'updated') {
        report.stats.updated++;
        existingKeys.add(key);
      } else {
        report.stats.errors++;
      }
    }

    report.missingCount = report.missing.charges.length + report.missing.orders.length;

    return res.status(200).json({ ok: true, ...report });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}
