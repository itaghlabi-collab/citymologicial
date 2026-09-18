/**
 * Tests fictifs — demandes de récupération logistique.
 * node src/services/logistique/pickupRequests.test.js
 * Aucune écriture en production.
 */
import {
  buildPickupRequest,
  confirmPickupRecovery,
  assignPickup,
  cancelPickup,
  remainingQty,
  isPickupFullyRecovered,
  findActiveLinkedToBon,
  linesFromBonSnapshot,
  filterPickupRequests,
  nextPickupRef,
  isPickupDriverPoste,
  filterPickupDriverEmployees,
  assertPickupAssigneeAllowed,
} from './pickupRequests.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function close(a, b, msg) {
  assert(Math.abs(Number(a) - Number(b)) < 0.001, msg || `${a} !== ${b}`);
}

const user = { id: 'u1', prenom: 'Imane', nom: 'Test' };

const sansBon = buildPickupRequest({
  demandeur_nom: 'Imane Test',
  destination: 'Chantier Nord',
  lieu_recuperation: 'Dépôt central',
  date_souhaitee: '2026-09-20',
  priorite: 'normale',
  observations: 'Récupération outils',
  lines: [
    { designation: 'Perceuse', unite: 'U', qty_to_recover: 2 },
    { designation: 'Câble', unite: 'm', qty_to_recover: 10 },
  ],
}, { existing: [], user });

assert(sansBon.statut === 'a_organiser', 'création sans bon → à organiser');
assert(sansBon.demandeur_nom === 'Imane Test', 'demandeur auto');
assert(sansBon.lines.length === 2, 'lignes libres conservées');
assert(!sansBon.bon_id, 'sans bon lié');

const bon = {
  id: 'bon-1',
  ref: 'BP-2026-0042',
  project_name: 'Résidence Atlas',
  lines: [
    { article_name: 'Ciment', unite: 'sac', quantite_demandee: 20, quantite_preparee: 15, emplacement_source: 'A1' },
    { article_name: 'Sable', unite: 'm3', quantite_demandee: 4, quantite_preparee: 4, emplacement_source: 'A1' },
  ],
};
const fromBonLines = linesFromBonSnapshot(bon);
close(fromBonLines[0].qty_to_recover, 15, 'qté à récupérer = préparée si > 0');
close(fromBonLines[0].qty_demandee_bon, 20, 'qté demandée du bon conservée');
close(fromBonLines[0].qty_preparee_bon, 15, 'qté préparée du bon conservée');

const avecBon = buildPickupRequest({
  ...sansBon,
  id: undefined,
  ref: undefined,
  bon_id: bon.id,
  bon_ref: bon.ref,
  destination: bon.project_name,
  lieu_recuperation: 'A1',
  lines: fromBonLines,
}, { existing: [sansBon], user });

assert(avecBon.ref !== sansBon.ref, 'référence distincte');
assert(avecBon.bon_ref === 'BP-2026-0042', 'réf bon reprise');

const activeDupes = findActiveLinkedToBon([avecBon, sansBon], 'bon-1');
assert(activeDupes.length === 1, 'doublon actif signalé');

const chauffeur = { id: 'e1', firstname: 'Karim', lastname: 'Naji', poste: 'Chauffeur' };
const assigned = assignPickup(avecBon, { assignee_name: 'Karim', assignee_id: 'e1', vehicle_label: 'WW-123' }, { employees: [chauffeur] });
assert(assigned.statut === 'planifiee', 'affectation → planifiée');
assert(assigned.assignee_name === 'Karim', 'responsable conservé');

const partial = confirmPickupRecovery(assigned, {
  quantities: { [assigned.lines[0].id]: 10, [assigned.lines[1].id]: 1 },
  actorName: 'Karim',
  dateEffective: '2026-09-21',
  notes: 'Premier passage',
});
assert(partial.statut === 'en_cours', 'partiel ≠ récupérée');
close(remainingQty(partial.lines[0]), 5, 'restant ciment 5');
close(remainingQty(partial.lines[1]), 3, 'restant sable 3');
assert(partial.recoveries.length === 1, 'événement conservé');

