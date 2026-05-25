/* =============================================
   CITYMO ERP – API Service Layer
   Base URL configured via VITE_API_URL env var
   Falls back to localhost:3000/api in dev
   ============================================= */

import { ENV } from '../config/env';
import { getAuthToken, handleUnauthorized } from './auth';

/* BASE_URL: set VITE_API_URL in your .env (see env.txt for reference) */
const BASE_URL = ENV.API_URL;

async function apiFetch(path, options = {}) {
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(BASE_URL + path, { ...options, headers });
  if (res.status === 401) {
    await handleUnauthorized();
  }
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try { const err = await res.json(); msg = err.message || err.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

/* ── Helpers ── */
async function safeGet(path) {
  try { return await apiFetch(path); }
  catch (_) { return []; } // Falls back to [] if API unavailable
}

function buildQuery(params = {}) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? '?' + q : '';
}

/* ── Auth (Express legacy API — app login uses services/auth.js + Supabase) ── */
export async function loginApi(email, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
export const getMe            = () => apiFetch('/auth/me');
export const changePassword   = (current_password, new_password) =>
  apiFetch('/auth/change-password', { method: 'PUT', body: JSON.stringify({ current_password, new_password }) });

/* ── Employees ── */
export const getEmployees     = () => safeGet('/employees');
export const createEmployee   = (data) => apiFetch('/employees', { method: 'POST', body: JSON.stringify(data) });

/* ── Clients ── */
export const getClients       = () => safeGet('/clients');
export const createClient     = (data) => apiFetch('/clients', { method: 'POST', body: JSON.stringify(data) });

/* ── Projects ── */
export const getProjects      = () => safeGet('/projects');
export const createProject    = (data) => apiFetch('/projects', { method: 'POST', body: JSON.stringify(data) });

/* ── Quotes ── */
export const getQuotes        = () => safeGet('/quotes');
export const createQuote      = (data) => apiFetch('/quotes', { method: 'POST', body: JSON.stringify(data) });

/* ── Invoices ── */
export const getInvoices      = () => safeGet('/invoices');
export const createInvoice    = (data) => apiFetch('/invoices', { method: 'POST', body: JSON.stringify(data) });

/* ── Expenses / Charges ── */
export const getExpenses      = () => safeGet('/expenses');
export const createExpense    = (data) => apiFetch('/expenses', { method: 'POST', body: JSON.stringify(data) });

/* ── Workers / Ouvriers ── */
export const getWorkers       = () => safeGet('/workers');
export const createWorker     = (data) => apiFetch('/workers', { method: 'POST', body: JSON.stringify(data) });
export const updateWorker     = (id, data) => apiFetch(`/workers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteWorker     = (id) => apiFetch(`/workers/${id}`, { method: 'DELETE' });
export const getAttendance    = () => safeGet('/workers/attendance');

/* ── Leave Requests ── */
export const getLeaveRequests = () => safeGet('/leave-requests');
export const createLeaveRequest = (data) => apiFetch('/leave-requests', { method: 'POST', body: JSON.stringify(data) });

/* ── Payment Orders ── */
export const getPaymentOrders = () => safeGet('/payment-orders');

/* ── Tasks & Meetings ── */
export const getTasks         = () => safeGet('/tasks');
export const getMeetings      = () => safeGet('/meetings');

/* ── Stock ── */
export const getProducts      = () => safeGet('/products');
export const getPurchaseOrders = () => safeGet('/purchase-orders');

/* ── Departments ── */
export const getDepartments   = () => safeGet('/departments');

/* ═══════════════════════════════════════════════════════════════════════════
   COMMERCIAL / MARKETING MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Prospects ── */
export const getProspects     = (filters = {}) => safeGet('/prospects' + buildQuery(filters));
export const getProspect      = (id) => apiFetch(`/prospects/${id}`);
export const createProspect   = (data) => apiFetch('/prospects', { method: 'POST', body: JSON.stringify(data) });
export const updateProspect   = (id, data) => apiFetch(`/prospects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProspect   = (id) => apiFetch(`/prospects/${id}`, { method: 'DELETE' });

/* ── Devis (Commercial) ── */
export const getDevis         = (filters = {}) => safeGet('/devis' + buildQuery(filters));
export const getDevisById     = (id) => apiFetch(`/devis/${id}`);
export const createDevis      = (data) => apiFetch('/devis', { method: 'POST', body: JSON.stringify(data) });
export const updateDevis      = (id, data) => apiFetch(`/devis/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteDevis      = (id) => apiFetch(`/devis/${id}`, { method: 'DELETE' });
export const addDevisFile     = (id, fileUrl) => apiFetch(`/devis/${id}/files`, { method: 'POST', body: JSON.stringify({ file_url: fileUrl }) });

/* ── RDV (Rendez-vous) ── */
export const getRDV           = (filters = {}) => safeGet('/rdv' + buildQuery(filters));
export const getRDVById       = (id) => apiFetch(`/rdv/${id}`);
export const createRDV        = (data) => apiFetch('/rdv', { method: 'POST', body: JSON.stringify(data) });
export const updateRDV        = (id, data) => apiFetch(`/rdv/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRDV        = (id) => apiFetch(`/rdv/${id}`, { method: 'DELETE' });
export const addRDVFile       = (id, fileUrl) => apiFetch(`/rdv/${id}/files`, { method: 'POST', body: JSON.stringify({ file_url: fileUrl }) });

/* ── Comptes Rendus ── */
export const getComptesRendus = (filters = {}) => safeGet('/comptes-rendus' + buildQuery(filters));
export const getCompteRendu   = (id) => apiFetch(`/comptes-rendus/${id}`);
export const createCompteRendu = (data) => apiFetch('/comptes-rendus', { method: 'POST', body: JSON.stringify(data) });
export const updateCompteRendu = (id, data) => apiFetch(`/comptes-rendus/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCompteRendu = (id) => apiFetch(`/comptes-rendus/${id}`, { method: 'DELETE' });

/* ── Actions Marketing ── */
export const getActionsMarketing  = (filters = {}) => safeGet('/actions-marketing' + buildQuery(filters));
export const getActionMarketing   = (id) => apiFetch(`/actions-marketing/${id}`);
export const createActionMarketing = (data) => apiFetch('/actions-marketing', { method: 'POST', body: JSON.stringify(data) });
export const updateActionMarketing = (id, data) => apiFetch(`/actions-marketing/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteActionMarketing = (id) => apiFetch(`/actions-marketing/${id}`, { method: 'DELETE' });

/* ── Depenses (Commercial/Marketing) ── */
export const getDepenses      = (filters = {}) => safeGet('/depenses' + buildQuery(filters));
export const createDepense    = (data) => apiFetch('/depenses', { method: 'POST', body: JSON.stringify(data) });
export const updateDepense    = (id, data) => apiFetch(`/depenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteDepense    = (id) => apiFetch(`/depenses/${id}`, { method: 'DELETE' });

/* ── Propositions Marketing ── */
export const getPropositions  = (filters = {}) => safeGet('/propositions' + buildQuery(filters));
export const getProposition   = (id) => apiFetch(`/propositions/${id}`);
export const createProposition = (data) => apiFetch('/propositions', { method: 'POST', body: JSON.stringify(data) });
export const updateProposition = (id, data) => apiFetch(`/propositions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProposition = (id) => apiFetch(`/propositions/${id}`, { method: 'DELETE' });
export const addPropositionFile = (id, fileUrl) => apiFetch(`/propositions/${id}/files`, { method: 'POST', body: JSON.stringify({ file_url: fileUrl }) });

/* ── Notifications ── */
export const getNotifications       = (filters = {}) => safeGet('/notifications' + buildQuery(filters));
export const getUnreadNotifications = () => safeGet('/notifications' + buildQuery({ lu: 'false' }));
export const markNotificationRead   = (id) => apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
export const markAllNotificationsRead = (userId) =>
  apiFetch('/notifications/read-all', { method: 'PUT', body: JSON.stringify(userId ? { user_id: userId } : {}) });

/* ── Dashboard Commercial ── */
export const getDashboardCommercial = () => safeGet('/dashboard/commercial');

/* ═══════════════════════════════════════════════════════════════════════════
   CRM — CATEGORIES
   ═══════════════════════════════════════════════════════════════════════════ */
export const getCategories       = (filters = {}) => safeGet('/categories' + buildQuery(filters));
export const getCategorie        = (id) => apiFetch(`/categories/${id}`);
export const createCategorie     = (data) => apiFetch('/categories', { method: 'POST', body: JSON.stringify(data) });
export const updateCategorie     = (id, data) => apiFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCategorie     = (id) => apiFetch(`/categories/${id}`, { method: 'DELETE' });

/* ═══════════════════════════════════════════════════════════════════════════
   CRM — ARTICLES
   ═══════════════════════════════════════════════════════════════════════════ */
export const getArticles         = (filters = {}) => safeGet('/articles' + buildQuery(filters));
export const getArticle          = (id) => apiFetch(`/articles/${id}`);
export const createArticle       = (data) => apiFetch('/articles', { method: 'POST', body: JSON.stringify(data) });
export const updateArticle       = (id, data) => apiFetch(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteArticle       = (id) => apiFetch(`/articles/${id}`, { method: 'DELETE' });
export const duplicateArticle    = (id) => apiFetch(`/articles/${id}/duplicate`, { method: 'POST' });

/* ═══════════════════════════════════════════════════════════════════════════
   CRM — STOCK
   ═══════════════════════════════════════════════════════════════════════════ */
export const getStockMovements   = (filters = {}) => safeGet('/stock/movements' + buildQuery(filters));
export const createStockMovement = (data) => apiFetch('/stock/movements', { method: 'POST', body: JSON.stringify(data) });
export const getDepots           = () => safeGet('/stock/depots');
export const getArticleStock     = (articleId) => safeGet(`/articles/${articleId}/stock`);

/* ═══════════════════════════════════════════════════════════════════════════
   CRM — FACTURES
   ═══════════════════════════════════════════════════════════════════════════ */
export const getFactures         = (filters = {}) => safeGet('/factures' + buildQuery(filters));
export const getFacture          = (id) => apiFetch(`/factures/${id}`);
export const createFacture       = (data) => apiFetch('/factures', { method: 'POST', body: JSON.stringify(data) });
export const updateFacture       = (id, data) => apiFetch(`/factures/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteFacture       = (id) => apiFetch(`/factures/${id}`, { method: 'DELETE' });
export const duplicateFacture    = (id) => apiFetch(`/factures/${id}/duplicate`, { method: 'POST' });
export const annulerFacture      = (id) => apiFetch(`/factures/${id}/annuler`, { method: 'PUT' });

/* ── Paiements facture ── */
export const getPaiementsFacture  = (factureId) => safeGet(`/factures/${factureId}/paiements`);
export const addPaiementFacture   = (factureId, data) => apiFetch(`/factures/${factureId}/paiements`, { method: 'POST', body: JSON.stringify(data) });
export const deletePaiement       = (factureId, paiementId) => apiFetch(`/factures/${factureId}/paiements/${paiementId}`, { method: 'DELETE' });

/* ── Acomptes ── */
export const getAcomptes         = (filters = {}) => safeGet('/acomptes' + buildQuery(filters));
export const createAcompte       = (data) => apiFetch('/acomptes', { method: 'POST', body: JSON.stringify(data) });
export const updateAcompte       = (id, data) => apiFetch(`/acomptes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAcompte       = (id) => apiFetch(`/acomptes/${id}`, { method: 'DELETE' });

/* ═══════════════════════════════════════════════════════════════════════════
   CRM — BONS DE LIVRAISON
   ═══════════════════════════════════════════════════════════════════════════ */
export const getBonLivraisons    = (filters = {}) => safeGet('/bons-livraison' + buildQuery(filters));
export const getBonLivraison     = (id) => apiFetch(`/bons-livraison/${id}`);
export const createBonLivraison  = (data) => apiFetch('/bons-livraison', { method: 'POST', body: JSON.stringify(data) });
export const updateBonLivraison  = (id, data) => apiFetch(`/bons-livraison/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteBonLivraison  = (id) => apiFetch(`/bons-livraison/${id}`, { method: 'DELETE' });
export const marquerLivre        = (id) => apiFetch(`/bons-livraison/${id}/livrer`, { method: 'PUT' });
export const genererFactureBL    = (id) => apiFetch(`/bons-livraison/${id}/facturer`, { method: 'POST' });
