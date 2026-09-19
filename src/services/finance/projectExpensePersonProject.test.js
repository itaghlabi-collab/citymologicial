/**
 * node src/services/finance/projectExpensePersonProject.test.js
 *
 * AFALAH NABIL est une personne, pas un chantier.
 * La classification Dépenses par projet ne doit plus l'afficher comme projet.
 */
import {
  isPersonMisclassifiedAsProjectName,
  filterChantierProjectsForDepenses,
  displayChantierProjectName,
  isCountedProjectExpense,
  collapseDuplicatePersonProjectExpenses,
} from './projectExpenseRules.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  assert(isPersonMisclassifiedAsProjectName('AFALAH NABIL') === true, 'nom personne');
  assert(isPersonMisclassifiedAsProjectName('afalah  nabil') === true, 'casse / espaces');
  assert(isPersonMisclassifiedAsProjectName('PRJ-202609-0001 — AFALAH NABIL') === true, 'libellé ref — nom');
  assert(isPersonMisclassifiedAsProjectName('UNITE INDUSTRIELLE LONGOMETAL') === false, 'vrai projet');
  assert(isPersonMisclassifiedAsProjectName('MOHAMED RAHHOU') === false, 'autre personne non ciblée');
  assert(isPersonMisclassifiedAsProjectName('') === false, 'vide');
}

const unite = { id: 'u1', nom: 'UNITE INDUSTRIELLE LONGOMETAL', budget_approuve: 100000 };
const afalah = { id: 'p-afalah', nom: 'AFALAH NABIL', budget_approuve: 0 };

{
  const filtered = filterChantierProjectsForDepenses([unite, afalah]);
  assert(filtered.length === 1 && filtered[0].id === 'u1', 'liste projets sans AFALAH NABIL');
  assert(filtered.every((p) => p.nom !== 'AFALAH NABIL'), 'options de filtre sans AFALAH NABIL');
}

{
  assert(displayChantierProjectName({
    project_nom: 'AFALAH NABIL',
    project_name_raw: 'AFALAH NABIL',
  }) === '', 'colonne Projet masque le nom personne');
  assert(displayChantierProjectName({
    project_nom: 'UNITE INDUSTRIELLE LONGOMETAL',
    project_name_raw: 'AFALAH NABIL',
  }) === 'UNITE INDUSTRIELLE LONGOMETAL', 'garde le nom du chantier');
}

{
  const expenseUnite = {
    montant: 500,
    statut: 'payee',
    origine: 'charge_manuelle',
    source_type: 'finance_charge',
  };
  const expenseAfalahLine = {
    montant: 300,
    statut: 'payee',
    origine: 'charge_manuelle',
    source_type: 'finance_charge',
  };
  assert(isCountedProjectExpense(expenseUnite), 'dépense chantier toujours comptée');
  assert(isCountedProjectExpense(expenseAfalahLine), 'ligne AFALAH non supprimée des totaux');
}

{
  const copies = [
    { id: 'a5', element_depense: 'AFALAH NABIL', montant: 300, date_depense: '2026-09-19', project_id: 'u1', created_at: '2026-09-19T10:00:20.000Z', origine: 'charge_manuelle', statut: 'payee' },
    { id: 'a1', element_depense: 'AFALAH NABIL', montant: 300, date_depense: '2026-09-19', project_id: 'u1', created_at: '2026-09-19T10:00:00.000Z', origine: 'charge_manuelle', statut: 'payee' },
    { id: 'a2', element_depense: 'AFALAH NABIL', montant: 300, date_depense: '2026-09-19', project_id: 'u1', created_at: '2026-09-19T10:00:05.000Z', origine: 'charge_manuelle', statut: 'payee' },
    { id: 'carreleur', element_depense: 'REMUNERATION CARRELEUR ABDALALI NACHIT', montant: 1200, date_depense: '2026-09-19', project_id: 'u1', origine: 'charge_manuelle', statut: 'payee' },
  ];
  const collapsed = collapseDuplicatePersonProjectExpenses(copies);
  const afalahs = collapsed.filter((e) => e.element_depense === 'AFALAH NABIL');
  assert(afalahs.length === 1, `une seule ligne AFALAH, got ${afalahs.length}`);
  assert(afalahs[0].id === 'a1', 'garde la 1re copie');
  assert(afalahs[0].montant === 300, 'montant 300 conservé');
  assert(collapsed.some((e) => e.id === 'carreleur'), 'les autres dépenses restent');
}

{
  const later = collapseDuplicatePersonProjectExpenses([
    { id: 'd1', element_depense: 'AFALAH NABIL', montant: 300, date_depense: '2026-09-19', project_id: 'u1' },
    { id: 'd2', element_depense: 'AFALAH NABIL', montant: 300, date_depense: '2026-09-20', project_id: 'u1' },
  ]);
  assert(later.filter((e) => e.element_depense === 'AFALAH NABIL').length === 2, 'deux jours = deux lignes distinctes');
}

console.log('projectExpensePersonProject.test.js OK');
