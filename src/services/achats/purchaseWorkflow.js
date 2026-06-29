/**
 * purchaseWorkflow.js — Orchestration workflow demandes d'achat
 */
import { getSupabase } from '../../lib/supabase';
import { PURCHASE_ASSIGNEE, normalizePurchaseStatus } from '../../constants/purchaseWorkflow';
import { appendPurchaseRequestHistory } from './purchaseRequestHistory';
import {
  createPurchaseRequestQuote,
  listQuotesForRequest,
  lockOtherQuotes,
} from './purchaseRequestQuotes';
import { createAcquisitionOrderFromQuote } from './purchaseAcquisitionOrders';
import { createPaymentOrder } from '../finance/paymentOrders';
import { normalizePurchaseRequest, toPurchaseRequestRow, generatePurchaseRequestRef } from './purchaseRequests';
import {
  notifyPurchaseRequestSubmitted,
  notifyPurchaseQuoteAdded,
  notifyPurchaseReadyForDg,
  notifyPurchaseSupplierValidated,
  notifyPurchaseReceived,
} from '../notifications/purchaseWorkflowNotifications';

const TABLE = 'purchase_requests';

async function getAuthContext() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';
  return { user, userName: name };
}

async function fetchRequest(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

async function patchRequest(id, patch, historyAction, historyDetail, ctx) {
  const { user, userName } = ctx || await getAuthContext();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (historyAction) {
    await appendPurchaseRequestHistory({
      purchaseRequestId: id,
      action: historyAction,
      detail: historyDetail || '',
      userId: user.id,
      userName,
    });
  }
  return normalizePurchaseRequest(data);
}

export async function resolveAchatsAssignee() {
  const { data } = await getSupabase()
    .from('employees')
    .select('id, firstname, lastname, poste')
    .or('lastname.ilike.%WOTFI%,firstname.ilike.%LAILA%')
    .limit(5);
  const match = (data || []).find((e) => {
    const n = `${e.firstname || ''} ${e.lastname || ''}`.toUpperCase();
    return n.includes('LAILA') && n.includes('WOTFI');
  });
  return {
    assigned_employee_id: match?.id || null,
    assigned_employee_name: PURCHASE_ASSIGNEE.label,
  };
}

export async function createPurchaseRequestWorkflow(form) {
  const ctx = await getAuthContext();
  const assignee = await resolveAchatsAssignee();
  const row = {
    ...toPurchaseRequestRow({
      ...form,
      statut: 'Brouillon',
      department: 'ACHATS',
    }),
    requester_user_id: ctx.user.id,
    requester_name: ctx.userName,
    ...assignee,
    commentaires_internes: form.commentaires_internes || null,
  };
  if (!row.project_id) {
    const err = new Error('Le projet lié est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.ref_demande) row.ref_demande = await generatePurchaseRequestRef();

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: ctx.user.id }])
    .select()
    .single();
  if (error) throw error;

  const request = normalizePurchaseRequest(data);
  await appendPurchaseRequestHistory({
    purchaseRequestId: request.id,
    action: 'Création',
    detail: `Demande ${request.ref} créée`,
    userId: ctx.user.id,
    userName: ctx.userName,
  });
  return request;
}

