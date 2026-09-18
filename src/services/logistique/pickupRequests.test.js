/**
 * Tests fictifs — formulaire logistique simplifié (5 champs).
 * node src/services/logistique/pickupRequests.test.js
 * Aucune écriture en production.
 */
import {
  buildPickupRequest,
  linesFromBonSnapshot,
  filterPickupRequests,
  pickupDepartureLabel,
  pickupDestinationLabel,
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
const chauffeur = { id: 'e1', firstname: 'Karim', lastname: 'Naji', poste: 'Chauffeur' };
const coursier = { id: 'e2', firstname: 'Sara', lastname: 'Bennani', poste: 'Coursier' };
const magasinier = { id: 'm1', firstname: 'Omar', lastname: 'Said', poste: 'Magasinier' };
const pool = [chauffeur, coursier, magasinier];

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
close(fromBonLines[0].qty_to_recover, 15, 'qté à récupérer = préparée');
close(fromBonLines[0].qty_demandee_bon, 20, 'qté demandée conservée');
close(fromBonLines[1].qty_preparee_bon, 4, 'qté préparée conservée');

const created = buildPickupRequest({
  bon_id: bon.id,
  bon_ref: bon.ref,
  bon_snapshot: bon,
  lines: fromBonLines,
  departure_project_id: 'p-dep',
  departure_project_name: 'Dépôt Casa',
  destination_project_id: 'p-dest',
  destination_project_name: 'Chantier Nord',
  assignee_id: 'e1',
  assignee_name: 'Karim Naji',
  receptionnaire_id: 'm1',
  receptionnaire_name: 'Omar Said',
}, { existing: [], user, employees: pool });

assert(created.demandeur_nom === 'Imane Test', 'demandeur auto');
assert(created.bon_ref === 'BP-2026-0042', 'bon lié');
assert(pickupDepartureLabel(created) === 'Dépôt Casa', 'départ');
assert(pickupDestinationLabel(created) === 'Chantier Nord', 'destination');
assert(created.assignee_name === 'Karim Naji', 'chauffeur');
assert(created.receptionnaire_name === 'Omar Said', 'réceptionnaire');
assert(created.lines.length === 2, 'articles du bon repris');

const edited = buildPickupRequest({
  ...created,
  destination_project_id: 'p-dest-2',
  destination_project_name: 'Chantier Sud',
}, { existing: [created], user, employees: pool, previous: created });
assert(edited.id === created.id, 'modification conserve l’id');
assert(edited.ref === created.ref, 'modification conserve la réf');
assert(edited.demandeur_nom === created.demandeur_nom, 'demandeur inchangé');
assert(pickupDestinationLabel(edited) === 'Chantier Sud', 'destination mise à jour');
assert(edited.lines.length === 2, 'lignes bon conservées');

let missingBon = false;
try {
  buildPickupRequest({
    departure_project_id: 'p-dep',
    departure_project_name: 'Dépôt',
    destination_project_id: 'p-dest',
    destination_project_name: 'Chantier',
    assignee_id: 'e1',
    receptionnaire_name: 'Omar',
    lines: [],
  }, { user, employees: pool });
} catch {
  missingBon = true;
}
assert(missingBon, 'bon obligatoire');

let magasinierBlocked = false;
try {
  buildPickupRequest({
    bon_id: bon.id,
    bon_ref: bon.ref,
    lines: fromBonLines,
    departure_project_id: 'p-dep',
    departure_project_name: 'Dépôt',
    destination_project_id: 'p-dest',
    destination_project_name: 'Chantier',
    assignee_id: 'm1',
    assignee_name: 'Omar',
    receptionnaire_name: 'Sara',
  }, { user, employees: pool });
} catch {
  magasinierBlocked = true;
}
assert(magasinierBlocked, 'magasinier refusé comme chauffeur');

assert(isPickupDriverPoste('Chauffeur') && isPickupDriverPoste('Coursier'), 'postes autorisés');
assert(!isPickupDriverPoste('Magasinier'), 'magasinier exclu de la liste');
assert(filterPickupDriverEmployees(pool).length === 2, 'liste chauffeur/coursier');
assertPickupAssigneeAllowed(null, { allowEmpty: true });

const kept = buildPickupRequest({
  bon_id: bon.id,
  bon_ref: bon.ref,
  lines: fromBonLines,
  departure_project_id: 'p-dep',
  departure_project_name: 'Dépôt Casa',
  destination_project_id: 'p-dest',
  destination_project_name: 'Chantier Nord',
  assignee_id: 'm1',
  assignee_name: 'Omar Said',
  receptionnaire_name: 'Sara',
}, { user, employees: pool, previous: { ...created, assignee_id: 'm1', assignee_name: 'Omar Said' } });
assert(kept.assignee_id === 'm1', 'affectation historique conservée');

assert(filterPickupRequests([created], { search: 'nord' }).length === 1, 'filtre destination');
assert(filterPickupRequests([created], { search: 'bp-2026' }).length === 1, 'filtre bon');

console.log('pickupRequests.test.js OK');
