/**
 * cashSheetExport.js — Export Excel (CSV UTF-8) feuille de caisse
 */

function esc(v) {
  const s = String(v ?? '');
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCashSheetExcel({ year, month, transactions, totals }) {
  const rows = [
    ['Feuille de caisse', `${month}/${year}`],
    [],
    ['Solde initial', totals.soldeInitial],
    ['Alimentation caisse', totals.alimentation],
    ['Total entrées', totals.totalEntrees],
    ['Total sorties', totals.totalSorties],
    ['Solde caisse du mois', totals.soldeMois],
    [],
    ['Date', 'Client / Fournisseur', 'Description', 'Sortie de caisse', 'Entrée de caisse', 'Type paiement', 'Type opération'],
  ];

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

  const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feuille-caisse-${year}-${String(month).padStart(2, '0')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
