-- CITYMO — Devis CRM KITEA RABAT — LOT REVÊTEMENT
-- Source : kitea rabat bordereau lot revetement.xlsx
-- 1 lot, 17 articles — prix à 0 (à compléter dans l'ERP)
-- Unités : m² / M² → m2, ml → ml, unité → unite.
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

  IF EXISTS (SELECT 1 FROM public.crm_devis WHERE client_id = cid AND titre = 'PROJET KITEA RABAT - LOT REVÊTEMENT') THEN
    RAISE NOTICE 'Devis LOT REVÊTEMENT déjà existant — aucune modification.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX((regexp_match(reference, '^PR-2026-10-(\d+)$'))[1]::INT), 0) INTO maxnum
  FROM public.crm_devis WHERE reference LIKE 'PR-2026-10-%';
  ref := 'PR-2026-10-' || lpad((maxnum + 1)::TEXT, 4, '0');

  INSERT INTO public.crm_devis (reference, titre, statut, date_creation, date_validite, client_id, total_ht, total_tva, total_ttc)
  VALUES (ref, 'PROJET KITEA RABAT - LOT REVÊTEMENT', 'brouillon', DATE '2026-10-12', DATE '2026-11-11', cid, 0, 0, 0)
  RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    article_id, categorie_id, quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 0, 'titre', 'LOT REVÊTEMENT', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 1, 'article', '4.1 — POSE DE REVÊTEMENT EN PVC AU SOL PARQUET', NULL, NULL, NULL, 1275, 'm2', 0, 0, 20, 0),
  (did, 2, 'article', '4.2 — POSE DE REVÊTEMENT EN PVC AU SOL GRIS CLAIR', NULL, NULL, NULL, 535, 'm2', 0, 0, 20, 0),
  (did, 3, 'article', '4.3 — POSE DE REVÊTEMENT EN PVC AU SOL GRIS FONCE', NULL, NULL, NULL, 935, 'm2', 0, 0, 20, 0),
  (did, 4, 'article', '4.4 — POSE DE REVÊTEMENT EN MOQUETTE AU SOL NOIR', NULL, NULL, NULL, 1765, 'm2', 0, 0, 20, 0),
  (did, 5, 'article', '4.5 — POSE DE REVÊTEMENT EN MOQUETTE AU SOL BLEU', NULL, NULL, NULL, 95, 'm2', 0, 0, 20, 0),
  (did, 6, 'article', '4.6 — POSE DE REVÊTEMENT EN MOQUETTE AU SOL JARDIN', NULL, NULL, NULL, 335, 'm2', 0, 0, 20, 0),
  (did, 7, 'article', '4.7 — POSE DE REVÊTEMENT EN GRÈS CÉRAME AU SOL', NULL, NULL, NULL, 860, 'm2', 0, 0, 20, 0),
  (did, 8, 'article', '4.8 — POSE DE REVÊTEMENT EN GRÈS CÉRAME SUR MURS', NULL, NULL, NULL, 375, 'm2', 0, 0, 20, 0),
  (did, 9, 'article', '4.9 — POSE DE PLINTHE CARRELAGE DE 10CM', NULL, NULL, NULL, 415, 'ml', 0, 0, 20, 0),
  (did, 10, 'article', '4.10 — POSE DE BARRE DE SEUIL EN ALUMINIUM', NULL, NULL, NULL, 42, 'ml', 0, 0, 20, 0),
  (did, 11, 'article', '4.11 — POSE DE PLINTHE EP.10MM / HT 10CM MEDIUM A PEINDRE', NULL, NULL, NULL, 1560, 'ml', 0, 0, 20, 0),
  (did, 12, 'article', '4.12 — POSE DE NEZ DE MARCHE ALUMINIUM + CAOUTCHOUC ANTI DÉRAPANT', NULL, NULL, NULL, 43, 'ml', 0, 0, 20, 0),
  (did, 13, 'article', '4.13 — POSE RAGRÉAGE', NULL, NULL, NULL, 4610, 'm2', 0, 0, 20, 0),
  (did, 14, 'article', '4.14 — POSE DE FLECHE', NULL, NULL, NULL, 67, 'unite', 0, 0, 20, 0),
  (did, 15, 'article', '4.15 — PEINTURE DE SOL GRIS NOIR RAL 7021', NULL, NULL, NULL, 545, 'm2', 0, 0, 20, 0),
  (did, 16, 'article', '4.16 — FOURNITURE ET POSE D''ESTRADE DE TOUTE HAUTEUR EN MDF DE 19MM D''ÉPAISSEUR Y/C STRUCTURE MÉTALLIQUE EN TUBE MÉTALLIQUE DE 70*40MM AVEC PLATINES DE FIXATION AU SOL', NULL, NULL, NULL, 330, 'm2', 0, 0, 20, 0),
  (did, 17, 'article', '4.17 — FOURNITURE ET POSE DE JOINT DE DILATATION AU SOL', NULL, NULL, NULL, 95, 'ml', 0, 0, 20, 0);

  RAISE NOTICE 'Devis LOT REVÊTEMENT % créé (17 articles).', ref;
END $$;

SELECT d.reference, d.titre, c.nom AS client, d.statut,
       COUNT(l.id) FILTER (WHERE l.type = 'article') AS nb_articles
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
LEFT JOIN public.crm_devis_lignes l ON l.devis_id = d.id
WHERE lower(trim(c.nom)) = 'kitea rabat'
GROUP BY d.id, d.reference, d.titre, c.nom, d.statut
ORDER BY d.reference;
