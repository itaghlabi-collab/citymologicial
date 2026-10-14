-- CITYMO — Devis TOURIA INVEST : TRAVAUX DE MAINTENANCE AMORINO BOUSKOURA (PR-2026-10-0017)
-- Source : Chiffrage_Amorino_Bouskoura (1).xlsx (onglet « Chiffrage Bouskoura »)
-- Remplace les lignes, conditions, notes internes et totaux de CE devis uniquement
-- (seulement s'il est encore en brouillon). Aucun autre devis n'est touché.
-- Si le devis contient déjà ce chiffrage (HT 17030.00, 12 lignes), ne fait rien.
-- Totaux : HT 17030.00 / TVA 20 % 3406.00 / TTC 20436.00

DO $$
DECLARE
  did UUID;
  st TEXT;
BEGIN
  SELECT d.id, d.statut INTO did, st
  FROM public.crm_devis d
  JOIN public.clients c ON c.id = d.client_id
  WHERE d.reference = 'PR-2026-10-0017'
    AND upper(trim(c.nom)) = 'TOURIA INVEST'
    AND upper(trim(d.titre)) = 'TRAVAUX DE MAINTENANCE AMORINO BOUSKOURA'
  LIMIT 1;

  IF did IS NULL THEN
    RAISE EXCEPTION 'Devis PR-2026-10-0017 TOURIA INVEST / AMORINO BOUSKOURA introuvable';
  END IF;
  IF st <> 'brouillon' THEN
    RAISE EXCEPTION 'Devis PR-2026-10-0017 n''est plus en brouillon (statut %) — aucune modification.', st;
  END IF;

  IF (SELECT total_ht FROM public.crm_devis WHERE id = did) = 17030.00
     AND (SELECT count(*) FROM public.crm_devis_lignes WHERE devis_id = did) = 12 THEN
    RAISE NOTICE 'Chiffrage Bouskoura déjà appliqué — aucune modification.';
    RETURN;
  END IF;

  DELETE FROM public.crm_devis_lignes WHERE devis_id = did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 1, 'titre', 'MOBILIER', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 2, 'article', 'Grandes tables : préparation du bois et traitement au saturateur', E'Décapage ou ponçage adapté, dépoussiérage et application du saturateur selon prescriptions du produit ; hors réparation structurelle.', 2, 'unite', 450, 0, 20, 900),
  (did, 3, 'article', 'Petites tables : préparation du bois et traitement au saturateur', E'Décapage ou ponçage adapté, dépoussiérage et application du saturateur selon prescriptions du produit ; hors remplacement des plateaux.', 18, 'unite', 280, 0, 20, 5040),
  (did, 4, 'article', 'Tables rondes : préparation du bois et traitement au saturateur', E'Décapage ou ponçage adapté, dépoussiérage et application du saturateur selon prescriptions du produit. Prix estimatif, dimensions à confirmer.', 3, 'unite', 450, 0, 20, 1350),
  (did, 5, 'titre', 'REVÊTEMENTS ET PEINTURE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 6, 'article', 'Sol : préparation et vernissage', E'Préparation adaptée et application de vernis selon support. Prix estimatif ; hors réparation du support et décapage lourd.', 15, 'm2', 180, 0, 20, 2700),
  (did, 7, 'titre', 'STORES ET FERMETURES', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 8, 'article', 'Cadenas : fourniture et remplacement', E'Fourniture standard et remplacement ; hors modification des points de fermeture.', 3, 'unite', 180, 0, 20, 540),
  (did, 9, 'titre', 'PERGOLA', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 10, 'article', 'Remise en fonctionnement des lames de la pergola', E'Diagnostic, contrôle du mécanisme et des commandes existantes, nettoyage des articulations, lubrification adaptée, réglages et essais. Forfait provisionnel ; hors remplacement moteur, centrale, lames ou pièces importantes et hors nacelle.', 1, 'forfait', 4500, 0, 20, 4500),
  (did, 11, 'titre', 'ENSEIGNE ET ÉLECTRICITÉ', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 12, 'article', 'Enseigne : contrôle et remplacement des transformateurs défectueux', E'Forfait provisionnel selon diagnostic ; nombre, puissance et références à confirmer. Hors enseigne neuve et nacelle.', 1, 'forfait', 2000, 0, 20, 2000);

  UPDATE public.crm_devis SET
    conditions = E'• Les prix sont exprimés en MAD\n• Paiement selon les modalités convenues au contrat.\n• Nos prestations se limitent aux services proposés dans notre offre commerciale tous travaux supplémentaires seront soumis à un devis complémentaire.\n• Quantités : capture Bouskoura transmise le 14/10/2026. Enseigne chiffrée sur une base provisionnelle de 1 forfait.\n• Pergola conservée à la demande du client : 4 500 MAD HT, diagnostic et réglages ; pièces importantes sur devis complémentaire.\n• Tables rondes : 450 MAD HT/unité ; sol : 180 MAD HT/m². Estimations à valider.\n• Prix hors taxes ; TVA à appliquer selon la facturation.',
    notes_internes = E'• Tables grandes/petites, cadenas et enseigne : mêmes PU que le chiffrage Maârif.',
    total_ht = 17030.00,
    total_tva = 3406.00,
    total_ttc = 20436.00
  WHERE id = did;

  RAISE NOTICE 'Devis PR-2026-10-0017 adapté au chiffrage Bouskoura (12 lignes)';
END $$;

SELECT d.reference, d.titre, c.nom AS client, d.statut, d.total_ht, d.total_tva, d.total_ttc,
       (SELECT count(*) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id) AS nb_lignes,
       (SELECT sum(total_ht) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id AND l.type = 'article') AS somme_lignes_ht
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
WHERE d.reference = 'PR-2026-10-0017';
