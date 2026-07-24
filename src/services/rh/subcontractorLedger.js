/**
 * Grand livre sous-traitant — agrégation chronologique (débit / crédit / solde).
 * Source : avances, paiements, situations, imputations, événements.
 * Pas de table dédiée : calculé à la volée.
 */
import { round2 } from './subcontractorAdvanceMath';

const TYPE_LABEL = {
  avance: 'Avance',
  situation: 'Situation de travaux',
  consommation_avance: 'Consommation d’avance',
  paiement: 'Paiement',
  retenue: 'Retenue',
  regularisation: 'Régularisation',
  annulation: 'Annulation',
};

/**
 * Convention :
 * - Crédit = ce qui augmente la dette envers le ST (travaux)
 * - Débit = ce qui réduit la dette (avances versées, paiements, retenues)
 * Solde après = cumul (crédits − débits) = reste théorique
 */
export function buildSubcontractorLedger({
  advances = [],
  payments = [],
  situations = [],
  imputations = [],
  events = [],
} = {}) {
  const rows = [];

  (advances || []).forEach((a) => {
    if ((a.status || '') === 'cancelled') {
      rows.push({
        id: `adv-cancel-${a.id}`,
        date: a.updated_at || a.advanceDate || a.created_at,
        type: 'annulation',
        typeLabel: TYPE_LABEL.annulation,
        projectId: a.projectId || '',
        projectName: a.projectName || '',
        reference: a.reference || '',
        label: `Annulation avance ${a.reference || ''}`.trim(),
        amount: Number(a.amount) || 0,
        debit: 0,
        credit: Number(a.amount) || 0,
        status: 'Annulé',
        userLabel: a.createdByLabel || '',
        source: 'advance',
        sourceId: a.id,
      });
      return;
    }
    rows.push({
      id: `adv-${a.id}`,
      date: a.advanceDate || a.created_at,
      type: 'avance',
      typeLabel: TYPE_LABEL.avance,
      projectId: a.projectId || '',
      projectName: a.projectName || 'Global',
      reference: a.reference || '',
      label: a.observation || 'Avance globale',
      amount: Number(a.amount) || 0,
      debit: Number(a.amount) || 0,
      credit: 0,
      status: a.statusLabel || a.status || 'Actif',
      userLabel: a.createdByLabel || '',
      source: 'advance',
      sourceId: a.id,
    });
  });

  if (situations?.length) {
    situations.forEach((s) => {
      if (s.status === 'cancelled') return;
      rows.push({
        id: `sit-${s.id}`,
        date: s.situationDate || s.created_at,
        type: 'situation',
        typeLabel: TYPE_LABEL.situation,
        projectId: s.projectId || '',
        projectName: s.projectName || '',
        reference: s.reference || '',
        label: s.designation || 'Situation de travaux',
        amount: Number(s.grossAmount) || 0,
        debit: 0,
        credit: Number(s.grossAmount) || 0,
        status: s.statusLabel || s.status || '',
        userLabel: '',
        source: 'situation',
        sourceId: s.id,
      });
      const av = Math.min(Number(s.avancesImputees) || 0, Number(s.grossAmount) || 0);
      if (av > 0) {
        rows.push({
          id: `sit-av-${s.id}`,
          date: s.situationDate || s.created_at,
          type: 'consommation_avance',
          typeLabel: TYPE_LABEL.consommation_avance,
          projectId: s.projectId || '',
          projectName: s.projectName || '',
          reference: s.reference || '',
          label: `Imputation avance — ${s.designation || s.reference || ''}`.trim(),
          amount: av,
          debit: av,
          credit: 0,
          status: s.statusLabel || '',
          userLabel: '',
          source: 'situation',
          sourceId: s.id,
        });
      }
      const ret = Number(s.retenues) || 0;
      if (ret > 0) {
        rows.push({
          id: `sit-ret-${s.id}`,
          date: s.situationDate || s.created_at,
          type: 'retenue',
          typeLabel: TYPE_LABEL.retenue,
          projectId: s.projectId || '',
          projectName: s.projectName || '',
          reference: s.reference || '',
          label: `Retenue — ${s.designation || ''}`.trim(),
          amount: ret,
          debit: ret,
          credit: 0,
          status: s.statusLabel || '',
          userLabel: '',
          source: 'situation',
          sourceId: s.id,
        });
      }
      const paid = Number(s.amountPaid) || 0;
      if (paid > 0) {
        rows.push({
          id: `sit-pay-${s.id}`,
          date: s.situationDate || s.created_at,
          type: 'paiement',
          typeLabel: TYPE_LABEL.paiement,
          projectId: s.projectId || '',
          projectName: s.projectName || '',
          reference: s.reference || '',
          label: `Paiement situation — ${s.designation || ''}`.trim(),
          amount: paid,
          debit: paid,
          credit: 0,
          status: s.statusLabel || '',
          userLabel: '',
          source: 'situation',
          sourceId: s.id,
        });
      }
    });
  } else {
    (payments || []).forEach((p) => {
      if ((p.status || '') === 'cancelled') {
        rows.push({
          id: `pay-cancel-${p.id}`,
          date: p.paymentDate || p.created_at,
          type: 'annulation',
          typeLabel: TYPE_LABEL.annulation,
          projectId: p.projectId || '',
          projectName: p.projectName || '',
          reference: p.reference || '',
          label: 'Annulation paiement',
          amount: Number(p.amount) || 0,
          debit: 0,
          credit: Number(p.amount) || 0,
          status: 'Annulé',
          userLabel: '',
          source: 'payment',
          sourceId: p.id,
          payment: p,
        });
        return;
      }
      const gross = Number(p.grossAmount) || 0;
      if (gross > 0) {
        rows.push({
          id: `pay-g-${p.id}`,
          date: p.paymentDate || p.created_at,
          type: 'situation',
          typeLabel: TYPE_LABEL.situation,
          projectId: p.projectId || '',
          projectName: p.projectName || '',
          reference: p.reference || '',
          label: p.designation || p.description || 'Travaux',
          amount: gross,
          debit: 0,
          credit: gross,
          status: p.status || 'paid',
          userLabel: '',
          source: 'payment',
          sourceId: p.id,
          payment: p,
        });
      }
      const av = Math.min(Number(p.avances) || 0, gross);
      if (av > 0) {
        rows.push({
          id: `pay-av-${p.id}`,
          date: p.paymentDate || p.created_at,
          type: 'consommation_avance',
          typeLabel: TYPE_LABEL.consommation_avance,
          projectId: p.projectId || '',
          projectName: p.projectName || '',
          reference: p.reference || '',
          label: 'Consommation d’avance',
          amount: av,
          debit: av,
          credit: 0,
          status: '',
          userLabel: '',
          source: 'payment',
          sourceId: p.id,
          payment: p,
        });
      }
      const ret = Number(p.retenues) || 0;
      if (ret > 0) {
        rows.push({
          id: `pay-ret-${p.id}`,
          date: p.paymentDate || p.created_at,
          type: 'retenue',
          typeLabel: TYPE_LABEL.retenue,
          projectId: p.projectId || '',
          projectName: p.projectName || '',
          reference: p.reference || '',
          label: 'Retenue',
          amount: ret,
          debit: ret,
          credit: 0,
          status: '',
          userLabel: '',
          source: 'payment',
          sourceId: p.id,
          payment: p,
        });
      }
      const net = Number(p.amount) || 0;
      if (net > 0 && (p.status || 'paid') === 'paid') {
        rows.push({
          id: `pay-n-${p.id}`,
          date: p.paymentDate || p.created_at,
          type: 'paiement',
          typeLabel: TYPE_LABEL.paiement,
          projectId: p.projectId || '',
          projectName: p.projectName || '',
          reference: p.reference || '',
          label: p.description || 'Paiement net',
          amount: net,
          debit: net,
          credit: 0,
          status: 'Payé',
          userLabel: '',
          source: 'payment',
          sourceId: p.id,
          payment: p,
        });
      }
    });
  }

  // Imputations standalone (évite doublons si déjà sur situations)
  if (!situations?.length) {
    (imputations || []).forEach((i) => {
      rows.push({
        id: `imp-${i.id}`,
        date: i.imputationDate || i.created_at,
        type: 'consommation_avance',
        typeLabel: TYPE_LABEL.consommation_avance,
        projectId: i.projectId || '',
        projectName: i.projectName || '',
        reference: '',
        label: i.observation || 'Imputation d’avance',
        amount: Number(i.amount) || 0,
        debit: Number(i.amount) || 0,
        credit: 0,
        status: '',
        userLabel: '',
        source: 'imputation',
        sourceId: i.id,
      });
    });
  }

  (events || []).forEach((e) => {
    if (['payment', 'advance', 'advance_imputed', 'retention', 'situation_created'].includes(e.type)) return;
    rows.push({
      id: `evt-${e.id}`,
      date: e.date,
      type: 'regularisation',
      typeLabel: e.typeLabel || TYPE_LABEL.regularisation,
      projectId: e.projectId || '',
      projectName: e.projectLabel || '',
      reference: e.reference || '',
      label: e.observation || e.typeLabel || 'Événement',
      amount: Number(e.amount) || 0,
      debit: 0,
      credit: 0,
      status: '',
      userLabel: e.userLabel || '',
      source: 'event',
      sourceId: e.id,
    });
  });

  const sorted = rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let balance = 0;
  return sorted.map((r) => {
    balance = round2(balance + (Number(r.credit) || 0) - (Number(r.debit) || 0));
    return { ...r, balanceAfter: balance };
  });
}

export function filterLedger(rows, {
  q = '',
  projectId = '',
  type = '',
  status = '',
  dateFrom = '',
  dateTo = '',
  amountMin = '',
  amountMax = '',
} = {}) {
  const query = String(q || '').trim().toLowerCase();
  const min = amountMin === '' || amountMin == null ? null : Number(amountMin);
  const max = amountMax === '' || amountMax == null ? null : Number(amountMax);
  return (rows || []).filter((r) => {
    if (projectId && String(r.projectId) !== String(projectId)) return false;
    if (type && r.type !== type) return false;
    if (status && !(r.status || '').toLowerCase().includes(String(status).toLowerCase())) return false;
    if (dateFrom && String(r.date || '').slice(0, 10) < dateFrom) return false;
    if (dateTo && String(r.date || '').slice(0, 10) > dateTo) return false;
    const amt = Number(r.amount) || 0;
    if (min != null && !Number.isNaN(min) && amt < min) return false;
    if (max != null && !Number.isNaN(max) && amt > max) return false;
    if (query) {
      const hay = `${r.label} ${r.reference} ${r.projectName} ${r.typeLabel}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export { TYPE_LABEL as LEDGER_TYPE_LABEL };
