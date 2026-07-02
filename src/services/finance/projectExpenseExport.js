/**
 * projectExpenseExport.js — Export Excel (CSV) dépenses par projet
 */
import { ORIGINE_LABELS } from './projectExpenses';

function esc(v) {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

export function exportProjectExpensesExcel({ project, expenses, filename }) {
  const header = [
    'Date', 'Origine', 'Élément', 'Description', 'Fournisseur',
    'Montant', 'Statut', 'Observation',
  ];
  const lines = [header.join(';')];
  (expenses || []).forEach((e) => {
    lines.push([
      e.date_depense,
      ORIGINE_LABELS[e.origine] || e.origine,
      e.element_depense,
      e.description,
      e.fournisseur,
      e.montant,
      e.statut,
      e.observation,
    ].map(esc).join(';'));
  });

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `Depenses_${project?.nom || 'projet'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAllProjectsExcel(summaries) {
  const header = [
    'Projet', 'Chef de projet', 'Budget', 'Total dépenses',
    'Montant commandé', 'Montant payé', 'Reste budget',
    'Nb dépenses', 'Nb fournisseurs', 'Statut',
  ];
  const lines = [header.join(';')];
  (summaries || []).forEach((p) => {
    lines.push([
      p.nom, p.chef_projet, p.budget_approuve, p.total_depenses,
      p.montant_commande, p.montant_paye, p.reste_budget ?? '',
      p.nb_depenses, p.nb_fournisseurs, p.statut,
    ].map(esc).join(';'));
  });
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Depenses_par_projet_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
