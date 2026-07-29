/**
 * Tests unitaires parser CNIE Google Vision (mock, sans appel réseau).
 * Données entièrement synthétiques — aucune CNIE réelle / carte de développement.
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
    assert.equal(isValidCin('XX998877'), true);
    assert.equal(isValidCin('AB12'), false);
    // Un nom tout-lettres ne devient jamais un CIN
    assert.equal(normalizeCin('NOMEXEMPLE'), '');
    assert.equal(isRejectedCinCandidate('NOMEXEMPLE', 'NO6131'), true);
    assert.equal(isRejectedCinCandidate('CAN413261', 'CA413261'), true);
    assert.equal(isRejectedCinCandidate('CA1010101', 'CA1010101'), true);
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
    // Structure synthétique : label N° + CIN + nom piège + CAN vertical + MRZ
    const trueCin = 'XX998877';
    const front = {
      fullText: [
        'ROYAUME DU MAROC',
        'CARTE NATIONALE D IDENTITE',
        'No',
        trueCin,
        'PRENOMEX',
        'NOMEXEMPLE',
        'Née le',
        '08.04.1995',
        'à VILLE TEST',
        'CAN 413261',
        "Valable jusqu'au 13.11.2033",
      ].join('\n'),
      blocks: [
        { text: 'ROYAUME DU MAROC', confidence: 0.99, bbox: [95, 417, 416, 478] },
        { text: 'PRENOMEX', confidence: 0.98, bbox: [435, 540, 519, 560] },
        { text: 'NOMEXEMPLE', confidence: 0.97, bbox: [435, 607, 563, 626] },
        { text: 'Née le', confidence: 0.94, bbox: [436, 648, 488, 665] },
        { text: '08.04.1995', confidence: 0.98, bbox: [655, 643, 784, 661] },
        { text: 'à VILLE TEST', confidence: 0.95, bbox: [436, 719, 790, 741] },
        { text: 'CAN 413261', confidence: 0.97, bbox: [1049, 802, 1069, 926] },
        { text: 'No', confidence: 0.76, bbox: [135, 960, 157, 975] },
        { text: trueCin, confidence: 0.97, bbox: [188, 954, 332, 975] },
        { text: "Valable jusqu'au 13.11.2033", confidence: 0.97, bbox: [646, 956, 1074, 982] },
      ],
    };
    const back = {
      fullText: [
        `رقم N ${trueCin}`,
        'N° état civil',
        'Sexe F',
        `IDMARABC1DEF2G<5${trueCin}<<<<<<<`,
        '9504084F3311134MAR<<<<<<<<<<<6',
        'NOMEXEMPLE<<PRENOMEX<<<<<<<<<<<<<<<',
      ].join('\n'),
      blocks: [
        { text: `رقم N ${trueCin}`, confidence: 0.96, bbox: [111, 338, 348, 363] },
        { text: 'Sexe F', confidence: 0.99, bbox: [875, 392, 944, 414] },
        {
          text: `IDMARABC1DEF2G < 5${trueCin} <<<<<<< 9504084F3311134MAR <<<<<<<<<<< 6 NOMEXEMPLE << PRENOMEX <<<<<<<<<<<<<<<`,
          confidence: 0.92,
          bbox: [142, 681, 998, 838],
        },
      ],
    };

    const fields = parseCnieFromVision(front, back);

    assert.equal(fields.cin.value, trueCin);
    assert.notEqual(fields.cin.value, 'NO6131');
    assert.notEqual(fields.cin.value, 'CA413261');
    assert.notEqual(fields.cin.value, 'CA1010101');
    assert.ok(fields.cin.confidence >= 0.9, `conf=${fields.cin.confidence}`);
    assert.equal(fields.cin.requires_manual_review, false);
    assert.match(fields.cin.source, /recto|mrz/);
    assert.equal(fields.nom.value, 'NOMEXEMPLE');
    assert.equal(fields.prenom.value, 'PRENOMEX');
  });

  it('n extrait pas un CIN depuis un document number MRZ seul', () => {
    const trueCin = 'XX998877';
    const front = {
      fullText: 'ROYAUME DU MAROC',
      blocks: [],
    };
    const back = {
      fullText: `IDMARABC1DEF2G<5${trueCin}<<<<<<<\n9504084F3311134MAR<<<<<<<<<<<6\nNOMEXEMPLE<<PRENOMEX<<<<<<<<<<<<<<<`,
      blocks: [],
    };
    const fields = parseCnieFromVision(front, back);
    if (fields.cin.value) {
      assert.equal(fields.cin.value, trueCin);
      assert.notEqual(fields.cin.value, 'ABC1DEF2G');
      assert.ok(fields.cin.requires_manual_review || fields.cin.confidence < 0.85);
    }
  });

  it('champs manquants restent null', () => {
    const fields = parseCnieFromVision({ fullText: 'ROYAUME DU MAROC', blocks: [] }, { fullText: '', blocks: [] });
    assert.equal(fields.cin.value, null);
    assert.equal(fields.nom.value, null);
    assert.equal(fields.cin.valid, false);
  });

  it('deux analyses indépendantes ne se contaminent pas', () => {
    const cardA = parseCnieFromVision(
      {
        fullText: 'No AA23456 PRENOM A NOM A',
        blocks: [
          { text: 'No', confidence: 0.9, bbox: [10, 900, 40, 920] },
          { text: 'AA23456', confidence: 0.95, bbox: [50, 900, 160, 920] },
          { text: 'PRENOMA', confidence: 0.9, bbox: [10, 100, 100, 120] },
          { text: 'NOMA', confidence: 0.9, bbox: [10, 130, 80, 150] },
        ],
      },
      {
        fullText: 'رقم N AA23456\nIDMARZZZ9YYY8X<5AA23456<<<<<<<\n9001011M3001011MAR<<<<<<<<<<<6\nNOMA<<PRENOMA<<<<<<<<<<<<<<<',
        blocks: [{ text: 'رقم N AA23456', confidence: 0.9, bbox: [10, 40, 200, 60] }],
      },
    );
    const cardB = parseCnieFromVision(
      {
        fullText: 'No BB78901 PRENOM B NOM B',
        blocks: [
          { text: 'No', confidence: 0.9, bbox: [10, 900, 40, 920] },
          { text: 'BB78901', confidence: 0.95, bbox: [50, 900, 160, 920] },
          { text: 'PRENOMB', confidence: 0.9, bbox: [10, 100, 100, 120] },
          { text: 'NOMB', confidence: 0.9, bbox: [10, 130, 80, 150] },
        ],
      },
      {
        fullText: 'رقم N BB78901\nIDMARQQQ1WWW2V<5BB78901<<<<<<<\n0102034F2901014MAR<<<<<<<<<<<6\nNOMB<<PRENOMB<<<<<<<<<<<<<<<',
        blocks: [{ text: 'رقم N BB78901', confidence: 0.9, bbox: [10, 40, 200, 60] }],
      },
    );
    assert.equal(cardA.cin.value, 'AA23456');
    assert.equal(cardB.cin.value, 'BB78901');
    assert.notEqual(cardA.cin.value, cardB.cin.value);
  });
});
