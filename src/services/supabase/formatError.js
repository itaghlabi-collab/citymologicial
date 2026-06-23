/**
 * formatError.js — Normalize Supabase/PostgREST errors for UI toasts.
 */
export function formatSupabaseError(error, fallback = 'Une erreur est survenue.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const code = error.code;
  const message = error.message || fallback;

  if (code === '23505') {
    if (message.includes('clients')) return 'Ce client existe déjà (nom ou ICE en doublon).';
    if (message.includes('articles')) return 'Un article avec ce nom existe déjà.';
    if (message.includes('categories')) return 'Une catégorie avec ce nom ou slug existe déjà.';
    if (message.includes('crm_devis')) return 'Ce numéro de devis existe déjà.';
    if (message.includes('crm_factures')) return 'Ce numéro de facture existe déjà.';
    return 'Cet enregistrement existe déjà (contrainte unique).';
  }
  if (code === '42501') {
    return 'Accès refusé (RLS). Exécutez supabase/RUN_FINANCE_RLS_FIX.sql dans Supabase SQL Editor.';
  }
  if (code === '42703' || message.includes('created_by')) {
    return 'Schéma congés incomplet — exécutez supabase/migrations/20260525200000_leaves_rls_super_admin.sql';
  }
  if (code === '42P01' || message.includes('attendance')) {
    return 'Table présence absente — exécutez supabase/RUN_PRESENCE_COMPLET.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('workers')) {
    return 'Table ouvriers absente — exécutez supabase/migrations/20260525300000_workers_schema.sql';
  }
  if (message.includes('attendance_statut_check') || message.includes('demi_journee')) {
    return 'Statuts présence incomplets — exécutez supabase/RUN_ATTENDANCE_NOW.sql dans Supabase (SQL Editor).';
  }
  if (message.includes('chef_chantier') || message.includes('attendance_chef_chantier')) {
    return 'Colonne chef de chantier absente — exécutez supabase/RUN_ATTENDANCE_NOW.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('overtime')) {
    return 'Table heures sup. absente — exécutez supabase/migrations/20260525500000_overtime_workers.sql';
  }
  if (code === '42P01' || message.includes('payroll')) {
    return 'Table paiement absente — exécutez supabase/migrations/20260525000000_rh_schema.sql puis 20260525600000_payroll_workers_extend.sql';
  }
  if (message.includes('payroll_statut_check') || message.includes('jours_travailles')) {
    return 'Schéma paiement ouvriers incomplet — exécutez supabase/migrations/20260525600000_payroll_workers_extend.sql';
  }
  if (code === '42P01' || message.includes('prospects')) {
    return 'Table prospects absente — exécutez supabase/migrations/20260525700000_prospects.sql';
  }
  if (code === '42P01' || message.includes('devis')) {
    return 'Table devis absente — exécutez supabase/migrations/20260525800000_devis.sql';
  }
  if (code === '42P01' || message.includes('planning_commercial')) {
    return 'Table planning absente — exécutez supabase/migrations/20260525900000_planning_commercial.sql';
  }
  if (code === '42P01' || message.includes('actions_marketing')) {
    return 'Table actions marketing absente — exécutez supabase/migrations/20260525910000_actions_marketing.sql';
  }
  if (code === '42P01' || message.includes('comptes_rendus')) {
    return 'Table comptes rendus absente — exécutez supabase/migrations/20260525920000_comptes_rendus.sql';
  }
  if (code === '42P01' || (message.includes('depenses') && !message.includes('expenses'))) {
    return 'Table depenses absente — exécutez supabase/migrations/20260525930000_depenses.sql';
  }
  if (code === '42P01' || message.includes('propositions_marketing')) {
    return 'Table propositions absente — exécutez supabase/migrations/20260525940000_propositions_marketing.sql puis 20260525940100_propositions_marketing_fields.sql';
  }
  if (code === '42P01' || (message.includes('clients') && !message.includes('prospects'))) {
    return 'Table clients absente — exécutez supabase/migrations/20260526000000_clients.sql';
  }
  if ((code === '42703' || code === 'PGRST204') && message.includes('articles') && message.includes('description')) {
    return 'Colonne description absente — exécutez supabase/migrations/20260618130000_articles_description.sql dans Supabase SQL Editor.';
  }
  if (code === '42P01' || (message.includes('relation') && message.includes('articles'))) {
    return 'Table articles absente — exécutez supabase/migrations/20260526020000_articles.sql';
  }
  if (message.includes('articles') && (message.includes('column') || message.includes('colonne'))) {
    return 'Schéma articles incomplet — exécutez les migrations articles dans Supabase SQL Editor.';
  }
  if (code === '42P01' || message.includes('stock_levels')) {
    return 'Table niveaux stock absente — exécutez supabase/RUN_STOCK_ARTICLES_LEVELS.sql dans Supabase SQL Editor.';
  }
  if ((code === '42703' || code === 'PGRST204') && message.includes('stock_articles')) {
    if (message.includes('barcode_value') || message.includes('last_scanned_at') || message.includes('current_state')) {
      return 'Colonnes suivi articles absentes — exécutez supabase/RUN_STOCK_ARTICLES_BARCODE.sql dans Supabase SQL Editor.';
    }
    return 'Schéma articles stock incomplet — exécutez supabase/RUN_STOCK_ARTICLES_LEVELS.sql dans Supabase SQL Editor.';
  }
  if (code === '42P01' || message.includes('stock_articles')) {
    return 'Table articles stock absente — exécutez supabase/migrations/20260604120000_finance_achats_inventaire_ged.sql';
  }
  if (code === '42P01' || message.includes('categories')) {
    return 'Table categories absente — exécutez supabase/migrations/20260526010000_categories.sql';
  }
  if (code === '42P01' || message.includes('crm_devis')) {
    return 'Tables devis CRM absentes — exécutez supabase/migrations/20260526030000_crm_devis.sql';
  }
  if (code === '42P01' || message.includes('crm_factures')) {
    return 'Tables factures CRM absentes — exécutez supabase/migrations/20260526040000_factures.sql';
  }
  if (code === 'PGRST301' || message.includes('JWT')) {
    return 'Session expirée. Veuillez vous reconnecter.';
  }
  if (code === 'AUTH' || message.includes('Session requise')) {
    return 'Session requise. Veuillez vous connecter.';
  }
  if (code === '42P01' || message.includes('internal_tasks') || message.includes('dg_push')) {
    return 'Table tâches absente ou incomplète — exécutez supabase/RUN_INTERNAL_TASKS_ENHANCE.sql et RUN_INTERNAL_TASKS_DG.sql';
  }
  if (code === '42P01' || message.includes('internal_appointments')) {
    return 'Table rendez-vous absente — exécutez supabase/migrations/20260526110000_internal_appointments.sql';
  }
  if (code === '42P01' || message.includes('executive_calendar')) {
    return 'Table agenda direction absente — exécutez supabase/RUN_EXECUTIVE_CALENDAR.sql';
  }
  if (code === '42P01' || message.includes('finance_transactions')) {
    return 'Table journal caisse absente — exécutez supabase/RUN_FINANCE_TRESORERIE.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('cash_monthly_balances')) {
    return 'Table soldes caisse absente — exécutez supabase/RUN_FINANCE_TRESORERIE.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('finance_categories')) {
    return 'Table catégories finance absente — exécutez supabase/RUN_FINANCE_TRESORERIE.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('document_public_links')) {
    return 'Table liens publics absente — exécutez supabase/RUN_DOCUMENT_PUBLIC_LINKS.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('document_shares')) {
    return 'Table partages documents absente — exécutez supabase/RUN_DOCUMENT_SHARES.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('document_folders') || message.includes('documents')) {
    return 'Tables documents absentes — exécutez supabase/RUN_MES_DOCUMENTS.sql dans Supabase (SQL Editor).';
  }
  if (code === '42P01' || message.includes('subcontractor')) {
    return 'Module sous-traitants absent — exécutez supabase/RUN_SUBCONTRACTORS.sql dans Supabase (SQL Editor).';
  }
  if (code === 'VALIDATION') return message;
  if (message.includes('"type"') && message.includes('crm_factures')) {
    return 'Colonnes acompte absentes — exécutez supabase/migrations/20260526041000_crm_factures_acompte.sql';
  }

  return message;
}