let blocked = false;
try {
  confirmPickupRecovery(partial, { quantities: { [partial.lines[0].id]: 99 }, actorName: 'Karim' });
} catch {
  blocked = true;
}
assert(blocked, 'quantité > restant refusée');

const full = confirmPickupRecovery(partial, {
  quantities: { [partial.lines[0].id]: 5, [partial.lines[1].id]: 3 },
  actorName: 'Karim',
  dateEffective: '2026-09-22',
});
assert(full.statut === 'recuperee', 'complet → récupérée');
assert(isPickupFullyRecovered(full), 'plus de restant');
assert(full.recoveries.length === 2, 'récupérations antérieures conservées');
assert(findActiveLinkedToBon([full], 'bon-1').length === 0, 'récupérée hors doublons actifs');

let double = false;
try {
  confirmPickupRecovery(full, { quantities: { [full.lines[0].id]: 1 }, actorName: 'Karim' });
} catch {
  double = true;
}
assert(double, 'double confirmation refusée');

const cancelled = cancelPickup(buildPickupRequest({
  destination: 'X',
  lieu_recuperation: 'Y',
  lines: [{ designation: 'Seau', unite: 'U', qty_to_recover: 1 }],
}, { user }));
assert(cancelled.statut === 'annulee', 'annulation');

assert(nextPickupRef([{ ref: 'DL-2026-0003' }]).startsWith('DL-2026-'), 'ref année');
assert(filterPickupRequests([sansBon, avecBon], { search: 'atlas' }).length === 1, 'filtre chantier');

assert(isPickupDriverPoste('Chauffeur'), 'poste Chauffeur');
assert(isPickupDriverPoste('Coursier'), 'poste Coursier');
assert(isPickupDriverPoste('chauffeur-livreur'), 'chauffeur enregistré composé');
assert(!isPickupDriverPoste('Magasinier'), 'magasinier exclu');
assert(!isPickupDriverPoste(''), 'poste vide exclu');

const pool = [
  { id: 'c1', poste: 'Chauffeur', firstname: 'Ali' },
  { id: 'c2', poste: 'Coursier', firstname: 'Sara' },
  { id: 'm1', poste: 'Magasinier', firstname: 'Omar' },
];
assert(filterPickupDriverEmployees(pool).length === 2, 'liste restreinte chauffeur/coursier');
assert(filterPickupDriverEmployees(pool, { keepId: 'm1' }).some((e) => e.id === 'm1'), 'affectation historique conservée dans la liste');

let magasinierBlocked = false;
try {
  assertPickupAssigneeAllowed(pool[2], { allowEmpty: false });
} catch {
  magasinierBlocked = true;
}
assert(magasinierBlocked, 'enregistrement refuse un magasinier');
assertPickupAssigneeAllowed(null, { allowEmpty: true });
assertPickupAssigneeAllowed(pool[2], { keepId: 'm1' });

let createBlocked = false;
try {
  buildPickupRequest({
    destination: 'X',
    lieu_recuperation: 'Y',
    assignee_id: 'm1',
    assignee_name: 'Omar',
    lines: [{ designation: 'Seau', unite: 'U', qty_to_recover: 1 }],
  }, { user, employees: pool });
} catch {
  createBlocked = true;
}
assert(createBlocked, 'création refuse un poste hors chauffeur/coursier');

const kept = assignPickup(
  { ...sansBon, assignee_id: 'm1', assignee_name: 'Omar' },
  { assignee_id: 'm1', assignee_name: 'Omar' },
  { employees: pool },
);
assert(kept.assignee_id === 'm1', 'historique non chauffeur conservé à l’enregistrement');

console.log('pickupRequests.test.js OK');
