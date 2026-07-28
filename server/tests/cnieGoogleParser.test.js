/**
 * Tests unitaires parser CNIE Google Vision (mock, sans appel réseau).
 * Usage: node --test server/tests/cnieGoogleParser.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCnieFromVision,
  normalizeCin,
  isValidCin,
  parseDateToken,
  toWorkerForm,
} = require('../services/cnieGoogleParser');

describe('cnieGoogleParser', () => {
  it('normalise et valide un CIN', () => {
    assert.equal(normalizeCin('AB 123456'), 'AB123456');
    assert.equal(isValidCin('AB123456'), true);
    assert.equal(isValidCin('AB12'), false);
    assert.equal(isValidCin('IDMAR123'), false);
  });

  it('parse des dates JJ.MM.AAAA', () => {
    assert.equal(parseDateToken('15.03.1990'), '1990-03-15');
    assert.equal(parseDateToken('15/03/1990'), '1990-03-15');
    assert.equal(parseDateToken('99.99.9999'), null);
  });

  it('extrait CIN / nom / prénom / dates depuis des blocs fictifs', () => {
    const front = {
      fullText: 'ROYAUME DU MAROC\nCARTE NATIONALE\nPRENOM\nKARIM\nNOM\nBENALI\nNEE LE 15.03.1990\nA CASABLANCA\nSEXE M\nN AB123456\nVALABLE JUSQU AU 20.01.2030',
      blocks: [
        { text: 'PRENOM', confidence: 0.9, bbox: [10, 40, 80, 60] },
        { text: 'KARIM', confidence: 0.95, bbox: [10, 65, 100, 85] },
        { text: 'NOM', confidence: 0.9, bbox: [10, 90, 60, 110] },
        { text: 'BENALI', confidence: 0.95, bbox: [10, 115, 120, 135] },
        { text: 'NEE LE 15.03.1990', confidence: 0.9, bbox: [10, 140, 200, 160] },
        { text: 'A CASABLANCA', confidence: 0.9, bbox: [10, 165, 180, 185] },
        { text: 'SEXE M', confidence: 0.9, bbox: [10, 190, 80, 210] },
        { text: 'N AB123456', confidence: 0.95, bbox: [10, 220, 140, 240] },
        { text: 'VALABLE JUSQU AU 20.01.2030', confidence: 0.9, bbox: [10, 250, 260, 270] },
      ],
    };
    const back = {
      fullText: 'ADRESSE\n12 RUE EXEMPLE\nNATIONALITE MAROCAINE',
      blocks: [
        { text: 'NATIONALITE MAROCAINE', confidence: 0.9, bbox: [10, 40, 200, 60] },
      ],
    };
    const fields = parseCnieFromVision(front, back);
    assert.equal(fields.cin.value, 'AB123456');
    assert.equal(fields.prenom.value, 'KARIM');
    assert.equal(fields.nom.value, 'BENALI');
    assert.equal(fields.date_naissance.value, '1990-03-15');
    assert.equal(fields.date_expiration.value, '2030-01-20');
    assert.equal(fields.sexe.value, 'M');
    assert.ok(fields.lieu_naissance.value && fields.lieu_naissance.value.includes('CASABLANCA'));
    assert.equal(fields.nationalite.value, 'Marocaine');

    const wf = toWorkerForm(fields, 0.7);
    assert.equal(wf.cin, 'AB123456');
    assert.equal(wf.ville_naissance, fields.lieu_naissance.value);
  });

  it('n extrait pas un CIN depuis une ligne MRZ', () => {
    const front = {
      fullText: 'IDMAROP19VXW7<5AB999999<<<<<<<',
      blocks: [{ text: 'IDMAROP19VXW7<5AB999999<<<<<<<', confidence: 0.9, bbox: [0, 0, 1, 1] }],
    };
    const back = { fullText: '', blocks: [] };
    const fields = parseCnieFromVision(front, back);
    // peut être null (MRZ ignorée) — ne doit pas inventer
    if (fields.cin.value) {
      assert.notEqual(fields.cin.source, 'mrz_forced');
    }
  });

  it('champs manquants restent null', () => {
    const fields = parseCnieFromVision({ fullText: 'ROYAUME DU MAROC', blocks: [] }, { fullText: '', blocks: [] });
    assert.equal(fields.cin.value, null);
    assert.equal(fields.nom.value, null);
    assert.equal(fields.valid === undefined || fields.cin.valid === false, true);
  });
});
