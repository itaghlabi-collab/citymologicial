-- CITYMO — Devis CRM KITEA RABAT — LOT PEINTURE
-- Source : kitea rabat bordereau lot peinture.xlsx
-- 1 lot, 6 articles — prix à 0 (à compléter dans l'ERP)
-- Unités : m² → m2, F → forfait.
-- Ligne sans quantité non reprise : 3.7 — peinture facade exterieur idem existant
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

  IF EXISTS (SELECT 1 FROM public.crm_devis WHERE client_id = cid AND titre = 'PROJET KITEA RABAT - LOT PEINTURE') THEN
    RAISE NOTICE 'Devis LOT PEINTURE déjà existant — aucune modification.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX((regexp_match(reference, '^PR-2026-10-(\d+)$'))[1]::INT), 0) INTO maxnum
  FROM public.crm_devis WHERE reference LIKE 'PR-2026-10-%';
  ref := 'PR-2026-10-' || lpad((maxnum + 1)::TEXT, 4, '0');

  INSERT INTO public.crm_devis (reference, titre, statut, date_creation, date_validite, client_id, total_ht, total_tva, total_ttc)
  VALUES (ref, 'PROJET KITEA RABAT - LOT PEINTURE', 'brouillon', DATE '2026-10-12', DATE '2026-11-11', cid, 0, 0, 0)
  RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    article_id, categorie_id, quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 0, 'titre', 'LOT PEINTURE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 1, 'article', '3.1 — Peinture satinée RAL 9003 sur panneaux de plâtre (doublage et cloison type BA13 ou Fermacell)', NULL, NULL, NULL, 5100, 'm2', 0, 0, 20, 0),
  (did, 2, 'article', '3.2 — Peinture blanc satinée RAL 9003 sur murs et plafonds au mortier de ciment ou béton brut', NULL, NULL, NULL, 1500, 'm2', 0, 0, 20, 0),
  (did, 3, 'article', '3.3 — Peinture gris noir mate RAL 7021 sur murs et poteaux au mortier de ciment ou béton brut', NULL, NULL, NULL, 2500, 'm2', 0, 0, 20, 0),
  (did, 4, 'article', '3.4 — Peinture gris noir Mat 7021 sur plafonds au plâtre projeté ou béton brut', NULL, NULL, NULL, 6000, 'm2', 0, 0, 20, 0),
  (did, 5, 'article', '3.5 — Peinture gris noir Mat RAL 7021 sur gaines de désenfumage en tôle ou en plâtre, chemins de câbles, chutes en fonte ou PVC et tuyauterie diverses', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 6, 'article', '3.6 — Peinture laquée ou Mat sur ferronnerie et menuiserie métallique', NULL, NULL, NULL, 60, 'm2', 0, 0, 20, 0);

  RAISE NOTICE 'Devis LOT PEINTURE % créé (6 articles).', ref;
END $$;

SELECT d.reference, d.titre, c.nom AS client, d.statut,
       COUNT(l.id) FILTER (WHERE l.type = 'article') AS nb_articles
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
LEFT JOIN public.crm_devis_lignes l ON l.devis_id = d.id
WHERE lower(trim(c.nom)) = 'kitea rabat'
GROUP BY d.id, d.reference, d.titre, c.nom, d.statut
ORDER BY d.reference;
