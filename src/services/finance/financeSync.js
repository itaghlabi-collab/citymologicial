/**
 * financeSync.js — Journal caisse central : syncFinanceTransaction(sourceType, sourceId)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'finance_transactions';

export const FINANCE_SOURCE_TYPES = {
  WORKER_WEEKLY_PAYMENT: 'worker_weekly_payment',
  SUBCONTRACTOR_PAYMENT: 'subcontractor_payment',
  CHARGE: 'charge',
  PAYMENT_ORDER: 'payment_order',
  CUSTOMER_INVOICE_PAYMENT: 'customer_invoice_payment',
  CASH_FUNDING: 'cash_funding',
};

export const SOURCE_TYPE_LABELS = {
  worker_weekly_payment: 'Auto — paiement ouvrier',
  subcontractor_payment: 'Auto — sous-traitant',
  charge: 'Auto — charge',
  payment_order: 'Auto — ordre paiement',
  customer_invoice_payment: 'Auto — facture client',
  cash_funding: 'Manuel — alimentation caisse',
};

export const SOURCE_MODULE_LABELS = {
  worker_weekly_payment: 'Paiement hebdomadaire',
  subcontractor_payment: 'Paiement sous-traitants',
  charge: 'Charges',
  payment_order: 'Ordres de paiement',
  customer_invoice_payment: 'Factures clients',
};

const PAID_CHARGE_STATUTS = ['Payé', 'Validé', 'Validée', 'Comptabilisée'];
const PAID_ORDER_STATUTS = ['Payé', 'Exécuté', 'Comptabilisé'];
const PAID_PAYROLL_STATUTS = ['Payé', 'Paye'];
const PAID_SUBCONTRACTOR_STATUTS = ['paid', 'Payé'];

function fmtWeekRangeLocal(debut, fin) {
  const d = debut ? new Date(`${debut}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  const f = fin ? new Date(`${fin}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  return `${d} - ${f}`;
}

function mapPaymentMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (m.includes('espece') || m === 'cash' || m === 'espèces') return 'Espèces';
  if (m.includes('virement') || m.includes('transfer')) return 'Virement';
  if (m.includes('cheque') || m.includes('chèque')) return 'Chèque';
  if (m.includes('carte')) return 'Carte bancaire';
  return mode?.trim() || 'Espèces';
}

function isSourceActive(sourceType, entity) {
  if (!entity) return false;
  switch (sourceType) {
    case FINANCE_SOURCE_TYPES.CHARGE:
      return PAID_CHARGE_STATUTS.includes(entity.statut);
    case FINANCE_SOURCE_TYPES.PAYMENT_ORDER:
      return PAID_ORDER_STATUTS.includes(entity.statut);
    case FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT:
      return PAID_PAYROLL_STATUTS.includes(entity.statut);
    case FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT:
      return PAID_SUBCONTRACTOR_STATUTS.includes(entity.status);
    case FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT:
      return Number(entity.montant) > 0;
    default:
      return false;
  }
}

function buildTransactionRow(sourceType, entity) {
  switch (sourceType) {
    case FINANCE_SOURCE_TYPES.CHARGE:
      return {
        date_operation: entity.date || entity.date_charge,
        sens: 'sortie',
        type_operation: 'charge',
        contrepartie: entity.fournisseur || '',
        description: entity.libelle || 'Charge',
        montant: Number(entity.montant) || 0,
        mode_paiement: mapPaymentMode(entity.mode_paiement),
        category_id: entity.category_id || null,
        project_id: entity.project_id || null,
        vehicle_id: entity.vehicle_id || null,
        worker_id: entity.worker_id || null,
        client_id: entity.client_id || null,
        charge_id: entity.id,
        payment_order_id: null,
        invoice_id: null,
        ref_operation: entity.ref || entity.ref_charge || null,
        source_module: 'finance',
      };
    case FINANCE_SOURCE_TYPES.PAYMENT_ORDER:
      return {
        date_operation: entity.date || entity.date_ordre || entity.date_prevue,
        sens: 'sortie',
        type_operation: 'ordre_paiement',
        contrepartie: entity.beneficiaire || '',
        description: entity.motif || `Ordre ${entity.ref || ''}`.trim(),
        montant: Number(entity.montant) || 0,
        mode_paiement: mapPaymentMode(entity.mode_paiement),
        category_id: entity.category_id || null,
        project_id: entity.project_id || null,
        worker_id: entity.worker_id || null,
        client_id: entity.client_id || null,
        charge_id: entity.charge_id || null,
        payment_order_id: entity.id,
        invoice_id: null,
        ref_operation: entity.ref || entity.ref_ordre || null,
        source_module: 'finance',
      };
    case FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT:
      return {
        date_operation: entity.paymentDate || entity.semaineDebut || new Date().toISOString().slice(0, 10),
        sens: 'sortie',
        type_operation: 'autre_sortie',
        contrepartie: entity.ouvrier || '',
        description: `Paiement ouvrier — ${entity.projet || 'Chantier'} (${fmtWeekRangeLocal(entity.semaineDebut, entity.semaineFin)})`,
        montant: Number(entity.total) || 0,
        mode_paiement: mapPaymentMode(entity.paymentMethod),
        project_id: entity.projectId || null,
        worker_id: entity.workerId || null,
        ref_operation: entity.reference || null,
        source_module: 'rh',
      };
    case FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT:
      return {
        date_operation: entity.paymentDate || new Date().toISOString().slice(0, 10),
        sens: 'sortie',
        type_operation: 'autre_sortie',
        contrepartie: entity.subcontractorName || entity.contrepartie || 'Sous-traitant',
        description: entity.description || entity.designation || `Paiement sous-traitant — ${entity.projectName || ''}`.trim(),
        montant: Number(entity.amount) || 0,
        mode_paiement: mapPaymentMode(entity.paymentMethod),
        project_id: entity.projectId || null,
        ref_operation: entity.reference || null,
        source_module: 'rh',
      };
    case FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT:
      return {
        date_operation: entity.date || entity.date_paiement || new Date().toISOString().slice(0, 10),
        sens: 'entree',
        type_operation: 'reglement_client',
        contrepartie: entity.clientNom || entity.client_nom || '',
        description: `Règlement facture ${entity.factureNumero || entity.numero || ''}`.trim(),
        montant: Number(entity.montant) || 0,
        mode_paiement: mapPaymentMode(entity.mode),
        client_id: entity.clientId || entity.client_id || null,
        invoice_id: entity.factureId || entity.facture_id || null,
        ref_operation: entity.reference || null,
        source_module: 'crm',
      };
    default:
      return null;
  }
}

async function findExistingTransaction(sourceType, sourceId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Sync idempotent : créer / mettre à jour / annuler selon l'état source. */
export async function syncFinanceTransaction(sourceType, sourceId, options = {}) {
  if (!sourceType || !sourceId) return null;
  const entity = options.entity;
  if (!entity) {
    console.warn('[CITYMO] syncFinanceTransaction: entity requis', sourceType, sourceId);
    return null;
  }

  const active = options.active ?? isSourceActive(sourceType, entity);
  const existing = await findExistingTransaction(sourceType, sourceId);
  const now = new Date().toISOString();

  if (!active) {
    if (existing?.id) {
      await getSupabase()
        .from(TABLE)
        .update({
          statut: 'Annulé',
          validation_status: 'cancelled',
          synced_at: now,
        })
        .eq('id', existing.id);
    }
    return { action: 'cancelled', id: existing?.id || null };
  }

  const built = buildTransactionRow(sourceType, entity);
  if (!built || !built.montant) return null;

  const row = {
    ...built,
    source_type: sourceType,
    source_id: sourceId,
    is_auto_generated: true,
    validation_status: 'pending',
    synced_at: now,
    statut: 'Validé',
  };

  if (existing?.id) {
    const { error } = await getSupabase()
      .from(TABLE)
      .update(row)
      .eq('id', existing.id);
    if (error) throw error;
    return { action: 'updated', id: existing.id };
  }

  const uid = (await getSupabase().auth.getUser()).data?.user?.id;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return { action: 'created', id: data.id };
}

