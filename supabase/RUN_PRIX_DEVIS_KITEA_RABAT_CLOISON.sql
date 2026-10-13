-- CITYMO — Prix devis KITEA RABAT — LOT CLOISON BA13, FAUX PLAFOND ET BOIS (PR-2026-10-0010)
-- Complète UNIQUEMENT les lignes article dont le prix est encore à 0 : les prix déjà saisis ne sont pas touchés.
-- Lignes retrouvées par désignation exacte, puis par désignation sans code / majuscules / espaces / apostrophes
-- (cas des désignations modifiées dans l'ERP). Puis recalcul total HT / TVA / TTC (même calcul que l'ERP).
-- Devis retrouvé par client KITEA RABAT + titre, uniquement s'il est en brouillon.
-- Aucune autre table, aucun autre devis, aucune désignation ni quantité n'est modifié. Ré-exécutable sans risque.
-- Sources : bibliothèque CITYMO (export du 07/10/2026) ou estimation marché marocain — voir Excel de contrôle.

-- ===== CLOISON =====
DO $$
DECLARE
  did UUID;
  n1  INT;
  n2  INT;
BEGIN
  SELECT d.id INTO did FROM public.crm_devis d
  JOIN public.clients c ON c.id = d.client_id
  WHERE lower(trim(c.nom)) = 'kitea rabat' AND coalesce(trim(c.prenom), '') = ''
    AND d.titre = 'PROJET KITEA RABAT - LOT CLOISON BA13, FAUX PLAFOND ET BOIS'
  LIMIT 1;

  IF did IS NULL THEN
    RAISE NOTICE 'Devis CLOISON introuvable — rien modifié.';
    RETURN;
  END IF;
  IF (SELECT statut FROM public.crm_devis WHERE id = did) <> 'brouillon' THEN
    RAISE NOTICE 'Devis CLOISON n''est plus en brouillon — rien modifié.';
    RETURN;
  END IF;

  -- 1) désignation identique
  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('2.1 — Doublage BA13 ép.5cm ou panneau type FERMACELL H2,85', 280),
    ('2.2 — Cloison panneau type Fermacell H2,85', 480),
    ('2.3 — Cloison panneau type Placostil hauteur 2.85m', 420),
    ('2.4 — Cloison panneau type Placostil hauteur 5,00m', 520),
    ('2.5 — Façon de fente type C de 0,20*2,40m dans cloison Placostil ou Fermacell', 1500),
    ('2.6 — Façon de fente type C de 0,20*1,60m dans cloison Placostil ou Fermacell', 1100),
    ('2.7 — Bloc porte pleine de 0,90*2,20 mélaminée blanc ou gris clair y compris quincaillerie', 6000),
    ('2.9 — Arche passage 5,60m X 1,20m', 9000),
    ('2.10 — Arche passage 6,65m x 1,20m', 10500),
    ('2.11 — Arche passage 4,65m x 2,40m', 11000),
    ('2.12 — Arche passage 3,20m x 1,20m', 6500),
    ('2.13 — Vitrage Stadip 4.4.2 clair sur parois verticales des arches', 1400),
    ('2.14 — Couronnement bord et dessus des cloisons en U en aluminium blanc', 120),
    ('2.15 — Cornière d''angle en aluminium sur angles saillants', 70),
    ('2.16 — Couronnement dessus doublage en L en aluminium', 90),
    ('2.17 — Faux plafond Placostil suspendu avec joue périphérique en remontée HT 10cm finition peinture blanche', 420),
    ('2.18 — Faux plafond alu en maille de 15x15', 650),
    ('2.19 — Faux plafond dalles minérales 60*60cm coloris blanc', 220),
    ('2.20 — Faux plafond lames blanches 6*20cm espacées de 40cm menuiserie blanc', 220),
    ('2.21 — Faux plafond lames ton bois 6*20cm espacées de 40cm décor bois finition C105 chêne clair', 260),
    ('Faux plafond lames ton bois 6*12cm espacées de 12cm décor bois finition C105 chêne Québec polyrey', 230),
    ('2.22 — bandeau périphérique de 6*40cm en ba13', 180),
    ('2.23 — pergolas alu décor bois', 68000),
    ('2.24 — Faux plafond lames vagues suspendues forex blanc ép. 10mm espacement 35cm hauteur 3,30m', 450),
    ('2.26 — fourniture et pose de joint de dilation en BA13 sur habillage des poteaux BA13', 165),
    ('2.27 — structure supplémentaires en tube acier de 70*40mm sur la hauteur totale à fixer au sol et plafond', 25000)
  ) AS v(designation, prix)
  WHERE l.devis_id = did
    AND coalesce(l.type, 'article') = 'article'
    AND l.designation = v.designation
    AND coalesce(l.prix_ht, 0) = 0;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- 2) désignation modifiée dans l'ERP (code retiré, majuscules, espaces, apostrophes)
  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('doublage ba13 ép.5cm ou panneau type fermacell h2,85', 280),
    ('cloison panneau type fermacell h2,85', 480),
    ('cloison panneau type placostil hauteur 2.85m', 420),
    ('cloison panneau type placostil hauteur 5,00m', 520),
    ('façon de fente type c de 0,20*2,40m dans cloison placostil ou fermacell', 1500),
    ('façon de fente type c de 0,20*1,60m dans cloison placostil ou fermacell', 1100),
    ('bloc porte pleine de 0,90*2,20 mélaminée blanc ou gris clair y compris quincaillerie', 6000),
    ('arche passage 5,60m x 1,20m', 9000),
    ('arche passage 6,65m x 1,20m', 10500),
    ('arche passage 4,65m x 2,40m', 11000),
    ('arche passage 3,20m x 1,20m', 6500),
    ('vitrage stadip 4.4.2 clair sur parois verticales des arches', 1400),
    ('couronnement bord et dessus des cloisons en u en aluminium blanc', 120),
    ('cornière d''angle en aluminium sur angles saillants', 70),
    ('couronnement dessus doublage en l en aluminium', 90),
    ('faux plafond placostil suspendu avec joue périphérique en remontée ht 10cm finition peinture blanche', 420),
    ('faux plafond alu en maille de 15x15', 650),
    ('faux plafond dalles minérales 60*60cm coloris blanc', 220),
    ('faux plafond lames blanches 6*20cm espacées de 40cm menuiserie blanc', 220),
    ('faux plafond lames ton bois 6*20cm espacées de 40cm décor bois finition c105 chêne clair', 260),
    ('faux plafond lames ton bois 6*12cm espacées de 12cm décor bois finition c105 chêne québec polyrey', 230),
    ('bandeau périphérique de 6*40cm en ba13', 180),
    ('pergolas alu décor bois', 68000),
    ('faux plafond lames vagues suspendues forex blanc ép. 10mm espacement 35cm hauteur 3,30m', 450),
    ('fourniture et pose de joint de dilation en ba13 sur habillage des poteaux ba13', 165),
    ('structure supplémentaires en tube acier de 70*40mm sur la hauteur totale à fixer au sol et plafond', 25000)
  ) AS v(cle, prix)
  WHERE l.devis_id = did
    AND coalesce(l.type, 'article') = 'article'
    AND lower(regexp_replace(regexp_replace(translate(trim(l.designation), '’‘', ''''''), '^([A-Za-z]+-)?[0-9]+(\.[0-9]+)*\s*[—–-]\s*', ''), '\s+', ' ', 'g')) = v.cle
    AND coalesce(l.prix_ht, 0) = 0;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  UPDATE public.crm_devis d
  SET total_ht = t.ht, total_tva = t.ttc - t.ht, total_ttc = t.ttc
  FROM (
    SELECT coalesce(sum(r.ht), 0) AS ht, coalesce(sum(round(r.ht * (1 + r.tva / 100.0), 2)), 0) AS ttc
    FROM (
      SELECT coalesce(tva, 20) AS tva, round(sum(round(quantite * prix_ht * (1 - coalesce(remise, 0) / 100.0), 2)), 2) AS ht
      FROM public.crm_devis_lignes
      WHERE devis_id = did AND coalesce(type, 'article') = 'article'
      GROUP BY coalesce(tva, 20)
    ) r
  ) t
  WHERE d.id = did;

  RAISE NOTICE 'Devis CLOISON : % lignes complétées, totaux recalculés.', n1 + n2;
END $$;

-- ===== Vérification : totaux des devis KITEA RABAT =====
SELECT d.reference, d.titre, d.statut,
       COUNT(l.id) FILTER (WHERE coalesce(l.type, 'article') = 'article') AS nb_articles,
       COUNT(l.id) FILTER (WHERE coalesce(l.type, 'article') = 'article' AND coalesce(l.prix_ht, 0) = 0) AS articles_a_0,
       d.total_ht, d.total_tva, d.total_ttc
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
LEFT JOIN public.crm_devis_lignes l ON l.devis_id = d.id
WHERE lower(trim(c.nom)) = 'kitea rabat'
GROUP BY d.id, d.reference, d.titre, d.statut, d.total_ht, d.total_tva, d.total_ttc
ORDER BY d.reference;
