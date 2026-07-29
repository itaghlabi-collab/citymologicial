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
  isRejectedCinCandidate,
  parseDateToken,
  toWorkerForm,
} = require('../services/cnieGoogleParser');

describe('cnieGoogleParser', () => {
  it('normalise et valide un CIN (sans transformer un nom)', () => {
    assert.equal(normalizeCin('AB 123456'), 'AB123456');
    assert.equal(isValidCin('AB123456'), true);
    assert.equal(isValidCin('BE884115'), true);
    assert.equal(isValidCin('AB12'), false);
    // TAGHLABI ne doit PLUS devenir TA6181
    assert.equal(normalizeCin('TAGHLABI'), '');
    assert.equal(isRejectedCinCandidate('TAGHLABI', 'TA6181'), true);
    assert.equal(isRejectedCinCandidate('CAN413261', 'CA413261'), true);
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
        { text: 'N°', confidence: 0.9, bbox: [10, 900, 40, 920] },
        { text: 'AB123456', confidence: 0.95, bbox: [50, 900, 160, 920] },
        { text: 'VALABLE JUSQU AU 20.01.2030', confidence: 0.9, bbox: [10, 250, 260, 270] },
      ],
    };
    const back = {
      fullText: 'ADRESSE\n12 RUE EXEMPLE\nSEXE M\nNATIONALITE MAROCAINE',
      blocks: [
        { text: 'SEXE M', confidence: 0.9, bbox: [10, 80, 80, 100] },
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

  it('non-régression CIN : vrai CIN près de N° + faux CAN vertical + MRZ concordante', () => {
    // Structure anonymisée reproduisant le bug TAGHLABI→TA6181 / CAN→faux / BE884115 vrai
    const front = {
      fullText: [
        'ROYAUME DU MAROC',
        'CARTE NATIONALE D IDENTITE',
        'No',
        'BE884115',
        'IMANE',
        'TAGHLABI',
        'Née le',
        '08.04.1995',
        'à ANFA CASABLANCA ANFA',
        'CAN 413261',
        "Valable jusqu'au 13.11.2033",
      ].join('\n'),
      blocks: [
        { text: 'ROYAUME DU MAROC', confidence: 0.99, bbox: [95, 417, 416, 478] },
        { text: 'IMANE', confidence: 0.98, bbox: [435, 540, 519, 560] },
        { text: 'TAGHLABI', confidence: 0.97, bbox: [435, 607, 563, 626] }, // faux positif historique
        { text: 'Née le', confidence: 0.94, bbox: [436, 648, 488, 665] },
        { text: '08.04.1995', confidence: 0.98, bbox: [655, 643, 784, 661] },
        { text: 'à ANFA CASABLANCA ANFA', confidence: 0.95, bbox: [436, 719, 790, 741] },
        { text: 'CAN 413261', confidence: 0.97, bbox: [1049, 802, 1069, 926] }, // vertical droit
        { text: 'No', confidence: 0.76, bbox: [135, 960, 157, 975] },
        { text: 'BE884115', confidence: 0.97, bbox: [188, 954, 332, 975] }, // vrai CIN bas-gauche
        { text: "Valable jusqu'au 13.11.2033", confidence: 0.97, bbox: [646, 956, 1074, 982] },
      ],
    };
    const back = {
      fullText: [
        'رقم N BE884115',
        'N° état civil',
        'Sexe F',
        'IDMAROPI9VXW7<5BE884115<<<<<<<',
        '9504084F3311134MAR<<<<<<<<<<<6',
        'TAGHLABI<<IMANE<<<<<<<<<<<<<<<',
      ].join('\n'),
      blocks: [
        { text: 'رقم N BE884115', confidence: 0.96, bbox: [111, 338, 348, 363] },
        { text: 'Sexe F', confidence: 0.99, bbox: [875, 392, 944, 414] },
        {
          text: 'IDMAROPI9VXW7 < 5BE884115 <<<<<<< 9504084F3311134MAR <<<<<<<<<<< 6 TAGHLABI << IMANE <<<<<<<<<<<<<<<',
          confidence: 0.92,
          bbox: [142, 681, 998, 838],
        },
      ],
    };

    const fields = parseCnieFromVision(front, back);

    // Vrai CIN sélectionné
    assert.equal(fields.cin.value, 'BE884115');
    // Faux nom→CIN et CAN vertical rejetés
    assert.notEqual(fields.cin.value, 'TA6181');
    assert.notEqual(fields.cin.value, 'CA413261');
    assert.notEqual(fields.cin.value, 'CA1010101');
    // Concordance recto + MRZ → haute confiance
    assert.ok(fields.cin.confidence >= 0.9, `conf=${fields.cin.confidence}`);
    assert.equal(fields.cin.requires_manual_review, false);
    assert.match(fields.cin.source, /recto|mrz/);
    // Noms depuis MRZ (pas le label arabe)
    assert.equal(fields.nom.value, 'TAGHLABI');
    assert.equal(fields.prenom.value, 'IMANE');
  });

  it('n extrait pas un CIN depuis un document number MRZ seul', () => {
    const front = {
      fullText: 'ROYAUME DU MAROC',
      blocks: [],
    };
    const back = {
      fullText: 'IDMAROPI9VXW7<5BE884115<<<<<<<\n9504084F3311134MAR<<<<<<<<<<<6\nTAGHLABI<<IMANE<<<<<<<<<<<<<<<',
      blocks: [],
    };
    const fields = parseCnieFromVision(front, back);
    // CIN depuis optional data MRZ, mais sans croisement → review
    if (fields.cin.value) {
      assert.equal(fields.cin.value, 'BE884115');
      assert.notEqual(fields.cin.value, 'OPI9VXW7');
      assert.ok(fields.cin.requires_manual_review || fields.cin.confidence < 0.85);
    }
  });

  it('champs manquants restent null', () => {
    const fields = parseCnieFromVision({ fullText: 'ROYAUME DU MAROC', blocks: [] }, { fullText: '', blocks: [] });
    assert.equal(fields.cin.value, null);
    assert.equal(fields.nom.value, null);
    assert.equal(fields.cin.valid, false);
  });
});
