/**
 * financeDashboardData.js — Agrégations tableau de bord Finance (Supabase)
 */
import { computeCashTotals } from './financeTransactions';
import { resolveTransactionCategoryName } from './financeSync';

const SHORT_MONTHS = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const PENDING_CHARGE_STATUTS = ['Brouillon', 'En attente validation'];
const PENDING_ORDER_STATUTS = ['Brouillon', 'Soumis', 'En attente'];

const CATEGORY_COLORS = {
  Carburant: '#C62828',
  Chantier: '#1565C0',
  "Main d'œuvre": '#6A1B9A',
  'Main d oeuvre': '#6A1B9A',
  Administratif: '#455A64',
  Fournitures: '#E65100',
  Formation: '#00838F',
  Divers: '#757575',
  'Sous-traitance': '#7B1FA2',
  'Ordres de paiement': '#5E35B1',
  Charges: '#EF6C00',
};

export function prevMonth(year, month) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function inMonth(dateStr, year, month) {
  if (!dateStr) return false;
  const [y, m] = String(dateStr).slice(0, 10).split('-').map(Number);
  return y === year && m === month;
}

export function evolutionPct(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return ((c - p) / Math.abs(p)) * 100;
}

export function buildMonthlySeries(year, transactions, balances) {
  const balanceByMonth = Object.fromEntries((balances || []).map((b) => [b.mois, b]));
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const monthTxs = (transactions || []).filter((t) => inMonth(t.date, year, m) && t.statut !== 'Annulé');
    const totals = computeCashTotals(monthTxs, balanceByMonth[m] || null);
    return {
      month: m,
      label: SHORT_MONTHS[m],
      entrees: totals.totalEntrees,
      sorties: totals.totalSorties,
      solde: totals.soldeMois,
    };
  });
}

export function sparklineValues(monthlySeries, field, upToMonth, count = 6) {
  const slice = monthlySeries.filter((m) => m.month <= upToMonth).slice(-count);
  return slice.map((m) => m[field] || 0);
}

export function buildCategoryBreakdown(charges, transactions, categories, year, month) {
  const monthCharges = (charges || []).filter((c) => inMonth(c.date, year, month));
  const monthSorties = (transactions || []).filter(
    (t) => inMonth(t.date, year, month) && t.sens === 'sortie' && t.statut !== 'Annulé',
  );
  const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.nom]));

  const buckets = {};

  monthCharges.forEach((c) => {
    const key = (c.categorie || catMap[c.category_id] || 'Divers').trim() || 'Divers';
    buckets[key] = (buckets[key] || 0) + (Number(c.montant) || 0);
  });

  monthSorties.forEach((t) => {
    if (t.charge_id) return;
    const key = resolveTransactionCategoryName(t, catMap);
    buckets[key] = (buckets[key] || 0) + (Number(t.montant) || 0);
  });

  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  return Object.entries(buckets)
    .map(([label, value]) => ({
      label,
      value,
      pct: total ? Math.round((value / total) * 100) : 0,
      color: CATEGORY_COLORS[label] || CATEGORY_COLORS.Divers,
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildTopCharges(charges, transactions, categories, year, month, limit = 10) {
  const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.nom]));
  const monthCharges = (charges || []).filter((c) => inMonth(c.date, year, month));
  const monthSorties = (transactions || []).filter(
    (t) => inMonth(t.date, year, month) && t.sens === 'sortie' && t.statut !== 'Annulé' && !t.charge_id,
  );

  const fromCharges = monthCharges.map((c) => ({
    id: c.id,
    date: c.date,
    categorie: c.categorie || catMap[c.category_id] || 'Charge',
    libelle: c.libelle,
    montant: c.montant,
  }));

  const fromTransactions = monthSorties.map((t) => ({
    id: t.id,
    date: t.date,
    categorie: resolveTransactionCategoryName(t, catMap),
    libelle: t.description,
    montant: t.montant,
  }));

  return [...fromCharges, ...fromTransactions]
    .sort((a, b) => (Number(b.montant) || 0) - (Number(a.montant) || 0))
    .slice(0, limit);
}

