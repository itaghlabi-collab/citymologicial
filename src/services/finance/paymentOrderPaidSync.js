/**
 * paymentOrderPaidSync.js — Alimentation Charges / Dépenses par projet quand un OP est payé
 */
import { getSupabase } from '../../lib/supabase';
import { upsertPurchaseProjectExpense, upsertProjectExpenseFromSource } from './projectExpenses';
import { normalizePaymentOrder } from './paymentOrders';

const PAID_STATUT = 'Payé';

function paymentDate(order) {
  return order.date_paiement || order.date || new Date().toISOString().slice(0, 10);
}

async function upsertOffProjectCharge(order) {
  const sb = getSupabase();
  const montant = Number(order.montant) || 0;
  if (!montant) return null;

  if (order.charge_id) {
    const { data: existing, error } = await sb
      .from('finance_charges')
      .select('*')
      .eq('id', order.charge_id)
      .maybeSingle();
    if (error) throw error;
    if (existing) {
      const { data, error: updErr } = await sb
        .from('finance_charges')
        .update({
          date_charge: paymentDate(order),
          libelle: order.motif || existing.libelle || `Paiement ${order.ref || order.beneficiaire}`,
          montant,
          fournisseur: order.fournisseur_lie || order.beneficiaire || existing.fournisseur,
          mode_paiement: order.mode_paiement || existing.mode_paiement,
          statut: 'Payé',
          ref_paiement: order.ref_reglement || order.ref || existing.ref_paiement,
          supplier_id: order.supplier_id || existing.supplier_id,
          category_id: order.category_id || existing.category_id,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (updErr) throw updErr;
      return { action: 'updated', charge: data };
    }
  }

  const { data: byRef, error: refErr } = await sb
    .from('finance_charges')
    .select('id')
    .eq('ref_paiement', order.ref || '')
    .not('ref_paiement', 'is', null)
    .neq('ref_paiement', '')
    .maybeSingle();
  if (refErr) throw refErr;

  const chargeRow = {
    date_charge: paymentDate(order),
    libelle: order.motif || `Paiement ${order.ref || order.beneficiaire}`,
    montant,
    fournisseur: order.fournisseur_lie || order.beneficiaire || null,
    mode_paiement: order.mode_paiement || 'Virement',
    statut: 'Payé',
    ref_paiement: order.ref_reglement || order.ref || null,
    commentaire: `Ordre de paiement ${order.ref || order.id}`,
    supplier_id: order.supplier_id || null,
    category_id: order.category_id || null,
    projet_lie: null,
    project_id: null,
  };

  if (byRef?.id) {
    const { data, error } = await sb
      .from('finance_charges')
      .update(chargeRow)
      .eq('id', byRef.id)
      .select()
      .single();
    if (error) throw error;
    if (!order.charge_id) {
      await sb.from('payment_orders').update({ charge_id: data.id }).eq('id', order.id);
    }
    return { action: 'updated', charge: data };
  }

  const uid = (await sb.auth.getUser()).data?.user?.id;
  const { data, error } = await sb
    .from('finance_charges')
    .insert([{ ...chargeRow, created_by: uid }])
    .select()
    .single();
  if (error) throw error;

  await sb.from('payment_orders').update({ charge_id: data.id }).eq('id', order.id);
  return { action: 'created', charge: data };
}

export async function syncPaymentOrderPaidOutcome(orderInput) {
  const order = normalizePaymentOrder(orderInput);
  if (!order?.id || order.statut !== PAID_STATUT) return null;

  if (order.project_id) {
    if (order.purchase_request_id) {
      return upsertPurchaseProjectExpense({
        project_id: order.project_id,
        purchase_request_id: order.purchase_request_id,
        purchase_acquisition_order_id: order.purchase_acquisition_order_id,
        payment_order_id: order.id,
        date_depense: paymentDate(order),
        date_paiement: paymentDate(order),
        categorie: "Demande d'achat",
        element_depense: order.motif,
        purchase_ref: order.purchase_request_ref,
        description: order.commentaire || order.observation,
        fournisseur: order.fournisseur_lie || order.beneficiaire,
        montant: Number(order.montant) || 0,
        montant_paye: Number(order.montant) || 0,
        op_statut: order.statut,
        mode_paiement: order.mode_paiement,
      });
    }
    return upsertProjectExpenseFromSource({
      project_id: order.project_id,
      date_depense: paymentDate(order),
      categorie: 'Ordre de paiement',
      element_depense: order.motif || order.ref || 'Ordre de paiement',
      description: order.commentaire || order.observation,
      fournisseur: order.fournisseur_lie || order.beneficiaire,
      montant: Number(order.montant) || 0,
      origine: 'ordre_paiement',
      source_type: 'payment_order',
      source_id: order.id,
      statut: 'valide',
      payment_order_id: order.id,
      mode_paiement: order.mode_paiement,
    });
  }

  return upsertOffProjectCharge(order);
}
