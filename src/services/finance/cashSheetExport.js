/**
 * cashSheetExport.js — Export Excel (CSV UTF-8) feuille de caisse
 */

function esc(v) {
  const s = String(v ?? '');
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pushTxRows(rows, transactions) {
  (transactions || []).forEach((t) => {
    rows.push([
      t.date,
      t.contrepartie,
      t.description,
      t.sens === 'sortie' ? t.montant : '',
      t.sens === 'entree' ? t.montant : '',
      t.mode_paiement,
      t.type_operation,
    ]);
  });
}

const TX_HEADER = ['Date', 'Client / Fournisseur', 'Description', 'Sortie de caisse', 'Entrée de caisse', 'Type paiement', 'Type opération'];

export function exportCashSheetExcel({
  year,
  month,
  transactions,
  historyTransactions,
  totals,
  periodLabel,
  filename,
  soldeLabel,
}) {
  const period = periodLabel || `${month}/${year}`;
  const rows = [
    ['Feuille de caisse', period],
    [],
    ['Reliquat', totals.soldeInitial],
    ['Alimentations / Entrées', totals.totalEntrees],
    ['Sorties', totals.totalSorties],
    [soldeLabel || 'Solde caisse', totals.soldeMois],
    [],
    ['Opérations comptabilisées'],
    TX_HEADER,
  ];

  const counted = transactions || [];
  if (counted.length) pushTxRows(rows, counted);
  else rows.push(['Aucune opération comptabilisée sur cette période.']);

  if ((historyTransactions || []).length) {
    rows.push([]);
    rows.push(['Historique', 'Hors calcul']);
    rows.push(TX_HEADER);
    pushTxRows(rows, historyTransactions);
  }

  const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename || `feuille-caisse-${year}-${String(month).padStart(2, '0')}`}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
