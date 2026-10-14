-- CITYMO — Nouveau devis TOURIA INVEST : TRAVAUX DE MAINTENANCE AMORINO RABAT
-- Source : Chiffrage_Amorino_Rabat.xlsx (onglet « Chiffrage Rabat » ; onglet « Base sellerie » interne exclu)
-- Additif : crée 1 devis brouillon + 19 lignes. Ne modifie aucun devis existant.
-- Si un devis TOURIA INVEST portant ce titre existe déjà, ne fait rien.
-- Totaux : HT 66010.77 / TVA 20 % 13202.15 / TTC 79212.92

DO $$
DECLARE
  cid UUID;
  did UUID;
  ref TEXT;
  prefix TEXT := 'PR-' || to_char(current_date, 'YYYY-MM') || '-';
  next_num INT;
BEGIN
  SELECT id INTO cid FROM public.clients WHERE upper(trim(nom)) = 'TOURIA INVEST' LIMIT 1;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Client TOURIA INVEST introuvable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.crm_devis
    WHERE client_id = cid AND upper(trim(titre)) = 'TRAVAUX DE MAINTENANCE AMORINO RABAT'
  ) THEN
    RAISE NOTICE 'Devis déjà présent — aucune modification.';
    RETURN;
  END IF;

  SELECT coalesce(max((regexp_match(reference, '^PR-\d{4}-\d{2}-(\d+)$'))[1]::int), 0) + 1
    INTO next_num
  FROM public.crm_devis
  WHERE reference LIKE prefix || '%';
  ref := prefix || lpad(next_num::text, 4, '0');

  INSERT INTO public.crm_devis (
    reference, titre, statut, date_creation, date_validite, client_id,
    modalites_paiement, conditions, notes_internes, total_ht, total_tva, total_ttc
  ) VALUES (
    ref, 'TRAVAUX DE MAINTENANCE AMORINO RABAT', 'brouillon', current_date, current_date + 30, cid,
    '30 jours net', E'• Les prix sont exprimés en MAD\n• Paiement selon les modalités convenues au contrat.\n• Nos prestations se limitent aux services proposés dans notre offre commerciale tous travaux supplémentaires seront soumis à un devis complémentaire.\n• Source : captures Amorino Rabat du 14/10/2026. Quantités reprises : 33 chaises (29 + 4), 21 petites tables, 3 grandes, 2 rondes, 6 tabourets, 16 petits spots, 6 grands spots, 10 suspensions et 3 banquettes.\n• Enseignes et quincaillerie : provision de 1 forfait par poste. Plomberie : hypothèse de 1 WC. Prix définitifs après diagnostic et inventaire.\n• Aucun poste pergola, revêtement de sol, installation ou nettoyage ajouté. Hors nacelle et interventions de nuit. Prix HT ; TVA selon facturation.', E'• Prestations identiques : mêmes désignations et prix unitaires que les devis précédents. Quantités propres au magasin Rabat. Autres prix estimatifs à valider.\n• Sellerie : même base de référence Maârif. Chaises 750 MAD HT/ensemble ; banquettes au prorata de surface de 160 × 46 cm à 750 MAD HT. Mousses conservées ; dimensions à confirmer.\n• Banquettes : base Maârif 750 MAD HT pour 160 × 46 cm, prix adapté au prorata de surface (3,05 × 0,55 m = 1 709,41 ; 3,25 × 0,72 m = 2 384,51 ; 1,85 × 0,55 m = 1 036,85 MAD HT).', 66010.77, 13202.15, 79212.92
  ) RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 1, 'titre', 'MOBILIER ET SELLERIE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 2, 'article', 'Chaises : housses antitaches pour assise et dossier', E'Par chaise : assise 46 × 55 cm et dossier 46 × 25 cm. Dépose, confection, transport et repose. Mousse conservée.', 33, 'unite', 750, 0, 20, 24750),
  (did, 3, 'article', 'Petites tables : préparation du bois et traitement au saturateur', E'Décapage ou ponçage adapté, dépoussiérage et application du saturateur selon prescriptions du produit ; hors remplacement des plateaux.', 21, 'unite', 280, 0, 20, 5880),
  (did, 4, 'article', 'Grandes tables : préparation du bois et traitement au saturateur', E'Décapage ou ponçage adapté, dépoussiérage et application du saturateur selon prescriptions du produit ; hors réparation structurelle.', 3, 'unite', 450, 0, 20, 1350),
  (did, 5, 'article', 'Tables rondes : préparation du bois et traitement au saturateur', E'Décapage ou ponçage adapté, dépoussiérage et application du saturateur selon prescriptions du produit. Prix estimatif, dimensions à confirmer.', 2, 'unite', 450, 0, 20, 900),
  (did, 6, 'article', 'Tabourets : décapage et vernissage', E'Décapage, préparation et vernissage ; hors réparation structurelle et sellerie.', 6, 'unite', 250, 0, 20, 1500),
  (did, 7, 'article', 'Housse de banquette en tissu antitache, avec scratch — 3,05 × 0,55 m', E'Dépose, fourniture/confection, transport et repose. Mousse conservée. Dimensions à confirmer.', 1, 'unite', 1709.41, 0, 20, 1709.41),
  (did, 8, 'article', 'Housse de banquette en tissu antitache, avec scratch — 3,25 × 0,72 m', E'Dépose, fourniture/confection, transport et repose. Mousse conservée. Dimensions à confirmer.', 1, 'unite', 2384.51, 0, 20, 2384.51),
  (did, 9, 'article', 'Housse de banquette en tissu antitache, avec scratch — 1,85 × 0,55 m', E'Dépose, fourniture/confection, transport et repose. Mousse conservée. Dimensions à confirmer.', 1, 'unite', 1036.85, 0, 20, 1036.85),
  (did, 10, 'titre', 'STORES ET FERMETURES', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 11, 'article', 'Quincaillerie des portes : remplacement des éléments défectueux', E'Provision fourniture et pose de petites pièces standard ; inventaire à confirmer. Hors portes neuves et contrôle d’accès.', 1, 'forfait', 1800, 0, 20, 1800),
  (did, 12, 'titre', 'ENSEIGNES ET ÉLECTRICITÉ', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 13, 'article', 'Enseigne extérieure : contrôle et remplacement des transformateurs défectueux', E'Forfait provisionnel selon diagnostic ; nombre, puissance et références à confirmer. Hors enseigne neuve et nacelle.', 1, 'forfait', 2000, 0, 20, 2000),
  (did, 14, 'article', 'Enseigne intérieure : contrôle et remplacement des transformateurs défectueux', E'Forfait provisionnel selon diagnostic ; nombre, puissance et références à confirmer. Hors enseigne neuve et nacelle.', 1, 'forfait', 2000, 0, 20, 2000),
  (did, 15, 'article', 'Petits spots sur rail : fourniture et remplacement', E'Dépose, fourniture de spots LED standard, pose et essais. Puissance, teinte et compatibilité du rail à valider ; rail conservé.', 16, 'unite', 350, 0, 20, 5600),
  (did, 16, 'article', 'Grands spots sur rail : fourniture et remplacement', E'Dépose, fourniture de spots LED standard, pose et essais. Puissance, teinte et compatibilité du rail à valider ; rail conservé.', 6, 'unite', 550, 0, 20, 3300),
  (did, 17, 'article', 'Suspensions : fourniture et remplacement', E'Provision par luminaire : fourniture standard 600 MAD HT et dépose, pose et raccordement 400 MAD HT. Modèle et quantité de 10 à confirmer ; hors lustres lourds et nouveaux circuits.', 10, 'unite', 1000, 0, 20, 10000),
  (did, 18, 'titre', 'PLOMBERIE SANITAIRE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 19, 'article', 'Plomberie sanitaires : diagnostic et reprises', E'Provision : fixation cuvette, contrôle chasse d''eau, petites fournitures et réglages. Hors cuvette/réservoir neufs et réseaux encastrés.', 1, 'forfait', 1800, 0, 20, 1800);

  RAISE NOTICE 'Devis % créé (% lignes)', ref, 19;
END $$;

SELECT d.reference, d.titre, c.nom AS client, d.statut, d.total_ht, d.total_tva, d.total_ttc,
       (SELECT count(*) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id) AS nb_lignes,
       (SELECT sum(total_ht) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id AND l.type = 'article') AS somme_lignes_ht
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
WHERE upper(trim(d.titre)) = 'TRAVAUX DE MAINTENANCE AMORINO RABAT';
