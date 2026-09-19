/**
 * Tests — suivi des déplacements logistiques.
 * node src/services/logistique/pickupRequests.test.js
 * Aucune écriture en production.
 */
import {
  buildPickupRequest,
  applyTripReturn,
  filterPickupRequests,
  pickupDepartureLabel,
  pickupDestinationLabel,
  tripStatutValue,
  tripStatutMeta,
  motifLabel,
  normalizeTripRecord,
  collectLocationSuggestions,
  validatePickupCreate,
} from './pickupRequests.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const user = { id: 'u1', prenom: 'Imane', nom: 'Test' };
const chauffeur = { id: 'e1', firstname: 'Karim', lastname: 'Naji', poste: 'Chauffeur' };
const magasinier = { id: 'm1', firstname: 'Omar', lastname: 'Said', poste: 'Magasinier' };
const pool = [chauffeur, magasinier];

const baseForm = {
  date_deplacement: '2026-09-19',
  heure_depart: '08:30',
  vehicle_id: 'v1',
  vehicle_label: '12345-A-6 — Kangoo',
  assignee_id: 'e1',
  assignee_name: 'Karim Naji',
  departure_project_name: 'Dépôt Khyayta',
  destination_project_name: 'Chantier Nord',
  motif: 'transfert_materiel',
  observations: '',
};

const created = buildPickupRequest(baseForm, { existing: [], user, employees: pool });
assert(created.date_deplacement === '2026-09-19', 'date déplacement');
assert(created.heure_depart === '08:30', 'heure départ');
assert(created.vehicle_label.includes('Kangoo'), 'véhicule parc');
assert(created.assignee_name === 'Karim Naji', 'chauffeur');
assert(pickupDepartureLabel(created) === 'Dépôt Khyayta', 'départ');
assert(pickupDestinationLabel(created) === 'Chantier Nord', 'destination');
assert(created.motif === 'transfert_materiel', 'motif');
assert(!created.bon_id, 'bon absent hors motif bon');
assert(tripStatutValue(created) === 'en_deplacement', 'sans retour = en déplacement');
assert(tripStatutMeta(created).label === 'En déplacement', 'libellé statut');

const returned = applyTripReturn(created, '17:05');
assert(returned.heure_retour === '17:05', 'heure retour');
assert(tripStatutValue(returned) === 'retourne', 'avec retour = retourné');
assert(returned.id === created.id, 'retour conserve l’id');

const magasinierOk = buildPickupRequest({
  ...baseForm,
  assignee_id: 'm1',
  assignee_name: 'Omar Said',
}, { user, employees: pool });
assert(magasinierOk.assignee_id === 'm1', 'employé hors poste chauffeur accepté');

const withBon = buildPickupRequest({
  ...baseForm,
  motif: 'bon_preparation',
  bon_id: 'bon-1',
  bon_ref: 'BP-2026-0042',
}, { user, employees: pool });
assert(withBon.bon_ref === 'BP-2026-0042', 'bon lié si motif bon de préparation');

let missingBon = false;
try {
  buildPickupRequest({ ...baseForm, motif: 'bon_preparation' }, { user, employees: pool });
} catch {
  missingBon = true;
}
assert(missingBon, 'bon obligatoire seulement pour motif bon de préparation');

let missingDetails = false;
try {
  buildPickupRequest({ ...baseForm, motif: 'autre', observations: '' }, { user, employees: pool });
} catch {
  missingDetails = true;
}
assert(missingDetails, 'détails obligatoires si motif Autre');

const autre = buildPickupRequest({
  ...baseForm,
  motif: 'autre',
  observations: 'Livraison exceptionnelle',
}, { user, employees: pool });
assert(autre.observations === 'Livraison exceptionnelle', 'détails Autre');

const edited = buildPickupRequest({
  ...created,
  destination_project_name: 'Chantier Sud',
  heure_retour: '18:00',
}, { existing: [created], user, employees: pool, previous: created });
assert(edited.id === created.id, 'modification conserve l’id');
assert(edited.ref === created.ref, 'modification conserve la réf');
assert(pickupDestinationLabel(edited) === 'Chantier Sud', 'destination mise à jour');
assert(tripStatutValue(edited) === 'retourne', 'retour saisi à la modification');

const legacy = normalizeTripRecord({
  id: 'old-1',
  ref: 'DL-2026-0001',
  bon_id: 'bon-9',
  bon_ref: 'BP-OLD',
  departure_project_name: 'Dépôt Casa',
  destination_project_name: 'Résidence Atlas',
  assignee_name: 'Karim Naji',
  vehicle_label: '12345-A-6 — Kangoo',
  date_creation: '2026-08-01',
  created_at: '2026-08-01T07:15:00.000Z',
});
assert(legacy.motif === 'bon_preparation', 'ancien enregistrement conservé comme bon');
assert(legacy.date_deplacement === '2026-08-01', 'date héritée');
assert(legacy.heure_depart, 'heure héritée de created_at');
assert(tripStatutValue(legacy) === 'en_deplacement', 'ancien sans retour reste en déplacement');

assert(filterPickupRequests([created, returned], { statut: 'en_deplacement' }).length === 1, 'filtre statut');
assert(filterPickupRequests([created], { motif: 'transfert_materiel' }).length === 1, 'filtre motif');
assert(filterPickupRequests([created], { vehicle: 'kangoo' }).length === 1, 'filtre véhicule');
assert(filterPickupRequests([created], { chauffeur: 'karim' }).length === 1, 'filtre chauffeur');
assert(filterPickupRequests([created], { dateFrom: '2026-09-19', dateTo: '2026-09-19' }).length === 1, 'filtre période');
assert(filterPickupRequests([created], { dateFrom: '2026-09-20' }).length === 0, 'hors période');
assert(motifLabel('bon_preparation') === 'Bon de préparation', 'libellé motif');

const suggestions = collectLocationSuggestions([created], ['Siège']);
assert(suggestions.includes('Dépôt Khyayta'), 'suggestion départ existant');
assert(suggestions.includes('Siège'), 'suggestion lieu connu');

const v = validatePickupCreate({ ...baseForm, heure_depart: '' });
assert(!v.ok && v.errors.some((e) => /heure de départ/i.test(e)), 'heure départ obligatoire');

console.log('pickupRequests.test.js OK');
