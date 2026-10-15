-- CITYMO — Nouveau devis TOURIA INVEST : TRAVAUX DE MAINTENANCE AMORINO ANFA
-- Source : Chiffrage_Amorino_Anfa (1).xlsx (onglet « Chiffrage Anfa »)
-- Additif : crée 1 devis brouillon + 15 lignes. Ne modifie aucun devis existant.
-- Si un devis TOURIA INVEST portant ce titre existe déjà, ne fait rien.
-- Totaux : HT 43780.00 / TVA 20 % 8756.00 / TTC 52536.00

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
    WHERE client_id = cid AND upper(trim(titre)) = 'TRAVAUX DE MAINTENANCE AMORINO ANFA'
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
    ref, 'TRAVAUX DE MAINTENANCE AMORINO ANFA', 'brouillon', current_date, current_date + 30, cid,
    '30 jours net', E'• Les prix sont exprimés en MAD\n• Paiement selon les modalités convenues au contrat.\n• Nos prestations se limitent aux services proposés dans notre offre commerciale tous travaux supplémentaires seront soumis à un devis complémentaire.\n• Source : capture Anfa du 14/10/2026. Quantités : 30 tables, 25 chaises, 6 banquettes, 3 cadenas et 8 m² de Gerflex.\n• Tables : traitement au saturateur selon dernière consigne. Base provisoire de petites tables à 280 MAD HT ; dimensions à confirmer avant validation.\n• Lustrerie : hypothèse de 4 luminaires à 400 MAD HT pour dépose et repose, sans fourniture neuve. Abattant : hypothèse de 1 ensemble. Quantités à confirmer.\n• Pergola : provision de 4 500 MAD HT ; remplacement moteur et pièces importantes sur devis complémentaire. Hors nacelle et travaux de nuit.\n• Peinture mezzanine retirée conformément à la nouvelle capture. Prix estimatifs HT ; TVA selon facturation.', E'• Mêmes désignations et prix unitaires que les devis précédents pour les prestations identiques. Chaises et banquettes : 750 MAD HT/unité, mousses conservées.\n• Banquettes : prix basé sur des housses de 160 × 46 cm comme Maârif. Dimensions Anfa à relever ; adaptation au prorata si différentes.', 43780.00, 8756.00, 52536.00
  ) RETURNING id INTO did;

  INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    quantite, unite, prix_ht, remise, tva, total_ht
  ) VALUES
  (did, 1, 'titre', 'MOBILIER ET SELLERIE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 2, 'article', 'Petites tables : préparation du bois et traitement au saturateur', E'Décapage ou ponçage adapté, dépoussiérage et application du saturateur selon prescriptions du produit ; hors remplacement des plateaux.', 30, 'unite', 280, 0, 20, 8400),
  (did, 3, 'article', 'Chaises : housses antitaches pour assise et dossier', E'Par chaise : assise 46 × 55 cm et dossier 46 × 25 cm. Dépose, confection, transport et repose. Mousse conservée.', 25, 'unite', 750, 0, 20, 18750),
  (did, 4, 'article', 'Housses de banquettes en tissu antitache, avec scratch', E'Base provisoire 160 × 46 cm par housse, dimensions Anfa à confirmer ; dépose, fourniture/confection, transport et repose. Mousse conservée.', 6, 'unite', 750, 0, 20, 4500),
  (did, 5, 'article', 'Quincaillerie des tiroirs et placards', E'Provision pour charnières, coulisses, poignées et fermetures. Inventaire à confirmer.', 1, 'forfait', 1800, 0, 20, 1800),
  (did, 6, 'titre', 'REVÊTEMENTS ET PEINTURE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 7, 'article', 'Sol comptoir : revêtement souple type Gerflex', E'Fourniture, dépose légère, préparation courante et pose ; hors ragréage lourd, étanchéité et déplacement des équipements frigorifiques.', 8, 'm2', 380, 0, 20, 3040),
  (did, 8, 'titre', 'STORES ET FERMETURES', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 9, 'article', 'Cadenas : fourniture et remplacement', E'3 unités ; fourniture standard et remplacement, hors modification des points de fermeture.', 3, 'unite', 180, 0, 20, 540),
  (did, 10, 'titre', 'PERGOLA', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 11, 'article', 'Remise en fonctionnement des lames de la pergola', E'Diagnostic, contrôle du mécanisme et des commandes existantes, nettoyage des articulations, lubrification adaptée, réglages et essais. Forfait provisionnel ; hors remplacement moteur, centrale, lames ou pièces importantes et hors nacelle.', 1, 'forfait', 4500, 0, 20, 4500),
  (did, 12, 'titre', 'ÉLECTRICITÉ ET LUSTRERIE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 13, 'article', 'Lustrerie RDC : démontage et réinstallation', E'Dépose, repose, contrôle des fixations, raccordement sur attentes existantes et essais. Base provisoire : 4 luminaires standards ; hors fourniture de luminaires, nouveaux circuits, lustres lourds et nacelle.', 4, 'unite', 400, 0, 20, 1600),
  (did, 14, 'titre', 'PLOMBERIE SANITAIRE', NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 15, 'article', 'WC : abattant et couvercle', E'Hypothèse : 1 ensemble standard, fourniture et pose ; compatibilité à confirmer.', 1, 'unite', 650, 0, 20, 650);

  RAISE NOTICE 'Devis % créé (% lignes)', ref, 15;
END $$;

SELECT d.reference, d.titre, c.nom AS client, d.statut, d.total_ht, d.total_tva, d.total_ttc,
       (SELECT count(*) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id) AS nb_lignes,
       (SELECT sum(total_ht) FROM public.crm_devis_lignes l WHERE l.devis_id = d.id AND l.type = 'article') AS somme_lignes_ht
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
WHERE upper(trim(d.titre)) = 'TRAVAUX DE MAINTENANCE AMORINO ANFA';
