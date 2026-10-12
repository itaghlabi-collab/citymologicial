-- CITYMO — Devis CRM KITEA RABAT — LOT FLUIDES
-- Source : BORD DCE FLUIDES KITEA RABAT- 20-09-2026.xlsx
-- 6 lots, 101 articles — prix à 0 (à compléter dans l'ERP)
-- Unités : U → unite, E / F → forfait, ML → ml, m² → m2. Rubriques sans unité → sous-titres.
-- Lignes à quantité 0 dans le bordereau non reprises : 01.13.01 — 30 x 30 avec platine Ø 80; 02.03.01 — DN 19/6 (bureaux)
-- INSERT uniquement (aucun UPDATE / DELETE). Le client KITEA RABAT n'est créé que s'il n'existe pas.
-- Le devis n'est créé que s'il n'existe pas déjà (même titre, même client).

DO $$
DECLARE
  cid     UUID;
  did     UUID;
  maxnum  INT;
  ref     TEXT;
BEGIN
  SELECT id INTO cid FROM public.clients
  WHERE lower(trim(nom)) = 'kitea rabat' AND coalesce(trim(prenom), '') = ''
  LIMIT 1;

  IF cid IS NULL THEN
    INSERT INTO public.clients (nom, ville, statut)
    VALUES ('KITEA RABAT', 'RABAT', 'actif')
    RETURNING id INTO cid;
    RAISE NOTICE 'Client KITEA RABAT créé.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.crm_devis WHERE client_id = cid AND titre = 'PROJET KITEA RABAT - LOT FLUIDES') THEN
    RAISE NOTICE 'Devis LOT FLUIDES déjà existant — aucune modification.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX((regexp_match(reference, '^PR-2026-10-(\d+)$'))[1]::INT), 0) INTO maxnum
  FROM public.crm_devis WHERE reference LIKE 'PR-2026-10-%';
  ref := 'PR-2026-10-' || lpad((maxnum + 1)::TEXT, 4, '0');

  INSERT INTO public.crm_devis (reference, titre, statut, date_creation, date_validite, client_id, total_ht, total_tva, total_ttc)
  VALUES (ref, 'PROJET KITEA RABAT - LOT FLUIDES', 'brouillon', DATE '2026-10-12', DATE '2026-11-11', cid, 0, 0, 0)
  RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    article_id, categorie_id, quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 0, 'titre', 'A.01 — PLOMBERIE SANITAIRE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 1, 'article', '1.01 — BRANCHEMENT EAU POTABLE', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 2, 'sous_titre', '1.02 — EQUIPEMENT COMPTEURS EAU', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 3, 'article', '01.02.01 — Compteur eau calibre 20 (KETIA)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 4, 'sous_titre', '1.03 — TUBE POLYPROPYLÈNE PN 20', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 5, 'article', '01.03.01 — Ø 32 intérieur', NULL, NULL, NULL, 130, 'ml', 0, 0, 20, 0),
  (did, 6, 'article', '01.03.02 — Ø 25 intérieur', NULL, NULL, NULL, 20, 'ml', 0, 0, 20, 0),
  (did, 7, 'article', '01.03.03 — Ø 20 intérieur', NULL, NULL, NULL, 20, 'ml', 0, 0, 20, 0),
  (did, 8, 'article', '01.03.04 — Ø 16 intérieur', NULL, NULL, NULL, 40, 'ml', 0, 0, 20, 0),
  (did, 9, 'sous_titre', '1.04 — ROBINET D''ISOLEMENT PPR', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 10, 'article', '01.04.01 — Ø 32', NULL, NULL, NULL, 6, 'unite', 0, 0, 20, 0),
  (did, 11, 'article', '01.04.02 — Ø 25', NULL, NULL, NULL, 6, 'unite', 0, 0, 20, 0),
  (did, 12, 'article', '01.04.03 — Ø 20', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 13, 'article', '01.04.04 — Ø 15', NULL, NULL, NULL, 8, 'unite', 0, 0, 20, 0),
  (did, 14, 'article', '1.05 — LAVABO SUR COLONNE (Pose)', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 15, 'article', '1.06 — W-C A L''ANGLAISE A RESERVOIR (Pose)', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 16, 'article', '1.07 — ÉVIER EN ACIER INOXYDABLE (Pose)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 17, 'article', '1.08 — ANTI – BELIER', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 18, 'sous_titre', '1.09 — RÉDUCTEUR DE PRESSION', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 19, 'article', '01.09.01 — DN 32', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 20, 'article', '01.09.02 — DN 40', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 21, 'sous_titre', '1.10 — CHAUFFE EAU ELECTRIQUE ÉMAILLÉ', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 22, 'article', '01.10.01 — Chauffe eau 50 litres', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 23, 'sous_titre', '1.11 — CHUTES ET COLLECTEURS', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 24, 'sous_titre', '01.11.01 — TUBE EN PVC', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 25, 'article', '01.11.01.01 — Ø 75', NULL, NULL, NULL, 18, 'ml', 0, 0, 20, 0),
  (did, 26, 'article', '01.11.01.02 — Ø 110', NULL, NULL, NULL, 30, 'ml', 0, 0, 20, 0),
  (did, 27, 'article', '01.11.01.03 — Ø 125', NULL, NULL, NULL, 12, 'ml', 0, 0, 20, 0),
  (did, 28, 'sous_titre', '01.11.02 — TUBE EN FONTE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 29, 'article', '01.011.02.01 — Ø 80', NULL, NULL, NULL, 12, 'ml', 0, 0, 20, 0),
  (did, 30, 'article', '1.12 — TUBE EN PVC Ø = 40 à 50 mm', NULL, NULL, NULL, 18, 'ml', 0, 0, 20, 0),
  (did, 31, 'sous_titre', '1.13 — SIPHON DE SOL EN LAITON', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 32, 'titre', 'A.02 — SECURITE INCENDIE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 33, 'article', '2.01 — BRANCHEMENT EAU INCENDIE', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 34, 'sous_titre', '2.02 — RESEAUX INCENDIE EN T.A.G.', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 35, 'article', '02.02.01 — Ø 80/90', NULL, NULL, NULL, 198, 'ml', 0, 0, 20, 0),
  (did, 36, 'article', '02.02.02 — Ø 66/76', NULL, NULL, NULL, 155, 'ml', 0, 0, 20, 0),
  (did, 37, 'article', '02.02.03 — Ø 40/49 à Ø 50/60', NULL, NULL, NULL, 280, 'ml', 0, 0, 20, 0),
  (did, 38, 'sous_titre', '2.03 — POSTE ROBINET INCENDIE ARME', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 39, 'article', '02.03.02 — DN 25/8 (hall de vente, galerie marchande)', NULL, NULL, NULL, 20, 'forfait', 0, 0, 20, 0),
  (did, 40, 'article', '02.03.03 — DN 33/12 (réserves)', NULL, NULL, NULL, 2, 'forfait', 0, 0, 20, 0),
  (did, 41, 'article', '2.04 — VANNE D''ISOLEMENT', NULL, NULL, NULL, 22, 'forfait', 0, 0, 20, 0),
  (did, 42, 'sous_titre', '2.05 — EXTINCTEURS PORTATIFS', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 43, 'article', '02.05.01 — Extincteur à Eau pulvérisée 6 litres', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 44, 'article', '02.05.02 — Extincteur à poudre polyvalente (ABC) de 9 kg', NULL, NULL, NULL, 33, 'unite', 0, 0, 20, 0),
  (did, 45, 'article', '02.05.03 — Extincteur à C02 de 2 kg', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 46, 'article', '02.05.04 — Extincteur à C02 de 6 kg', NULL, NULL, NULL, 3, 'unite', 0, 0, 20, 0),
  (did, 47, 'titre', 'A.03 — CLIMATISATION VMC', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 48, 'sous_titre', '3.01 — SPLIT SYSTÈME GAINABLE INVERTER', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 49, 'article', '03.01.01 — Puissance frigorifique 12.60 KwF', NULL, NULL, NULL, 6, 'unite', 0, 0, 20, 0),
  (did, 50, 'article', '03.01.02 — Puissance frigorifique 17.00 KwF', NULL, NULL, NULL, 65, 'unite', 0, 0, 20, 0),
  (did, 51, 'sous_titre', '3.02 — GAINES CIRCULAIRES TEXTILE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 52, 'article', '03.02.01 — Ø 400 à Ø 510', NULL, NULL, NULL, 616, 'ml', 0, 0, 20, 0),
  (did, 53, 'article', '3.03 — GAINE REGTANGULAIRE PRE--ISOLEE', NULL, NULL, NULL, 190, 'm2', 0, 0, 20, 0),
  (did, 54, 'sous_titre', '3.04 — FLEXIBLE CALORIFUGEE Ø 200 A Ø 250', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 55, 'article', '03.04.01 — Ø 200 A Ø 250', NULL, NULL, NULL, 100, 'ml', 0, 0, 20, 0),
  (did, 56, 'article', '3.05 — GAINE EN TÔLE GALVANISEE', NULL, NULL, NULL, 544, 'm2', 0, 0, 20, 0),
  (did, 57, 'sous_titre', '3.06 — GAINES CIRCULAIRES', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 58, 'article', '03.06.01 — Ø 100 à Ø 315', NULL, NULL, NULL, 352, 'ml', 0, 0, 20, 0),
  (did, 59, 'article', '03.06.02 — Ø 300 à Ø 550', NULL, NULL, NULL, 120, 'ml', 0, 0, 20, 0),
  (did, 60, 'article', '03.06.03 — Ø 630', NULL, NULL, NULL, 395, 'ml', 0, 0, 20, 0),
  (did, 61, 'sous_titre', '3.07 — DIFFUSEUR DE SOUFFLAGE CARRE OU CIRCULAIRE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 62, 'article', '03.07.01 — Débit 200 à 600 m³/h', NULL, NULL, NULL, 60, 'unite', 0, 0, 20, 0),
  (did, 63, 'article', '03.07.02 — Débit 650 à 1000 m³/h', NULL, NULL, NULL, 265, 'unite', 0, 0, 20, 0),
  (did, 64, 'article', '03.07.03 — Débit 1100 à 2000 m³/h', NULL, NULL, NULL, 22, 'unite', 0, 0, 20, 0),
  (did, 65, 'article', '3.08 — GRILLE DE TRANSFERT 500 x 150', NULL, NULL, NULL, 6, 'unite', 0, 0, 20, 0),
  (did, 66, 'article', '3.09 — RÉGULATEUR DE DÉBIT POUR GAINE', NULL, NULL, NULL, 6, 'unite', 0, 0, 20, 0),
  (did, 67, 'sous_titre', '3.10 — GRILLE EXTÉRIEURE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 68, 'article', '03.10.01 — 4000 m³/h à 5000 m³/h', NULL, NULL, NULL, 6, 'unite', 0, 0, 20, 0),
  (did, 69, 'sous_titre', '3.11 — VOLET DE RÉGLAGE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 70, 'article', '03.11.01 — Ø 250 à Ø 315', NULL, NULL, NULL, 32, 'unite', 0, 0, 20, 0),
  (did, 71, 'article', '03.11.02 — Ø 100 à Ø 200', NULL, NULL, NULL, 75, 'unite', 0, 0, 20, 0),
  (did, 72, 'article', '3.12 — ATTENTE ÉVACUATION CONDENSÂT', NULL, NULL, NULL, 740, 'ml', 0, 0, 20, 0),
  (did, 73, 'sous_titre', '3.13 — CAISSON AIR NEUF', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 74, 'article', '03.13.02 — 1500 à 2000', NULL, NULL, NULL, 9, 'forfait', 0, 0, 20, 0),
  (did, 75, 'article', '03.13.03 — 2500 à 4000 m³/h', NULL, NULL, NULL, 4, 'forfait', 0, 0, 20, 0),
  (did, 76, 'sous_titre', '3.14 — CAISSON EXTRACTION ET VMC', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 77, 'article', '03.14.01 — 600 à 1000 m³/h', NULL, NULL, NULL, 5, 'forfait', 0, 0, 20, 0),
  (did, 78, 'article', '03.14.02 — 1200 à 2000 m³/h', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 79, 'article', '03.14.03 — 2200 à 4000 m³/h', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 80, 'article', '3.15 — BOUCHE VMC AUTO RÉGLABLE', NULL, NULL, NULL, 17, 'unite', 0, 0, 20, 0),
  (did, 81, 'sous_titre', '3.16 — SPLIT SYSTÈME MURAL', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 82, 'article', '03.16.01 — 3 kW F', NULL, NULL, NULL, 2, 'forfait', 0, 0, 20, 0),
  (did, 83, 'article', '03.16.02 — 5 kW F', NULL, NULL, NULL, 4, 'forfait', 0, 0, 20, 0),
  (did, 84, 'sous_titre', 'UNITE EXTERIEURE DRV', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 85, 'article', 'Puissance Frigorifique : 28 KW', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 86, 'sous_titre', 'UNITE INTERIEURE DRV', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 87, 'sous_titre', 'Gainable', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 88, 'article', 'Puissance Frigorifique : 2,8 KW', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 89, 'article', 'Puissance Frigorifique : 5,6 KW', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 90, 'sous_titre', 'Cassette', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 91, 'article', 'Puissance Frigorifique : 3,6 KW', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 92, 'article', 'PLÉNUM DE SOUFFLAGE', NULL, NULL, NULL, 65, 'unite', 0, 0, 20, 0),
  (did, 93, 'sous_titre', '3.17 — RACCORDEMENT ÉLECTRIQUE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 94, 'article', '03.17.01 — a) Tableau et Raccordement électrique Climatisations Unités extérieures et intérieures hall de vente', NULL, NULL, NULL, 2, 'forfait', 0, 0, 20, 0),
  (did, 95, 'article', '03.17.02 — Tableau et Raccordement électrique Caissons de ventilation.', NULL, NULL, NULL, 2, 'forfait', 0, 0, 20, 0),
  (did, 96, 'article', '3.18 — REPÉRAGE', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 97, 'titre', 'A.04 — DESENFUMAGE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 98, 'sous_titre', '4.01 — CAISSON D''EXTRACTION DESENFUMAGE A DEUX VITESSES', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 99, 'article', '04.01.01 — Débit d’air de 34 000 m3/h / 68 000 m3/h à HMT appropriée', NULL, NULL, NULL, 6, 'forfait', 0, 0, 20, 0),
  (did, 100, 'sous_titre', '4.02 — CAISSON AIR NEUF DE DESENFUMAGE A DEUX VITESSES', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 101, 'article', '04.02.01 — Débit d’air de 41 000 m3/h / 82 000 m3/h à HMT appropriée', NULL, NULL, NULL, 3, 'forfait', 0, 0, 20, 0),
  (did, 102, 'sous_titre', 'VENTILATEURS HELICOÏDAUX TYPE DESENFUMAGE A DEUX VITESSES', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 103, 'sous_titre', 'EXTRACTION', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 104, 'article', 'Débit : 9500 m3/h / 19 000 m3/h', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 105, 'article', 'Débit : 20 000 m3/h / 40 000 m3/h', NULL, NULL, NULL, 7, 'unite', 0, 0, 20, 0),
  (did, 106, 'article', 'Débit : 30 000 m3/h / 60 000 m3/h', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 107, 'sous_titre', 'AIR NEUF', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 108, 'article', 'Débit : 9000 m3/h / 18 000 m3/h', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 109, 'article', 'Débit : 17 000 m3/h / 34 000 m3/h', NULL, NULL, NULL, 7, 'unite', 0, 0, 20, 0),
  (did, 110, 'article', 'Débit : 25 000 m3/h / 50 000 m3/h', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 111, 'article', '4.03 — COFFRET DE RELAYAGE', NULL, NULL, NULL, 33, 'unite', 0, 0, 20, 0),
  (did, 112, 'article', '4.04 — CLAPET COUPE-FEU', NULL, NULL, NULL, 10, 'unite', 0, 0, 20, 0),
  (did, 113, 'article', '4.05 — GAINE EN STAFF 4 CM', NULL, NULL, NULL, 1200, 'm2', 0, 0, 20, 0),
  (did, 114, 'article', '4.06 — GAINE EN TOLE GALVANISEE', NULL, NULL, NULL, 300, 'm2', 0, 0, 20, 0),
  (did, 115, 'article', '4.07 — CALFEUTREMENT GAINES TECHNIQUES', NULL, NULL, NULL, 40, 'm2', 0, 0, 20, 0),
  (did, 116, 'sous_titre', '4.08 — COFFRET ET CÂBLAGE ÉLECTRIQUE DÉSENFUMAGE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 117, 'article', '04.08.01 — Désenfumage HALL DE VENTE (RDC)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 118, 'article', 'Désenfumage HALL DE VENTE (R+1)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 119, 'article', '04.08.02 — Désenfumage STOCK', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 120, 'titre', 'A.05 — SPRINKLAGE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 121, 'article', '5.01 — TETES SPRINKLEURS (DN15 à DN20)', NULL, NULL, NULL, 750, 'unite', 0, 0, 20, 0),
  (did, 122, 'sous_titre', '5.02 — RESEAU HYDRAULIQUE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 123, 'sous_titre', '05.02.01 — Tuyauteries', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 124, 'article', '05.02.01.01 — Ø 150', NULL, NULL, NULL, 280, 'ml', 0, 0, 20, 0),
  (did, 125, 'article', '05.02.01.01 — Ø 102/114', NULL, NULL, NULL, 350, 'ml', 0, 0, 20, 0),
  (did, 126, 'article', '05.02.01.02 — Ø 66/76', NULL, NULL, NULL, 126, 'ml', 0, 0, 20, 0),
  (did, 127, 'article', '05.02.01.03 — Ø 50/60', NULL, NULL, NULL, 1450, 'ml', 0, 0, 20, 0),
  (did, 128, 'article', '05.02.01.04 — Ø 40/49', NULL, NULL, NULL, 650, 'ml', 0, 0, 20, 0),
  (did, 129, 'article', '05.02.01.05 — Ø 33/42', NULL, NULL, NULL, 620, 'ml', 0, 0, 20, 0),
  (did, 130, 'article', '05.02.01.06 — Ø 26/32', NULL, NULL, NULL, 900, 'ml', 0, 0, 20, 0),
  (did, 131, 'sous_titre', '05.02.02 — Raccords VICTAULIC', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 132, 'article', '05.02.02.01 — zone Hall de Vente', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 133, 'article', '05.02.02.02 — zone Bureaux', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 134, 'article', '05.02.02.03 — zone réserves', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 135, 'article', '5.03 — VIDANGES ET POINT F', NULL, NULL, NULL, 3, 'forfait', 0, 0, 20, 0),
  (did, 136, 'article', '5.04 — ARMOIRE ÉLECTRIQUE ET CÂBLAGE', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 137, 'article', '5.05 — ARMOIRE REPORTS D''ALARMES', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 138, 'article', '5.06 — REPERAGE', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 139, 'article', '5.07 — INDICATEUR DE PASSAGE D''EAU', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 140, 'titre', 'A.06 — DEMONTAGE DE L’EXISTANT ET INSTALLATION DU CHANTIER', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 141, 'article', '6.01 — Démontage de l’existant', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 142, 'article', '6.02 — Installation du chantier', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0);

  RAISE NOTICE 'Devis LOT FLUIDES % créé (101 articles).', ref;
END $$;

-- Vérification
SELECT d.reference, d.titre, c.nom AS client, d.statut,
       COUNT(l.id) FILTER (WHERE l.type = 'titre')      AS nb_lots,
       COUNT(l.id) FILTER (WHERE l.type = 'sous_titre') AS nb_sous_titres,
       COUNT(l.id) FILTER (WHERE l.type = 'article')    AS nb_articles
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
LEFT JOIN public.crm_devis_lignes l ON l.devis_id = d.id
WHERE lower(trim(c.nom)) = 'kitea rabat'
GROUP BY d.id, d.reference, d.titre, c.nom, d.statut
ORDER BY d.reference;
