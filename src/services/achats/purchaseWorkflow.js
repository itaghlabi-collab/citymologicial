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
import { createAcquisitionOrderFromQuote, updateAcquisitionOrder, syncAcquisitionOrderFromRequest, getAcquisitionOrder } from './purchaseAcquisitionOrders';
import { createAchatsPaymentOrderFromAcquisition, syncAchatsPaymentOrderFromRequest } from './purchasePaymentOrdersAchats';
import { normalizePurchaseRequest, toPurchaseRequestRow, generatePurchaseRequestRef, isOffProjectPurchaseRequest } from './purchaseRequests';
import { getPurchaseRequestQuote } from './purchaseRequestQuotes';
import { resolveCurrentPurchaseRole, purchasePermissions, PURCHASE_ROLES } from './purchaseWorkflowRoles';
import { fetchProfile } from '../supabase/auth';
import { employeeSelectLabel } from '../rh/employees';
import { isSuperAdmin } from '../rh/isSuperAdmin';
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
  const profile = await fetchProfile(user.id);
  const name = profile?.nom
    || user.user_metadata?.full_name
    || user.user_metadata?.nom
    || user.email?.split('@')[0]
    || 'Utilisateur';
  return { user, userName: name, profile };
}

/** Responsable = utilisateur de la session qui crée / édite la demande. */
export async function resolveCreatorAssignee(ctx) {
  const { user, userName } = ctx || await getAuthContext();
  const email = (user?.email || '').trim().toLowerCase();
  if (email) {
    const { data } = await getSupabase()
      .from('employees')
      .select('id, firstname, lastname, poste, department_id, department')
      .ilike('email', email)
      .maybeSingle();
    if (data?.id) {
      return {
        assigned_employee_id: data.id,
        assigned_employee_name: employeeSelectLabel(data) || userName,
      };
    }
  }
  return {
    assigned_employee_id: null,
    assigned_employee_name: userName,
  };
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
  const assignee = await resolveCreatorAssignee(ctx);
  const row = {
    ...toPurchaseRequestRow({
      ...form,
      statut: 'Brouillon',
      department: 'ACHATS',
      assigned_employee_id: form.assigned_employee_id ?? assignee.assigned_employee_id,
      assigned_employee_name: form.assigned_employee_name || assignee.assigned_employee_name,
    }),
    requester_user_id: ctx.user.id,
    requester_name: ctx.userName,
    ...assignee,
    commentaires_internes: form.commentaires_internes || null,
  };
  if (!row.titre?.trim()) {
    const err = new Error('Le titre de la demande est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!isOffProjectPurchaseRequest(form) && !row.project_name?.trim()) {
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

async function assertSuperAdmin(ctx) {
  const { user, profile } = ctx || await getAuthContext();
  if (!isSuperAdmin({ ...user, role: profile?.role || user?.role })) {
    const err = new Error('Accès réservé au super administrateur.');
    err.code = 'VALIDATION';
    throw err;
  }
}

async function syncLinkedOrdersFromPurchaseRequest(request) {
  if (!request?.acquisition_order_id && !request?.payment_order_id) return;

  const quote = request.selected_quote_id
    ? await getPurchaseRequestQuote(request.selected_quote_id)
    : null;

  let oa = null;
  if (request.acquisition_order_id) {
    oa = await syncAcquisitionOrderFromRequest(request.acquisition_order_id, { request, quote });
  }

  if (request.payment_order_id) {
    const oaForOp = oa || (request.acquisition_order_id
      ? await getAcquisitionOrder(request.acquisition_order_id)
      : null);
    await syncAchatsPaymentOrderFromRequest(request.payment_order_id, { request, quote, oa: oaForOp });
  }
}

export async function updatePurchaseRequestWorkflow(id, form) {
  const ctx = await getAuthContext();
  const existing = await fetchRequest(id);
  if (normalizePurchaseStatus(existing.statut) === 'Brouillon') {
    return updatePurchaseRequestDraft(id, form);
  }
  await assertSuperAdmin(ctx);
  return updatePurchaseRequestSuperAdmin(id, form, existing, ctx);
}

export async function updatePurchaseRequestSuperAdmin(id, form, existing = null, ctx = null) {
  const authCtx = ctx || await getAuthContext();
  await assertSuperAdmin(authCtx);
  const current = existing || await fetchRequest(id);
  if (!isOffProjectPurchaseRequest(form) && !(form.projet_lie || form.project_name || '').trim()) {
    const err = new Error('Le projet lié est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  const patch = {
    ...toPurchaseRequestRow({
      ...form,
      statut: current.statut,
      ref: current.ref,
      ref_demande: current.ref,
      assigned_employee_id: form.assigned_employee_id ?? current.assigned_employee_id,
      assigned_employee_name: form.assigned_employee_name || current.assigned_employee_name || current.requester_name,
    }),
    commentaires_internes: form.commentaires_internes ?? current.commentaires_internes,
  };
  const updated = await patchRequest(
    id,
    patch,
    'Modification super admin',
    'Demande modifiée — synchronisation OA/OP',
    authCtx,
  );
  await syncLinkedOrdersFromPurchaseRequest(updated);
  return updated;
}

export async function updatePurchaseRequestDraft(id, form) {
  const ctx = await getAuthContext();
  const existing = await fetchRequest(id);
  if (normalizePurchaseStatus(existing.statut) !== 'Brouillon') {
    const err = new Error('Seules les demandes en brouillon peuvent être modifiées.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!isOffProjectPurchaseRequest(form) && !(form.projet_lie || form.project_name || '').trim()) {
    const err = new Error('Le projet lié est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  const patch = {
    ...toPurchaseRequestRow({
      ...form,
      statut: 'Brouillon',
      ref: existing.ref,
      ref_demande: existing.ref,
      assigned_employee_id: form.assigned_employee_id ?? existing.assigned_employee_id,
      assigned_employee_name: form.assigned_employee_name || existing.assigned_employee_name || existing.requester_name,
    }),
    commentaires_internes: form.commentaires_internes ?? existing.commentaires_internes,
  };
  if (!(existing.ref || '').trim()) {
    patch.ref_demande = await generatePurchaseRequestRef();
  }
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
  if (!isOffProjectPurchaseRequest(existing) && !(existing.project_name || existing.projet_lie || '').trim()) {
    const err = new Error('Renseignez le projet lié avant de soumettre la demande.');
    err.code = 'VALIDATION';
    throw err;
  }
  const patch = { statut: 'En étude' };
  if (!(existing.ref || '').trim()) {
    patch.ref_demande = await generatePurchaseRequestRef();
  }
  const request = await patchRequest(
    id,
    patch,
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
  'En attente validation DG', 'Devis validé', 'Ordre d\'achat créé', 'Ordre de paiement créé',
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
    },
    'Création ordre d\'achat',
    oa.ref,
    ctx,
  );

  updated = await patchRequest(
    requestId,
    {
      statut: 'Ordre de paiement créé',
      payment_order_id: op.id,
    },
    'Ordre de paiement créé',
    op.ref,
    ctx,
  );

  await notifyPurchaseSupplierValidated(updated, { quote, oa, op });
  await notifyOaCreated(updated, oa);
  return { request: updated, quote, oa, op };
}

const OA_SYNC_HISTORY = {
  'Commande envoyée': 'Commande envoyée',
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

/** Corrige les DA dont le statut « Commande envoyée » ne correspond pas à un envoi réel au fournisseur. */
export async function reconcilePurchaseRequestSentStatus() {
  const { data: requests, error } = await getSupabase()
    .from(TABLE)
    .select('id, statut, acquisition_order_id')
    .eq('statut', 'Commande envoyée');
  if (error || !requests?.length) return 0;

  let fixed = 0;
  for (const req of requests) {
    if (!req.acquisition_order_id) continue;
    const { data: oa } = await getSupabase()
      .from('purchase_acquisition_orders')
      .select('statut')
      .eq('id', req.acquisition_order_id)
      .maybeSingle();
    if (!oa || oa.statut === 'Envoyé fournisseur') continue;
    await getSupabase()
      .from(TABLE)
      .update({ statut: 'Ordre de paiement créé' })
      .eq('id', req.id);
    fixed += 1;
  }
  return fixed;
}

export async function closePurchaseRequest(id) {
  const ctx = await getAuthContext();
  return patchRequest(id, { statut: 'Clôturée' }, 'Clôture', 'Demande clôturée', ctx);
}

export async function getPurchaseRequestBundle(id) {
  const rawRequest = await fetchRequest(id);
  const { enrichPurchaseRequestFiles, enrichPurchaseQuotesFiles } = await import('./purchaseStorage');
  const request = await enrichPurchaseRequestFiles(rawRequest);
  const [quotes, history] = await Promise.all([
    listQuotesForRequest(id).then(enrichPurchaseQuotesFiles),
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