/** Synchronise tous les paiements d'une facture CRM. */
export async function syncFacturePaymentsToCash(facture) {
  if (!facture?.id) return;
  const factureId = facture.id;
  const paiements = facture.paiements || [];
  const activeIds = new Set(paiements.filter((p) => p.id && Number(p.montant) > 0).map((p) => p.id));

  const { data: existing } = await getSupabase()
    .from(TABLE)
    .select('id, source_id')
    .eq('source_type', FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT)
    .eq('invoice_id', factureId);

  for (const ex of existing || []) {
    if (!activeIds.has(ex.source_id)) {
      await syncFinanceTransaction(
        FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT,
        ex.source_id,
        { entity: { montant: 0 }, active: false },
      );
    }
  }

  for (const p of paiements) {
    if (!p.id || Number(p.montant) <= 0) continue;
    await syncFinanceTransaction(
      FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT,
      p.id,
      {
        entity: {
          ...p,
          factureId,
          facture_id: factureId,
          factureNumero: facture.numero,
          numero: facture.numero,
          clientId: facture.client_id,
          client_id: facture.client_id,
          clientNom: facture.client_nom,
        },
      },
    );
  }
}

export function isAutoGeneratedTransaction(tx) {
  if (!tx) return false;
  return Boolean(
    tx.is_auto_generated
    || tx.source_type
    || tx.charge_id
    || tx.payment_order_id,
  );
}

export function getSourceBadgeLabel(tx) {
  if (!tx) return '';
  if (tx.source_type && SOURCE_TYPE_LABELS[tx.source_type]) {
    return SOURCE_TYPE_LABELS[tx.source_type];
  }
  if (tx.charge_id) return SOURCE_TYPE_LABELS.charge;
  if (tx.payment_order_id) return SOURCE_TYPE_LABELS.payment_order;
  if (tx.type_operation === 'alimentation_caisse') return SOURCE_TYPE_LABELS.cash_funding;
  return 'Manuel';
}

export function getSourceModuleMessage(tx) {
  const mod = tx?.source_type || (tx?.charge_id ? 'charge' : tx?.payment_order_id ? 'payment_order' : null);
  const label = SOURCE_MODULE_LABELS[mod];
  if (!label) return 'Cette opération est liée à un autre module. Modifiez-la depuis son module d\'origine.';
  return `Cette opération vient du module « ${label} ». Modifiez-la depuis son module d'origine.`;
}
