-- CITYMO — Création d'un nouveau devis CRM pour le client TOURIA INVEST
-- Intitulé : Travaux correctifs électriques et éclairage de sécurité
-- Date : 09/10/2026 — Valable jusqu'au : 08/11/2026 — Statut : brouillon
-- 9 lignes — Total HT 30 000,00 / TVA 20 % 6 000,00 / TTC 36 000,00 MAD
-- INSERT uniquement (aucun UPDATE / DELETE) : ne touche à aucun devis ni client existant.
-- S'arrête sans rien faire si le client est introuvable / ambigu, ou si ce devis existe déjà.

DO $$
DECLARE
  cid    UUID;
  nb     INT;
  did    UUID;
  ref    TEXT;
  maxnum INT;
BEGIN
  SELECT COUNT(*) INTO nb
  FROM public.clients c
  WHERE concat_ws(' ', c.prenom, c.nom) ILIKE '%touria%invest%';

  IF nb = 0 THEN
    RAISE EXCEPTION 'Client « Touria Invest » introuvable — créez-le d''abord dans CRM > Clients.';
  ELSIF nb > 1 THEN
    RAISE EXCEPTION 'Plusieurs clients correspondent à « Touria Invest » (%) — précisez lequel.', nb;
  END IF;

  SELECT c.id INTO cid
  FROM public.clients c
  WHERE concat_ws(' ', c.prenom, c.nom) ILIKE '%touria%invest%'
  LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM public.crm_devis
    WHERE client_id = cid
      AND titre = 'Travaux correctifs électriques et éclairage de sécurité'
  ) THEN
    RAISE NOTICE 'Ce devis existe déjà pour Touria Invest — aucune modification.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX((regexp_match(reference, '^PR-2026-10-(\d+)$'))[1]::INT), 0)
    INTO maxnum
  FROM public.crm_devis
  WHERE reference LIKE 'PR-2026-10-%';

  ref := 'PR-2026-10-' || lpad((maxnum + 1)::TEXT, 4, '0');

  INSERT INTO public.crm_devis (
    reference, titre, statut, date_creation, date_validite, client_id,
    total_ht, total_tva, total_ttc
  ) VALUES (
    ref, 'Travaux correctifs électriques et éclairage de sécurité', 'brouillon',
    DATE '2026-10-09', DATE '2026-11-08', cid,
    30000.00, 6000.00, 36000.00
  )
  RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    article_id, categorie_id, quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 0, 'article', 'Mise à la terre générale non raccordée', 'Vérification et reprise du raccordement, accessoires nécessaires et contrôle de continuité.', NULL, NULL, 1, 'forfait', 3300.00, 0, 20, 3300.00),
  (did, 1, 'article', 'Interrupteurs différentiels insuffisants', 'Vérification des protections et adaptation : fourniture, remplacement ou ajout selon diagnostic.', NULL, NULL, 1, 'forfait', 8400.00, 0, 20, 8400.00),
  (did, 2, 'article', 'Échauffement répartiteur / disjoncteur (70,2 °C)', 'Recherche de la cause, reprise des connexions, remplacement des composants concernés si nécessaire et vérification sous charge.', NULL, NULL, 1, 'forfait', 2250.00, 0, 20, 2250.00),
  (did, 3, 'article', 'Manque d’embouts sur conducteurs souples', 'Fourniture et pose des embouts, sertissage et reprise des terminaisons concernées.', NULL, NULL, 1, 'forfait', 1350.00, 0, 20, 1350.00),
  (did, 4, 'article', 'Raccordements défectueux et conducteurs non raccordés', 'Reprise des shunts, multifils, dominos et scotch ; connexions adaptées et sécurisation.', NULL, NULL, 1, 'forfait', 1800.00, 0, 20, 1800.00),
  (did, 5, 'article', 'Blocs autonomes d’éclairage de sécurité (BAES)', 'Fourniture, pose, raccordement et essais. Nombre et implantation à déterminer sur place.', NULL, NULL, 1, 'forfait', 3300.00, 0, 20, 3300.00),
  (did, 6, 'article', 'Vérifications préalables à l’exécution', 'Visite technique, relevé des équipements et définition des interventions correspondant aux réserves.', NULL, NULL, 1, 'forfait', 2250.00, 0, 20, 2250.00),
  (did, 7, 'article', 'Vérification des corrections réalisées', 'Mesures, essais après travaux, contrôle thermique et compte rendu avec photos.', NULL, NULL, 1, 'forfait', 2550.00, 0, 20, 2550.00),
  (did, 8, 'article', 'Organisation de l’intervention à Tanger', 'Mobilisation, déplacement, logistique et coordination avec le service technique du site.', NULL, NULL, 1, 'forfait', 4800.00, 0, 20, 4800.00);

  RAISE NOTICE 'Devis % créé pour Touria Invest (9 lignes, 36 000,00 MAD TTC).', ref;
END $$;

-- Vérification
SELECT d.reference, d.titre, d.statut, d.date_creation, d.date_validite,
       concat_ws(' ', c.prenom, c.nom) AS client,
       d.total_ht, d.total_tva, d.total_ttc,
       (SELECT COUNT(*) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id) AS nb_lignes
FROM public.crm_devis d
LEFT JOIN public.clients c ON c.id = d.client_id
WHERE d.titre = 'Travaux correctifs électriques et éclairage de sécurité'
ORDER BY d.created_at DESC;
