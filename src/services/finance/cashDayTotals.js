/**
 * cashDayTotals.js — Soldes journaliers dérivés du journal mensuel
 */
export function computeDailyCashTotals(monthRecords, balance, selectedDateIso) {
  const monthOpening = (Number(balance?.solde_initial) || 0) + (Number(balance?.alimentation) || 0);
  const active = (monthRecords || []).filter((t) => t.statut !== 'Annulé');
  const sorted = [...active].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let running = monthOpening;
  for (const t of sorted) {
    if (String(t.date) >= String(selectedDateIso)) break;
    if (t.sens === 'entree') running += Number(t.montant) || 0;
    else running -= Number(t.montant) || 0;
  }

  const dayTxs = sorted.filter((t) => t.date === selectedDateIso);
  let entreesJour = 0;
  let sortiesJour = 0;
  dayTxs.forEach((t) => {
    if (t.sens === 'entree') entreesJour += Number(t.montant) || 0;
    else sortiesJour += Number(t.montant) || 0;
  });

  const soldeDebutJournee = running;
  return {
    soldeDebutJournee,
    entreesJour,
    sortiesJour,
    soldeFinJournee: soldeDebutJournee + entreesJour - sortiesJour,
    dayCount: dayTxs.length,
  };
}

export function parseIsoParts(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function formatDateShortFr(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-MA');
}