export async function updatePurchaseRequestDraft(id, form) {
  const ctx = await getAuthContext();
  const existing = await fetchRequest(id);
  if (normalizePurchaseStatus(existing.statut) !== 'Brouillon') {
    const err = new Error('Seules les demandes en brouillon peuvent être modifiées.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!form.project_id) {
    const err = new Error('Le projet lié est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  const assignee = await resolveAchatsAssignee();
  const patch = {
    ...toPurchaseRequestRow({ ...form, statut: 'Brouillon' }),
    ...assignee,
    commentaires_internes: form.commentaires_internes ?? existing.commentaires_internes,
  };
  return patchRequest(id, patch, 'Modification', 'Demande modifiée', ctx);
}

export async function submitPurchaseRequest(id) {
  const ctx = await getAuthContext();
  const existing = await fetchRequest(id);
  if (normalizePurchaseStatus(existing.statut) !== 'Brouillon') {
    const err = new Error('Seules les demandes en brouillon peuvent être soumises.');
    err.code = 'VALIDATION';
    throw err;
  }
  const request = await patchRequest(id, { statut: 'En étude Achats' }, 'Soumission', 'Demande soumise — prise en charge Achats', ctx);
  await notifyPurchaseRequestSubmitted(request);
  return request;
}

export async function addQuoteToRequest(id, quoteForm) {
  const ctx = await getAuthContext();
  const existing = await fetchRequest(id);
  const statut = normalizePurchaseStatus(existing.statut);
  if (!['Soumise', 'En étude Achats', 'Devis reçus', 'En validation DG'].includes(statut)) {
    const err = new Error('Impossible d\'ajouter un devis à ce stade.');
    err.code = 'VALIDATION';
    throw err;
  }
  const quote = await createPurchaseRequestQuote(id, quoteForm);
  const nextStatus = ['Soumise', 'En étude Achats'].includes(statut) ? 'Devis reçus' : statut;
  const request = await patchRequest(
    id,
    { statut: nextStatus },
    'Ajout devis',
    `Devis ${quote.supplier_name} — ${quote.montant_ttc.toLocaleString('fr-FR')} MAD TTC`,
    ctx,
  );
  await notifyPurchaseQuoteAdded(request);
  return { request, quote };
}

export async function sendRequestToDgValidation(id) {
  const ctx = await getAuthContext();
  const quotes = await listQuotesForRequest(id);
  if (!quotes.length) {
    const err = new Error('Ajoutez au moins un devis avant l\'envoi au DG.');
    err.code = 'VALIDATION';
    throw err;
  }
  const request = await patchRequest(id, { statut: 'En validation DG' }, 'Envoi validation DG', `${quotes.length} devis à comparer`, ctx);
  await notifyPurchaseReadyForDg(request);
  return request;
}

export async function validateSupplierQuote(requestId, quoteId) {
  const ctx = await getAuthContext();
  const request = await fetchRequest(requestId);
  const quotes = await listQuotesForRequest(requestId);
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote) {
    const err = new Error('Devis introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }

  await lockOtherQuotes(requestId, quoteId);

  const oa = await createAcquisitionOrderFromQuote({ request, quote, userId: ctx.user.id });

  const op = await createPaymentOrder({
    ref: null,
    beneficiaire: quote.supplier_name,
    type_benef: 'Fournisseur',
    fournisseur_lie: quote.supplier_name,
    montant: quote.montant_ttc,
    date: new Date().toISOString().slice(0, 10),
    date_prevue: new Date().toISOString().slice(0, 10),
    statut: 'En attente',
    mode_paiement: 'Virement',
    motif: `Achat — ${request.ref} — ${request.titre}`,
    commentaire: `OA ${oa.ref} — Demande ${request.ref}`,
    project_id: request.project_id,
    supplier_id: quote.supplier_id,
    purchase_request_id: requestId,
    purchase_acquisition_order_id: oa.id,
  });

  const updated = await patchRequest(
    requestId,
    {
      statut: 'Ordre d\'achat créé',
      selected_quote_id: quoteId,
      acquisition_order_id: oa.id,
      payment_order_id: op.id,
    },
    'Validation fournisseur',
    `Fournisseur retenu : ${quote.supplier_name} — OA ${oa.ref} — OP ${op.ref}`,
    ctx,
  );

  await appendPurchaseRequestHistory({
    purchaseRequestId: requestId,
    action: 'Création OA',
    detail: oa.ref,
    userId: ctx.user.id,
    userName: ctx.userName,
  });
  await appendPurchaseRequestHistory({
    purchaseRequestId: requestId,
    action: 'Création OP',
    detail: op.ref,
    userId: ctx.user.id,
    userName: ctx.userName,
  });

  await notifyPurchaseSupplierValidated(updated, { quote, oa, op });
  return { request: updated, quote, oa, op };
}

export async function markPurchaseCommandInProgress(id) {
  const ctx = await getAuthContext();
  return patchRequest(id, { statut: 'Commande en cours' }, 'Commande lancée', '', ctx);
}

export async function markPurchaseReceived(id) {
  const ctx = await getAuthContext();
  const request = await patchRequest(id, { statut: 'Commande reçue' }, 'Réception', 'Commande réceptionnée', ctx);
  await notifyPurchaseReceived(request);
  return request;
}

export async function closePurchaseRequest(id) {
  const ctx = await getAuthContext();
  return patchRequest(id, { statut: 'Clôturée' }, 'Clôture', 'Demande clôturée', ctx);
}

export async function getPurchaseRequestBundle(id) {
  const request = await fetchRequest(id);
  const [quotes, history] = await Promise.all([
    listQuotesForRequest(id),
    import('./purchaseRequestHistory').then((m) => m.listPurchaseRequestHistory(id)),
  ]);
  let acquisitionOrder = null;
  let paymentOrder = null;
  if (request.acquisition_order_id) {
    const { getAcquisitionOrder } = await import('./purchaseAcquisitionOrders');
    acquisitionOrder = await getAcquisitionOrder(request.acquisition_order_id);
  }
  if (request.payment_order_id) {
    const { data } = await getSupabase()
      .from('payment_orders')
      .select('*')
      .eq('id', request.payment_order_id)
      .maybeSingle();
    if (data) {
      const { normalizePaymentOrder } = await import('../finance/paymentOrders');
      paymentOrder = normalizePaymentOrder(data);
    }
  }
  return { request, quotes, history, acquisitionOrder, paymentOrder };
}

export { listQuotesForRequest };
