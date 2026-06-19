/**
 * articleQuickActions.js — Actions rapides fiche article → mouvement stock auto-validé
 */
import { saveStockMovementBon } from './stockMovements';
import { patchStockArticle } from './stockArticles';
import { requireSupabaseUserId } from '../supabase/requireUser';

export const QUICK_ACTIONS = {
  affecter_chantier: {
    label: 'Affecter chantier',
    type: 'Transfert',
    needsDest: true,
    state: 'Affecté chantier',
    motif: 'Affectation chantier',
  },
  retour_depot: {
    label: 'Retour dépôt',
    type: 'Retour',
    needsDest: true,
    state: 'Disponible',
    motif: 'Retour dépôt',
    defaultDest: 'DEPOT LAKHYAYTA',
  },
  transferer: {
    label: 'Transférer emplacement',
    type: 'Transfert',
    needsDest: true,
    motif: 'Transfert emplacement',
  },
  envoyer_reparation: {
    label: 'Envoyer réparation',
    type: 'Transfert',
    needsDest: true,
    state: 'Réparation',
    motif: 'Envoi réparation',
    defaultDest: 'SAV HOUCINE HEZGUIT',
  },
  retour_reparation: {
    label: 'Retour réparation',
    type: 'Retour',
    needsDest: true,
    state: 'Disponible',
    motif: 'Retour réparation',
    defaultDest: 'DEPOT LAKHYAYTA',
  },
  hors_service: {
    label: 'Déclarer hors service',
    type: 'Rebut',
    needsDest: false,
    state: 'Hors service',
    motif: 'Mise hors service',
  },
  perdu: {
    label: 'Déclarer perdu',
    type: 'Sortie',
    needsDest: false,
    state: 'Perdu',
    motif: 'Article déclaré perdu',
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultDepot(article) {
  const emp = (article?.emplacement || '').trim();
  if (emp && emp.toUpperCase().includes('DEPOT')) return emp;
  return 'DEPOT LAKHYAYTA';
}

function isChantierEmplacement(emp) {
  const e = String(emp || '').toUpperCase();
  return e.includes('CHANTIER') || e.includes('VILLA') || e.includes('LOGIPARC') || e.includes('ONDA');
}

export async function executeArticleQuickAction({
  article,
  actionKey,
  destination = '',
  observation = '',
  userName = '',
  quantite = 1,
}) {
  const config = QUICK_ACTIONS[actionKey];
  if (!config || !article?.id) {
    const err = new Error('Action invalide.');
    err.code = 'VALIDATION';
    throw err;
  }

  await requireSupabaseUserId();
  const source = (article.emplacement || defaultDepot(article)).trim();
  const dest = (destination || config.defaultDest || '').trim();
  const qty = Math.max(1, Number(quantite) || 1);

  if (config.needsDest && !dest) {
    const err = new Error('Sélectionnez un emplacement de destination.');
    err.code = 'VALIDATION';
    throw err;
  }

  if (config.type === 'Transfert' && source === dest) {
    const err = new Error('L\'emplacement de destination doit être différent de l\'origine.');
    err.code = 'VALIDATION';
    throw err;
  }

  const needsSource = ['Sortie', 'Transfert', 'Retour', 'Rebut'].includes(config.type);
  const needsDestType = ['Entrée', 'Transfert', 'Retour'].includes(config.type);

  const bon = {
    type_mouvement: config.type,
    emplacement_source: needsSource ? source : '',
    emplacement_destination: needsDestType ? dest : '',
    date_creation: todayIso(),
    cree_par: userName || 'Système',
    motif: config.motif,
    note: (observation || '').trim(),
    statut: 'Validé',
    lignes: [{
      article_id: article.id,
      article_code: article.code,
      article_designation: article.designation,
      quantite: qty,
      notes: observation || '',
    }],
  };

  const saved = await saveStockMovementBon(bon);

  const patch = {};
  if (config.state) patch.current_state = config.state;
  if (needsDestType && dest) patch.emplacement = dest;
  else if (actionKey === 'retour_depot') patch.emplacement = dest || defaultDepot(article);
  else if (actionKey === 'affecter_chantier' && dest) patch.emplacement = dest;

  if (Object.keys(patch).length) {
    await patchStockArticle(article.id, patch);
  }

  return saved;
}

export function inferCurrentStateFromEmplacement(emplacement) {
  const e = String(emplacement || '').trim();
  if (!e) return 'Disponible';
  if (e.toUpperCase().includes('SAV') || e.toUpperCase().includes('RÉPAR') || e.toUpperCase().includes('REPAR')) {
    return 'Réparation';
  }
  if (isChantierEmplacement(e)) return 'Affecté chantier';
  if (e.toUpperCase().includes('DEPOT')) return 'Disponible';
  return 'Utilisé';
}
