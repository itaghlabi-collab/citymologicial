/**
 * purchaseWorkflow.js — Orchestration workflow demandes d'achat
 */
import { getSupabase } from '../../lib/supabase';
import { PURCHASE_ASSIGNEE, normalizePurchaseStatus, OA_TO_REQUEST_STATUS, purchaseStatusRank } from '../../constants/purchaseWorkflow';
import { appendPurchaseRequestHistory } from './purchaseRequestHistory';
import {
  createPurchaseRequestQuote,
  listQuotesForRequest,
  lockOtherQuotes,
  updatePurchaseRequestQuote,
  deletePurchaseRequestQuote,
} from './purchaseRequestQuotes';
import { createAcquisitionOrderFromQuote, updateAcquisitionOrder } from './purchaseAcquisitionOrders';
import { createAchatsPaymentOrderFromAcquisition } from './purchasePaymentOrdersAchats';
import { normalizePurchaseRequest, toPurchaseRequestRow, generatePurchaseRequestRef } from './purchaseRequests';
import { resolveCurrentPurchaseRole, purchasePermissions, PURCHASE_ROLES } from './purchaseWorkflowRoles';
import {
  notifyPurchaseRequestSubmitted,
  notifyPurchaseQuoteAdded,
  notifyPurchaseReadyForDg,
  notifyPurchaseSupplierValidated,
  notifyPurchaseReceived,
  notifyOaCreated,
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

async function patchRequest(id, patch, historyAction, historyDetail, ctx, commentaire = '') {
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
      commentaire,
      userId: user.id,
      userName,
    });
  }
  return normalizePurchaseRequest(data);
}

async function assertDgRole(ctx) {
  const role = await resolveCurrentPurchaseRole(ctx?.user || (await getAuthContext()).user);
  if (role !== PURCHASE_ROLES.DG) {
    const err = new Error('Seul le Directeur Général peut valider un devis fournisseur.');
    err.code = 'VALIDATION';
    throw err;
  }
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
  if (!row.project_name?.trim()) {
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
  if (!(form.projet_lie || form.project_name || '').trim()) {
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
  if (!(existing.project_name || existing.projet_lie || '').trim()) {
    const err = new Error('Renseignez le projet lié avant de soumettre la demande.');
    err.code = 'VALIDATION';
    throw err;
  }
  const request = await patchRequest(
    id,
    { statut: 'En étude' },
    'Soumission',
    `Demande soumise — ${PURCHASE_ASSIGNEE.label} (prise en charge automatique)`,
    ctx,
  );
  await notifyPurchaseRequestSubmitted(request);
  return request;
}

export async function takeInChargePurchaseRequest(id) {
  const ctx = await getAuthContext();
  const existing = await fetchRequest(id);
  if (normalizePurchaseStatus(existing.statut) !== 'Soumise') {
    const err = new Error('Seules les demandes soumises peuvent être prises en charge.');
    err.code = 'VALIDATION';
    throw err;
  }
  return patchRequest(id, { statut: 'En étude' }, 'Prise en charge', PURCHASE_ASSIGNEE.label, ctx);
}

/** Anciennes DA restées « Soumise » — passage auto en « En étude ». */
export async function reconcileLegacySoumiseRequests() {
  const ctx = await getAuthContext();
  const role = await resolveCurrentPurchaseRole(ctx.user);
  if (!purchasePermissions(role).canManageQuotes) return 0;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('statut', 'Soumise');
  if (error || !data?.length) return 0;

  await Promise.all(
    data.map((row) => patchRequest(
      row.id,
      { statut: 'En étude' },
      'Prise en charge',
      `${PURCHASE_ASSIGNEE.label} (synchronisation automatique)`,
      ctx,
    )),
  );
  return data.length;
}

const POST_DG_STATUSES = [
  'En attente validation DG', 'Devis validé', 'Ordre d\'achat créé',
  'Commande envoyée', 'En attente réception', 'Réceptionnée', 'Clôturée',
];

export async function addQuoteToRequest(id, quoteForm) {
  const ctx = await getAuthContext();
  let existing = await fetchRequest(id);
  let statut = normalizePurchaseStatus(existing.statut);
  if (!['Soumise', 'En étude', 'Devis reçus', 'En attente validation DG'].includes(statut)) {
    const err = new Error('Impossible d\'ajouter un devis à ce stade.');
    err.code = 'VALIDATION';
    throw err;
  }

  if (statut === 'Soumise') {
    existing = await patchRequest(id, { statut: 'En étude' }, 'Prise en charge', PURCHASE_ASSIGNEE.label, ctx);
    statut = 'En étude';
  }

  const quote = await createPurchaseRequestQuote(id, quoteForm);
  const quoteDetail = `${quote.supplier_name}${quote.ref_devis ? ` (${quote.ref_devis})` : ''} — ${quote.montant_ttc.toLocaleString('fr-FR')} MAD TTC`;

  if (purchaseStatusRank(statut) < purchaseStatusRank('Devis reçus')) {
    existing = await patchRequest(id, { statut: 'Devis reçus' }, 'Ajout devis', quoteDetail, ctx);
    statut = 'Devis reçus';
  } else {
    await appendPurchaseRequestHistory({
      purchaseRequestId: id,
      action: 'Ajout devis',
      detail: quoteDetail,
      userId: ctx.user.id,
      userName: ctx.userName,
    });
  }

  await notifyPurchaseQuoteAdded(existing);

  if (!POST_DG_STATUSES.includes(statut)) {
    existing = await patchRequest(
      id,
      { statut: 'En attente validation DG' },
      'Envoi validation DG',
      'Notification envoyée au Directeur Général',
      ctx,
    );
    await notifyPurchaseReadyForDg(existing);
  }

  return { request: existing, quote };
}

export async function updateQuoteOnRequest(requestId, quoteId, quoteForm) {
  const ctx = await getAuthContext();
  const quotes = await listQuotesForRequest(requestId);
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote || quote.verrouille || quote.selected) {
    const err = new Error('Ce devis ne peut plus être modifié.');
    err.code = 'VALIDATION';
    throw err;
  }
  const updated = await updatePurchaseRequestQuote(quoteId, { ...quoteForm, purchase_request_id: requestId });
  await appendPurchaseRequestHistory({
    purchaseRequestId: requestId,
    action: 'Modification devis',
    detail: updated.supplier_name,
    userId: ctx.user.id,
    userName: ctx.userName,
  });
  return updated;
}

export async function removeQuoteFromRequest(requestId, quoteId) {
  const ctx = await getAuthContext();
  const quotes = await listQuotesForRequest(requestId);
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote || quote.verrouille || quote.selected) {
    const err = new Error('Ce devis ne peut plus être supprimé.');
    err.code = 'VALIDATION';
    throw err;
  }
  await deletePurchaseRequestQuote(quoteId);
  await appendPurchaseRequestHistory({
    purchaseRequestId: requestId,
    action: 'Suppression devis',
    detail: quote.supplier_name,
    userId: ctx.user.id,
    userName: ctx.userName,
  });
}

