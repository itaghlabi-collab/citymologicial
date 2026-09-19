/**
 * node src/services/finance/chargeCashDedupe.test.js
 */
import {
  chargeCashFingerprint,
  selectDuplicateChargeCashIds,
  selectDuplicateChargeRecordIds,
} from './chargeCashDedupe.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const afalah = (id, created_at, extra = {}) => ({
  id,
  date: '2026-09-19',
  source_type: 'charge',
  description: 'AFALAH NABIL',
  contrepartie: 'AFALAH NABIL',
  montant: 300,
  mode_paiement: 'Espèces',
  statut: 'Validé',
  created_at,
  source_id: extra.source_id || `chg-${id}`,
  charge_id: extra.charge_id || extra.source_id || `chg-${id}`,
});

{
  const rows = [
    afalah('1', '2026-09-19T10:00:00.000Z'),
    afalah('2', '2026-09-19T10:00:04.000Z'),
    afalah('3', '2026-09-19T10:00:08.000Z'),
    afalah('4', '2026-09-19T10:00:12.000Z'),
    {
      id: 'aide',
      date: '2026-09-19',
      source_type: 'charge',
      description: 'AIDE MEDICALE',
      contrepartie: '',
      montant: 1200,
      mode_paiement: 'Espèces',
      statut: 'Validé',
      created_at: '2026-09-19T10:01:00.000Z',
      source_id: 'chg-aide',
    },
    {
      id: 'alim',
      date: '2026-09-19',
      source_type: 'cash_funding',
      description: 'ALIMENTATION CAISSE SELIM',
      contrepartie: '',
      montant: 61275,
      mode_paiement: 'Espèces',
      statut: 'Validé',
      created_at: '2026-09-19T09:00:00.000Z',
    },
  ];
  const { keepIds, cancelIds, extraChargeIds } = selectDuplicateChargeCashIds(rows);
  assert(keepIds.includes('1'), 'garde la 1re AFALAH');
  assert(keepIds.includes('aide'), 'garde AIDE MEDICALE');
  assert(!keepIds.includes('alim'), 'ignore alimentation (pas une charge)');
  assert(cancelIds.sort().join(',') === '2,3,4', `annule les copies AFALAH, got ${cancelIds}`);
  assert(extraChargeIds.includes('chg-2'), 'annule la dépense jumelle chg-2');
  assert(!extraChargeIds.includes('chg-1'), 'ne touche pas la dépense conservée');
}

{
  const rows = [
    afalah('a', '2026-09-19T08:00:00.000Z', { source_id: 'same' }),
    afalah('b', '2026-09-19T18:00:00.000Z', { source_id: 'same' }),
  ];
  const { keepIds, cancelIds } = selectDuplicateChargeCashIds(rows);
  assert(keepIds.join(',') === 'a', 'une charge = une ligne caisse');
  assert(cancelIds.join(',') === 'b', 'copie même source_id annulée même à 10h d’écart');
}

{
  const rows = [
    afalah('morning', '2026-09-19T08:00:00.000Z'),
    afalah('evening', '2026-09-19T18:00:00.000Z'),
  ];
  const { keepIds, cancelIds } = selectDuplicateChargeCashIds(rows);
  assert(keepIds.sort().join(',') === 'evening,morning', 'deux paiements éloignés conservés');
  assert(cancelIds.length === 0, 'pas d’annulation hors fenêtre');
}

{
  assert(
    chargeCashFingerprint(afalah('x', '2026-09-19T10:00:00.000Z'))
      === chargeCashFingerprint({
        date_operation: '2026-09-19',
        description: 'AFALAH NABIL',
        contrepartie: 'AFALAH NABIL',
        montant: 300,
        mode_paiement: 'Espèces',
      }),
    'empreinte stable date / date_operation',
  );
}

{
  const charges = [
    { id: 'a1', libelle: 'AFALAH NABIL', montant: 300, date: '2026-09-19', projet_lie: 'UNITE', mode_paiement: 'Espèce', statut: 'Brouillon', created_at: '2026-09-19T10:00:00.000Z', ref: 'CHG-2026-1357' },
    { id: 'a2', libelle: 'AFALAH NABIL', montant: 300, date: '2026-09-19', projet_lie: 'UNITE', mode_paiement: 'Espèce', statut: 'Brouillon', created_at: '2026-09-19T10:00:05.000Z', ref: 'CHG-2026-1358' },
    { id: 'a3', libelle: 'AFALAH NABIL', montant: 300, date: '2026-09-19', projet_lie: 'UNITE', mode_paiement: 'Espèce', statut: 'Brouillon', created_at: '2026-09-19T10:00:08.000Z', ref: 'CHG-2026-1358' },
    { id: 'aide', libelle: 'AIDE MEDICALE', montant: 1200, date: '2026-09-19', projet_lie: '', mode_paiement: 'Espèce', statut: 'Brouillon', created_at: '2026-09-19T10:02:00.000Z', ref: 'CHG-2026-1364' },
    { id: 'rahhou', libelle: 'MOHAMED RAHHOU', montant: 810, date: '2026-09-19', projet_lie: 'UNITE', mode_paiement: 'Espèce', statut: 'Brouillon', created_at: '2026-09-19T10:03:00.000Z', ref: 'CHG-2026-1365' },
  ];
  const { cancelIds } = selectDuplicateChargeRecordIds(charges);
  assert(cancelIds.includes('a2') && cancelIds.includes('a3'), `annule copies AFALAH, got ${cancelIds}`);
  assert(!cancelIds.includes('a1'), 'garde la 1re AFALAH');
  assert(!cancelIds.includes('aide'), 'garde AIDE MEDICALE');
  assert(!cancelIds.includes('rahhou'), 'garde MOHAMED RAHHOU');
}

console.log('chargeCashDedupe.test.js ok');
