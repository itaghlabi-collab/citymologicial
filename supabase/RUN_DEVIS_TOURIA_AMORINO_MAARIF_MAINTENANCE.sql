-- CITYMO — Nouveau devis TOURIA INVEST : TRAVAUX DE MAINTENANCE AMORINO MAARIF
-- Source : devis maintenance amorino maarif .xlsx (onglet « Chiffrage Maarif » uniquement)
-- Additif : crée 1 devis brouillon + 20 lignes. Ne modifie aucun devis existant.
-- Si un devis TOURIA INVEST portant ce titre existe déjà, ne fait rien.
-- Totaux : HT 49220.00 / TVA 20 % 9844.00 / TTC 59064.00

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
    WHERE client_id = cid AND upper(trim(titre)) = 'TRAVAUX DE MAINTENANCE AMORINO MAARIF'
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
    modalites_paiement, conditions, total_ht, total_tva, total_ttc
  ) VALUES (
    ref, 'TRAVAUX DE MAINTENANCE AMORINO MAARIF', 'brouillon', current_date, current_date + 30, cid,
    '30 jours net', E'• Les prix sont exprimés en MAD\n• Paiement selon les modalités convenues au contrat.\n• Nos prestations se limitent aux services proposés dans notre offre commerciale tous travaux supplémentaires seront soumis à un devis complémentaire.\n• Chiffrage estimatif : prix et périmètres à confirmer après validation technique.\n• Forfaits stores, enseigne, quincaillerie, peinture et plomberie provisionnels.\n• Quantités reprises du chiffrage fourni. Aucune majoration supplémentaire appliquée.\n• Prix hors taxes ; TVA à appliquer selon la facturation.', 49220.00, 9844.00, 59064.00
  ) RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 1, 'titre', 'MOBILIER ET SELLERIE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 2, 'article', 'Housses de banquettes en tissu antitache, avec scratch', E'160 × 46 cm ; dépose, fourniture/confection, transport et repose. Mousse conservée.', 12, 'unite', 750, 0, 20, 9000),
  (did, 3, 'article', 'Grandes tables : préparation et finition du bois', E'Décapage/ponçage et vernis ou saturateur selon support. Dimensions à confirmer ; hors réparation structurelle.', 7, 'unite', 450, 0, 20, 3150),
  (did, 4, 'article', 'Petites tables 60 × 60 cm : préparation et finition du bois', E'Décapage/ponçage et vernis ou saturateur selon support ; hors remplacement des plateaux.', 18, 'unite', 280, 0, 20, 5040),
  (did, 5, 'article', 'Tabourets : décapage et vernissage', E'Décapage, préparation et vernissage ; hors réparation structurelle et sellerie.', 11, 'unite', 250, 0, 20, 2750),
  (did, 6, 'article', 'Quincaillerie des tiroirs et placards', E'Provision pour charnières, coulisses, poignées et fermetures. Inventaire à confirmer.', 1, 'forfait', 1800, 0, 20, 1800),
  (did, 7, 'article', 'Chaises : housses antitaches pour assise et dossier', E'Par chaise : assise 46 × 55 cm et dossier 46 × 25 cm. Dépose, confection, transport et repose. Mousse conservée.', 14, 'unite', 750, 0, 20, 10500),
  (did, 8, 'titre', 'VITRAGES ET HABILLAGES', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 9, 'article', 'Ouvertures de glacières : remplacement par plexiglas', E'70 × 45 cm chacune ; dépose, découpe, ajustage et pose. Base provisoire PMMA transparent 5 mm, épaisseur et compatibilité à valider ; quincaillerie conservée.', 10, 'unite', 450, 0, 20, 4500),
  (did, 10, 'article', 'Porte de chambre froide : habillage composite aluminium', E'250 × 60 cm ; une face, découpe, chants et fixation. Hors joints, charnières et travaux frigorifiques.', 1, 'unite', 1800, 0, 20, 1800),
  (did, 11, 'titre', 'REVÊTEMENTS ET PEINTURE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 12, 'article', 'Sol comptoir : revêtement souple type Gerflex', E'Fourniture, dépose légère, préparation courante et pose ; hors ragréage lourd, étanchéité et déplacement des équipements frigorifiques.', 8, 'm2', 380, 0, 20, 3040),
  (did, 13, 'article', 'Salle de bains : peinture', E'Provision pour préparation légère et deux couches ; surface à confirmer. Hors traitement des infiltrations.', 1, 'forfait', 1800, 0, 20, 1800),
  (did, 14, 'titre', 'STORES ET FERMETURES', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 15, 'article', 'Guides aluminium pour stores', E'Fourniture et pose, fixations et réglage. Forfait estimatif, longueurs à confirmer.', 1, 'forfait', 1500, 0, 20, 1500),
  (did, 16, 'article', 'Cadenas : fourniture et remplacement', E'3 unités ; fourniture standard et remplacement, hors modification des points de fermeture.', 3, 'unite', 180, 0, 20, 540),
  (did, 17, 'titre', 'ENSEIGNE ET ÉLECTRICITÉ', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 18, 'article', 'Enseigne : contrôle et remplacement des transformateurs défectueux', E'Provision ; nombre, puissance et références des transformateurs à confirmer. Hors enseigne neuve et nacelle.', 1, 'forfait', 2000, 0, 20, 2000),
  (did, 19, 'titre', 'PLOMBERIE SANITAIRE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 20, 'article', 'Plomberie sanitaires : diagnostic et reprises', E'Provision : fixation cuvette, contrôle chasse d''eau, petites fournitures et réglages. Hors cuvette/réservoir neufs et réseaux encastrés.', 1, 'forfait', 1800, 0, 20, 1800);

  RAISE NOTICE 'Devis % créé (% lignes)', ref, 20;
END $$;

SELECT d.reference, d.titre, c.nom AS client, d.statut, d.total_ht, d.total_tva, d.total_ttc,
       (SELECT count(*) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id) AS nb_lignes,
       (SELECT sum(total_ht) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id AND l.type = 'article') AS somme_lignes_ht
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
WHERE upper(trim(d.titre)) = 'TRAVAUX DE MAINTENANCE AMORINO MAARIF';