export async function sendRequestToDgValidation(id) {
  const ctx = await getAuthContext();
  const existing = await fetchRequest(id);
  const statut = normalizePurchaseStatus(existing.statut);
  const quotes = await listQuotesForRequest(id);
  if (!quotes.length) {
    const err = new Error('Ajoutez au moins un devis avant l\'envoi au DG.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (purchaseStatusRank(statut) >= purchaseStatusRank('En attente validation DG')) {
    return existing;
  }
  const request = await patchRequest(
    id,
    { statut: 'En attente validation DG' },
    'Envoi validation DG',
    `${quotes.length} devis à comparer`,
    ctx,
  );
  await notifyPurchaseReadyForDg(request);
  return request;
}

export async function validateSupplierQuote(requestId, quoteId) {
  const ctx = await getAuthContext();
  await assertDgRole(ctx);

  const request = await fetchRequest(requestId);
  const statut = normalizePurchaseStatus(request.statut);
  if (!['Devis reçus', 'En attente validation DG', 'Devis validé'].includes(statut) && statut !== 'Validée') {
    const err = new Error('Validation impossible à ce stade du workflow.');
    err.code = 'VALIDATION';
    throw err;
  }

  const quotes = await listQuotesForRequest(requestId);
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote) {
    const err = new Error('Devis introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }

  await lockOtherQuotes(requestId, quoteId);

  const oa = await createAcquisitionOrderFromQuote({ request, quote, userId: ctx.user.id });
  const op = await createAchatsPaymentOrderFromAcquisition({
    request,
    oa,
    quote,
    userId: ctx.user.id,
  });

  await updateAcquisitionOrder(oa.id, { payment_order_id: op.id });

  let updated = await patchRequest(
    requestId,
    { statut: 'Devis validé', selected_quote_id: quoteId },
    'Validation devis',
    `Fournisseur retenu : ${quote.supplier_name} — ${quote.ref_devis || 'sans réf.'}`,
    ctx,
    `OA ${oa.ref} / OP ${op.ref}`,
  );

  updated = await patchRequest(
    requestId,
    {
      statut: 'Ordre d\'achat créé',
      acquisition_order_id: oa.id,
      payment_order_id: op.id,
    },
    'Création ordre d\'achat',
    oa.ref,
    ctx,
  );

  await notifyPurchaseSupplierValidated(updated, { quote, oa, op });
  await notifyOaCreated(updated, oa);
  return { request: updated, quote, oa, op };
}

const OA_SYNC_HISTORY = {
  'Commande envoyée': 'Commande envoyée au fournisseur',
  'En attente réception': 'Commande expédiée — en attente de réception',
  Réceptionnée: 'Réception enregistrée',
  Clôturée: 'Processus terminé',
};

export async function syncPurchaseRequestFromAcquisitionOrder(oa) {
  if (!oa?.purchase_request_id) return null;
  const requestStatus = OA_TO_REQUEST_STATUS[oa.statut];
  if (!requestStatus) return null;

  const ctx = await getAuthContext();
  const existing = await fetchRequest(oa.purchase_request_id);
  if (purchaseStatusRank(requestStatus) <= purchaseStatusRank(existing.statut)) {
    return existing;
  }

  const request = await patchRequest(
    oa.purchase_request_id,
    { statut: requestStatus },
    OA_SYNC_HISTORY[requestStatus] || `Statut OA : ${oa.statut}`,
    oa.ref_oa || oa.ref || '',
    ctx,
  );

  if (requestStatus === 'Réceptionnée') {
    await notifyPurchaseReceived(request);
  }

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
