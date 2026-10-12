-- CITYMO — Devis CRM KITEA RABAT — LOT CLOISON BA13, FAUX PLAFOND ET BOIS
-- Source : kitea rabat bordereau lot cloison ba13 fp et bois.xlsx
-- 1 lot, 26 articles — prix à 0 (à compléter dans l'ERP)
-- Unités : u → unite, F → forfait, ml → ml, m² → m2.
-- Lignes à quantité 0 dans le bordereau non reprises : 2.8 — Bloc porte vitrée de 1,80*2,20m; 2.25 — Enduit de plâtre projeté sur murs
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

  IF EXISTS (SELECT 1 FROM public.crm_devis WHERE client_id = cid AND titre = 'PROJET KITEA RABAT - LOT CLOISON BA13, FAUX PLAFOND ET BOIS') THEN
    RAISE NOTICE 'Devis LOT CLOISON déjà existant — aucune modification.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX((regexp_match(reference, '^PR-2026-10-(\d+)$'))[1]::INT), 0) INTO maxnum
  FROM public.crm_devis WHERE reference LIKE 'PR-2026-10-%';
  ref := 'PR-2026-10-' || lpad((maxnum + 1)::TEXT, 4, '0');

  INSERT INTO public.crm_devis (reference, titre, statut, date_creation, date_validite, client_id, total_ht, total_tva, total_ttc)
  VALUES (ref, 'PROJET KITEA RABAT - LOT CLOISON BA13, FAUX PLAFOND ET BOIS', 'brouillon', DATE '2026-10-12', DATE '2026-11-11', cid, 0, 0, 0)
  RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    article_id, categorie_id, quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 0, 'titre', 'LOT CLOISON BA13, FAUX PLAFOND ET BOIS', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 1, 'article', '2.1 — Doublage BA13 ép.5cm ou panneau type FERMACELL H2,85', NULL, NULL, NULL, 1800, 'm2', 0, 0, 20, 0),
  (did, 2, 'article', '2.2 — Cloison panneau type Fermacell H2,85', NULL, NULL, NULL, 1450, 'm2', 0, 0, 20, 0),
  (did, 3, 'article', '2.3 — Cloison panneau type Placostil hauteur 2.85m', NULL, NULL, NULL, 335, 'm2', 0, 0, 20, 0),
  (did, 4, 'article', '2.4 — Cloison panneau type Placostil hauteur 5,00m', NULL, NULL, NULL, 250, 'm2', 0, 0, 20, 0),
  (did, 5, 'article', '2.5 — Façon de fente type C de 0,20*2,40m dans cloison Placostil ou Fermacell', NULL, NULL, NULL, 5, 'unite', 0, 0, 20, 0),
  (did, 6, 'article', '2.6 — Façon de fente type C de 0,20*1,60m dans cloison Placostil ou Fermacell', NULL, NULL, NULL, 15, 'unite', 0, 0, 20, 0),
  (did, 7, 'article', '2.7 — Bloc porte pleine de 0,90*2,20 mélaminée blanc ou gris clair y compris quincaillerie', NULL, NULL, NULL, 10, 'unite', 0, 0, 20, 0),
  (did, 8, 'article', '2.9 — Arche passage 5,60m X 1,20m', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 9, 'article', '2.10 — Arche passage 6,65m x 1,20m', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 10, 'article', '2.11 — Arche passage 4,65m x 2,40m', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 11, 'article', '2.12 — Arche passage 3,20m x 1,20m', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 12, 'article', '2.13 — Vitrage Stadip 4.4.2 clair sur parois verticales des arches', NULL, NULL, NULL, 40, 'm2', 0, 0, 20, 0),
  (did, 13, 'article', '2.14 — Couronnement bord et dessus des cloisons en U en aluminium blanc', NULL, NULL, NULL, 1120, 'ml', 0, 0, 20, 0),
  (did, 14, 'article', '2.15 — Cornière d''angle en aluminium sur angles saillants', NULL, NULL, NULL, 1110, 'ml', 0, 0, 20, 0),
  (did, 15, 'article', '2.16 — Couronnement dessus doublage en L en aluminium', NULL, NULL, NULL, 620, 'ml', 0, 0, 20, 0),
  (did, 16, 'article', '2.17 — Faux plafond Placostil suspendu avec joue périphérique en remontée HT 10cm finition peinture blanche', NULL, NULL, NULL, 290, 'm2', 0, 0, 20, 0),
  (did, 17, 'article', '2.18 — Faux plafond alu en maille de 15x15', NULL, NULL, NULL, 245, 'm2', 0, 0, 20, 0),
  (did, 18, 'article', '2.19 — Faux plafond dalles minérales 60*60cm coloris blanc', NULL, NULL, NULL, 270, 'm2', 0, 0, 20, 0),
  (did, 19, 'article', '2.20 — Faux plafond lames blanches 6*20cm espacées de 40cm menuiserie blanc', NULL, NULL, NULL, 250, 'ml', 0, 0, 20, 0),
  (did, 20, 'article', '2.21 — Faux plafond lames ton bois 6*20cm espacées de 40cm décor bois finition C105 chêne clair', NULL, NULL, NULL, 750, 'ml', 0, 0, 20, 0),
  (did, 21, 'article', 'Faux plafond lames ton bois 6*12cm espacées de 12cm décor bois finition C105 chêne Québec polyrey', NULL, NULL, NULL, 132, 'ml', 0, 0, 20, 0),
  (did, 22, 'article', '2.22 — bandeau périphérique de 6*40cm en ba13', NULL, NULL, NULL, 145, 'ml', 0, 0, 20, 0),
  (did, 23, 'article', '2.23 — pergolas alu décor bois', E'trame 120 x 260, dimensions 690x545\nHSFP 330 cm', NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 24, 'article', '2.24 — Faux plafond lames vagues suspendues forex blanc ép. 10mm espacement 35cm hauteur 3,30m', NULL, NULL, NULL, 90, 'ml', 0, 0, 20, 0),
  (did, 25, 'article', '2.26 — fourniture et pose de joint de dilation en BA13 sur habillage des poteaux BA13', NULL, NULL, NULL, 75, 'ml', 0, 0, 20, 0),
  (did, 26, 'article', '2.27 — structure supplémentaires en tube acier de 70*40mm sur la hauteur totale à fixer au sol et plafond', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0);

  RAISE NOTICE 'Devis LOT CLOISON % créé (26 articles).', ref;
END $$;

SELECT d.reference, d.titre, c.nom AS client, d.statut,
       COUNT(l.id) FILTER (WHERE l.type = 'article') AS nb_articles
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
LEFT JOIN public.crm_devis_lignes l ON l.devis_id = d.id
WHERE lower(trim(c.nom)) = 'kitea rabat'
GROUP BY d.id, d.reference, d.titre, c.nom, d.statut
ORDER BY d.reference;
