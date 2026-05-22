/**
 * api.js — CITYMO API Configuration
 *
 * Centralizes all API-related configuration:
 * - base URLs per endpoint group
 * - timeouts
 * - retry policy
 * - headers
 *
 * Usage:
 *   import { API_CONFIG } from '../config/api';
 *   fetch(API_CONFIG.BASE_URL + '/prospects')
 */

import { ENV } from './env';

export const API_CONFIG = {
  /** Main REST API base URL */
  BASE_URL: ENV.API_URL,

  /** Default request timeout in ms */
  TIMEOUT_MS: 15000,

  /** Max retries on network failure */
  MAX_RETRIES: 2,

  /** Default headers sent with every request */
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },

  /**
   * Endpoint groups — useful for Supabase table mapping or versioned APIs.
   * Example: API_CONFIG.ENDPOINTS.PROSPECTS → '/prospects'
   */
  ENDPOINTS: {
    AUTH:              '/auth',
    EMPLOYEES:         '/employees',
    WORKERS:           '/workers',
    ATTENDANCE:        '/workers/attendance',
    LEAVE_REQUESTS:    '/leave-requests',
    DEPARTMENTS:       '/departments',
    PROJECTS:          '/projects',
    CLIENTS:           '/clients',
    PROSPECTS:         '/prospects',
    DEVIS:             '/devis',
    FACTURES:          '/factures',
    BON_LIVRAISONS:    '/bons-livraison',
    ARTICLES:          '/articles',
    CATEGORIES:        '/categories',
    STOCK_MOVEMENTS:   '/stock/movements',
    DEPOTS:            '/stock/depots',
    ACOMPTES:          '/acomptes',
    RDV:               '/rdv',
    COMPTES_RENDUS:    '/comptes-rendus',
    ACTIONS_MARKETING: '/actions-marketing',
    DEPENSES:          '/depenses',
    PROPOSITIONS:      '/propositions',
    EXPENSES:          '/expenses',
    PAYMENT_ORDERS:    '/payment-orders',
    TASKS:             '/tasks',
    MEETINGS:          '/meetings',
    PRODUCTS:          '/products',
    PURCHASE_ORDERS:   '/purchase-orders',
    INVOICES:          '/invoices',
    QUOTES:            '/quotes',
    NOTIFICATIONS:     '/notifications',
    DASHBOARD:         '/dashboard',
    VEHICLES:          '/vehicles',
    INTERVENTIONS:     '/interventions',
    DOCUMENTS:         '/documents',
    SAV:               '/sav',
    INVENTORY:         '/inventory',
    SUPPLIERS:         '/suppliers',
    PURCHASE_DEMANDS:  '/purchase-demands',
    ORDER_VOUCHERS:    '/order-vouchers',
    COMPARISONS:       '/comparisons',
    FINANCE_CHARGES:   '/charges',
    FINANCE_CATEGORIES: '/charge-categories',
    ORDRES_PAIEMENT:   '/ordres-paiement',
    ROLES:             '/roles',
    USERS:             '/users',
    BACKUPS:           '/backups',
  },
};