export function buildRecentActivity(transactions, charges, orders, limit = 12) {
  const items = [];

  (transactions || []).forEach((t) => {
    if (t.statut === 'Annulé') return;
    items.push({
      id: `tx-${t.id}`,
      type: t.sens === 'entree' ? 'entree' : 'sortie',
      date: t.date,
      montant: t.montant,
      label: t.description || t.contrepartie || 'Opération caisse',
      responsable: t.contrepartie || '—',
      sortAt: t.date || t.created_at || '',
    });
  });

  (charges || []).slice(0, 20).forEach((c) => {
    items.push({
      id: `ch-${c.id}`,
      type: 'charge',
      date: c.date,
      montant: c.montant,
      label: c.libelle || 'Charge',
      responsable: c.validateur || c.fournisseur || '—',
      sortAt: c.date || c.created_at || '',
    });
  });

  (orders || []).slice(0, 20).forEach((o) => {
    items.push({
      id: `op-${o.id}`,
      type: 'ordre',
      date: o.date || o.date_prevue,
      montant: o.montant,
      label: o.motif || o.ref || 'Ordre de paiement',
      responsable: o.prepare_par || o.beneficiaire || '—',
      sortAt: o.date || o.date_prevue || o.created_at || '',
    });
  });

  return items
    .sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)))
    .slice(0, limit);
}

export function buildProjectIndicators(projects, charges) {
  const spentByProject = {};
  (charges || []).forEach((c) => {
    const key = c.project_id || c.projet_lie;
    if (!key) return;
    spentByProject[key] = (spentByProject[key] || 0) + (Number(c.montant) || 0);
  });

  return (projects || [])
    .map((p) => {
      const spentFromCharges = spentByProject[p.id] || spentByProject[p.nom] || 0;
      const depense = Math.max(spentFromCharges, Number(p.budget_consomme) || 0);
      const budget = Number(p.budget_estime) || 0;
      return {
        id: p.id,
        nom: p.nom || p.ref || 'Projet',
        budget,
        depense,
        reste: Math.max(0, budget - depense),
        pct: budget > 0 ? Math.min(100, (depense / budget) * 100) : 0,
      };
    })
    .filter((p) => p.budget > 0 || p.depense > 0)
    .sort((a, b) => b.depense - a.depense)
    .slice(0, 6);
}

export function sumPendingAmounts(charges, orders) {
  const chargesPendingAmount = (charges || [])
    .filter((c) => PENDING_CHARGE_STATUTS.includes(c.statut))
    .reduce((s, c) => s + (Number(c.montant) || 0), 0);

  const ordersPendingAmount = (orders || [])
    .filter((o) => PENDING_ORDER_STATUTS.includes(o.statut))
    .reduce((s, o) => s + (Number(o.montant) || 0), 0);

  return { chargesPendingAmount, ordersPendingAmount };
}

export function buildForecast({ soldeActuel, totalEntrees, year, month, chargesPendingAmount, ordersPendingAmount }) {
  const day = new Date().getDate();
  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const projectedEntrees = isCurrentMonth && day > 0
    ? (totalEntrees / day) * daysInMonth
    : totalEntrees;
  const entreesPrevues = Math.max(0, projectedEntrees - totalEntrees);

  const soldePrevisionnel = soldeActuel + entreesPrevues - chargesPendingAmount - ordersPendingAmount;

  return {
    soldeActuel,
    entreesPrevues,
    chargesPendingAmount,
    ordersPendingAmount,
    soldePrevisionnel,
  };
}

export function countPending(charges, orders) {
  const chargesEnAttente = (charges || []).filter((c) => PENDING_CHARGE_STATUTS.includes(c.statut)).length;
  const ordresAValider = (orders || []).filter((o) => PENDING_ORDER_STATUTS.includes(o.statut)).length;
  return { chargesEnAttente, ordresAValider };
}
