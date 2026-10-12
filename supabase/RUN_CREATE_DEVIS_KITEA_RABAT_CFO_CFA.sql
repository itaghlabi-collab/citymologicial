-- CITYMO — Création client KITEA RABAT + 2 devis CRM (CFO et CFA)
-- Source : KITEA GEANT_Rabat_BD_de_prix maj.xlsx (feuilles BD CFO et BD CFA)
-- CFO : 8 lots, 75 articles — CFA : 7 lots, 74 articles — prix à 0 (à compléter dans l'ERP)
-- Unités : u → unite, ens / F → forfait, ml → ml. Lignes « PM » : quantité 1, description « PM (pour mémoire) ».
-- INSERT uniquement (aucun UPDATE / DELETE). Le client n'est créé que s'il n'existe pas.
-- Chaque devis n'est créé que s'il n'existe pas déjà (même titre, même client).

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
  ELSE
    RAISE NOTICE 'Client KITEA RABAT déjà existant — réutilisé, non modifié.';
  END IF;

  -- ===== Devis CFO =====
  IF EXISTS (SELECT 1 FROM public.crm_devis WHERE client_id = cid AND titre = 'PROJET KITEA RABAT - LOT CFO (COURANTS FORTS)') THEN
    RAISE NOTICE 'Devis CFO déjà existant — ignoré.';
  ELSE
    SELECT COALESCE(MAX((regexp_match(reference, '^PR-2026-10-(\d+)$'))[1]::INT), 0) INTO maxnum
    FROM public.crm_devis WHERE reference LIKE 'PR-2026-10-%';
    ref := 'PR-2026-10-' || lpad((maxnum + 1)::TEXT, 4, '0');

    INSERT INTO public.crm_devis (reference, titre, statut, date_creation, date_validite, client_id, total_ht, total_tva, total_ttc)
    VALUES (ref, 'PROJET KITEA RABAT - LOT CFO (COURANTS FORTS)', 'brouillon', DATE '2026-10-12', DATE '2026-11-11', cid, 0, 0, 0)
    RETURNING id INTO did;

    INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    article_id, categorie_id, quantite, unite, prix_ht, remise, tva, total_ht
    ) VALUES
  (did, 0, 'titre', 'LOT CFO-1 - DISTRIBUTION ECLAIRAGE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 1, 'article', 'CFO-1.1 — Foyer lumineux simple allumage principal', NULL, NULL, NULL, 140, 'unite', 0, 0, 20, 0),
  (did, 2, 'article', 'CFO-1.2 — Foyer lumineux simple allumage secondaire', NULL, NULL, NULL, 54, 'unite', 0, 0, 20, 0),
  (did, 3, 'article', 'CFO-1.3 — Foyer lumineux commandé par bouton poussoir', NULL, NULL, NULL, 10, 'unite', 0, 0, 20, 0),
  (did, 4, 'article', 'CFO-1.4 — Foyer lumineux commandé par commutateur à clé', NULL, NULL, NULL, 8, 'unite', 0, 0, 20, 0),
  (did, 5, 'article', 'CFO-1.5 — Détecteur de présence infrarouge', NULL, NULL, NULL, 19, 'unite', 0, 0, 20, 0),
  (did, 6, 'sous_titre', 'La pose uniquement', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 7, 'article', 'CFO-1.6 — Goulotte lumineuse LED suspendue, module LED 4000K intégré, longueur 1500 mm (~57 W)', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 8, 'article', 'CFO-1.7 — Goulotte lumineuse LED suspendue, module LED 4000K intégré, longueur 3000 mm (~115 W)', NULL, NULL, NULL, 34, 'unite', 0, 0, 20, 0),
  (did, 9, 'article', 'CFO-1.8 — Downlight encastré LED 4000K, 35 W', NULL, NULL, NULL, 85, 'unite', 0, 0, 20, 0),
  (did, 10, 'article', 'CFO-1.9 — Downlight encastré LED 4000K, 25 W', NULL, NULL, NULL, 37, 'unite', 0, 0, 20, 0),
  (did, 11, 'article', 'CFO-1.10 — Spot sur rail LED 4000K, 32 W, faisceau 36°', NULL, NULL, NULL, 1195, 'unite', 0, 0, 20, 0),
  (did, 12, 'article', 'CFO-1.11 — Spot sur rail LED 4000K, 32 W, faisceau 60°', NULL, NULL, NULL, 44, 'unite', 0, 0, 20, 0),
  (did, 13, 'article', 'CFO-1.12 — Projecteur linéaire sur rail LED 4000K, 60 W, symétrique', NULL, NULL, NULL, 358, 'unite', 0, 0, 20, 0),
  (did, 14, 'article', 'CFO-1.13 — Projecteur linéaire sur rail LED 4000K, 60 W, asymétrique', NULL, NULL, NULL, 36, 'unite', 0, 0, 20, 0),
  (did, 15, 'article', 'CFO-1.14 — Panneau LED 4000K, 1200 x 250 mm, 32 W', NULL, NULL, NULL, 9, 'unite', 0, 0, 20, 0),
  (did, 16, 'article', 'CFO-1.15 — Panneau LED 4000K, 595 x 595 mm, 36 W', NULL, NULL, NULL, 31, 'unite', 0, 0, 20, 0),
  (did, 17, 'article', 'CFO-1.16 — Hublot LED 4000K, 14 W', NULL, NULL, NULL, 24, 'unite', 0, 0, 20, 0),
  (did, 18, 'article', 'CFO-1.17 — Luminaire industriel suspendu LED 4000K, puissance sélectionnable jusqu''à 200 W', NULL, NULL, NULL, 20, 'unite', 0, 0, 20, 0),
  (did, 19, 'article', 'CFO-1.18 — Plafonnier linéaire LED 4000K, 60 W', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 20, 'article', 'CFO-1.19 — Suspension décorative LED sur mesure (composition multi-éléments)', NULL, NULL, NULL, 6, 'unite', 0, 0, 20, 0),
  (did, 21, 'article', 'CFO-1.20 — Rail électrifié 3 circuits, longueur 1000 mm', NULL, NULL, NULL, 46, 'unite', 0, 0, 20, 0),
  (did, 22, 'article', 'CFO-1.21 — Rail électrifié 3 circuits, longueur 2000 mm', NULL, NULL, NULL, 58, 'unite', 0, 0, 20, 0),
  (did, 23, 'article', 'CFO-1.22 — Rail électrifié 3 circuits, longueur 3000 mm', NULL, NULL, NULL, 505, 'unite', 0, 0, 20, 0),
  (did, 24, 'article', 'CFO-1.23 — Accessoires de raccordement et de suspension du rail 3 circuits (connecteurs, embouts, alimentation, étriers, câbles et manchons de suspension)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 25, 'titre', 'LOT CFO-2 - DISTRIBUTION PRISES DE COURANT ET ALIMENTATIONS SPECIALISEES', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 26, 'article', 'CFO-2.1 — Foyer de prises de courant principal', NULL, NULL, NULL, 95, 'unite', 0, 0, 20, 0),
  (did, 27, 'article', 'CFO-2.2 — Foyer de prises de courant secondaire', NULL, NULL, NULL, 293, 'unite', 0, 0, 20, 0),
  (did, 28, 'article', 'CFO-2.3 — Prise de courant normale 2x16 A+T', NULL, NULL, NULL, 260, 'unite', 0, 0, 20, 0),
  (did, 29, 'article', 'CFO-2.4 — Prise de courant normale 2x16 A+T étanche', NULL, NULL, NULL, 25, 'unite', 0, 0, 20, 0),
  (did, 30, 'article', 'CFO-2.5 — Prise de courant montée au plafond', NULL, NULL, NULL, 32, 'unite', 0, 0, 20, 0),
  (did, 31, 'article', 'CFO-2.6 — Prise de courant ondulée 2x16 A+T (circuit TEO)', NULL, NULL, NULL, 117, 'unite', 0, 0, 20, 0),
  (did, 32, 'article', 'CFO-2.7 — Prise informatique RJ45', NULL, NULL, NULL, 30, 'unite', 0, 0, 20, 0),
  (did, 33, 'article', 'CFO-2.8 — Bloc 4 prises normales + 4 prises ondulées + 4 RJ45', NULL, NULL, NULL, 39, 'unite', 0, 0, 20, 0),
  (did, 34, 'article', 'CFO-2.9 — Poste informatique (4 RJ45 / prises PC)', 'PM (pour mémoire)', NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 35, 'article', 'CFO-2.10 — Alimentation climatisation gainable 8 kW (unité intérieure)', NULL, NULL, NULL, 75, 'unite', 0, 0, 20, 0),
  (did, 36, 'article', 'CFO-2.11 — Alimentation cassette climatisation DRV 2,5 kW (unité intérieure, attente dédiée par cassette)', NULL, NULL, NULL, 8, 'unite', 0, 0, 20, 0),
  (did, 37, 'article', 'CFO-2.12 — Alimentation DRV 10 kW (unité extérieure climatisation)', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 38, 'article', 'CFO-2.13 — Alimentation caisson de ventilation 2,5 kW', NULL, NULL, NULL, 20, 'unite', 0, 0, 20, 0),
  (did, 39, 'article', 'CFO-2.14 — Alimentation dédiée ascenseur', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 40, 'article', 'CFO-2.15 — Alimentation dédiée monte-charge', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 41, 'article', 'CFO-2.16 — Alimentation dédiée escalier mécanique (escalator)', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 42, 'article', 'CFO-2.17 — Alimentation caisson de désenfumage 9 kW', NULL, NULL, NULL, 31, 'unite', 0, 0, 20, 0),
  (did, 43, 'article', 'CFO-2.18 — Alimentation détection incendie', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 44, 'article', 'CFO-2.19 — Alimentation détection intrusion', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 45, 'article', 'CFO-2.20 — Alimentation sonorisation', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 46, 'article', 'CFO-2.21 — Alimentation local informatique', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 47, 'article', 'CFO-2.22 — Alimentation des enseignes', NULL, NULL, NULL, 10, 'unite', 0, 0, 20, 0),
  (did, 48, 'article', 'CFO-2.23 — Alimentation éclairage extérieur', NULL, NULL, NULL, 5, 'unite', 0, 0, 20, 0),
  (did, 49, 'article', 'CFO-2.24 — Alimentation chauffe-eau électrique instantané 8 kW', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 50, 'article', 'CFO-2.25 — Alimentation sèche-main 6,5 kW', NULL, NULL, NULL, 8, 'unite', 0, 0, 20, 0),
  (did, 51, 'article', 'CFO-2.26 — Alimentation onduleurs 20kva', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 52, 'article', 'CFO-2.27 — Attentes électriques diverses 2,3 kW (portes automatiques, armoire informatique, panneaux d''affichage)', NULL, NULL, NULL, 111, 'unite', 0, 0, 20, 0),
  (did, 53, 'article', 'CFO-2.28 — Attentes électriques ascensseur / escalator / monte charge en 4 x 10 mm²', NULL, NULL, NULL, 3, 'unite', 0, 0, 20, 0),
  (did, 54, 'article', 'CFO-2.29 — Attentes électriques CR1 de 4 x10 mm²', NULL, NULL, NULL, 11, 'unite', 0, 0, 20, 0),
  (did, 55, 'titre', 'LOT CFO-3 - TGBT ET ARMOIRES ELECTRIQUES', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 56, 'article', 'CFO-3.1 — Tableau de protection électrique / TGBT (IP31, réserve 25%, parafoudre)', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 57, 'article', 'CFO-3.2 — Armoire divisionnaire (TE RDC / TE ETAGE)', NULL, NULL, NULL, 8, 'unite', 0, 0, 20, 0),
  (did, 58, 'article', 'CFO-3.3 — Liaison électrique TGBT - transformateur existant (raccordement)', NULL, NULL, NULL, 280, 'ml', 0, 0, 20, 0),
  (did, 59, 'article', 'CFO-3.4 — Liaison électrique TGBT - TE éclairage', NULL, NULL, NULL, 100, 'ml', 0, 0, 20, 0),
  (did, 60, 'article', 'CFO-3.5 — Liaison électrique TGBT - TE prises de courant', NULL, NULL, NULL, 100, 'ml', 0, 0, 20, 0),
  (did, 61, 'article', 'CFO-3.6 — Liaison électrique TGBT - TE climatisation', NULL, NULL, NULL, 100, 'ml', 0, 0, 20, 0),
  (did, 62, 'article', 'CFO-3.7 — Liaison électrique TGBT - TE ondulé (TEO)', NULL, NULL, NULL, 160, 'ml', 0, 0, 20, 0),
  (did, 63, 'article', 'CFO-3.8 — Liaison électrique TGBT - TE secouru', NULL, NULL, NULL, 80, 'ml', 0, 0, 20, 0),
  (did, 64, 'article', 'CFO-3.9 — Liaison électrique groupe électrogène - armoire (coffret) de secours', NULL, NULL, NULL, 150, 'ml', 0, 0, 20, 0),
  (did, 65, 'article', 'CFO-3.10 — Réfection de la mise à la terre du bâtiment (TGBT), y compris terre séparée des compteurs (voir CPS art. CFO-3.10)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 66, 'titre', 'LOT CFO-4 - CHEMINS DE CABLES ET TUBAGE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 67, 'article', 'CFO-4.1 — Chemin de câble - largeur 365 mm (voir CPS art. CFO-4.1)', NULL, NULL, NULL, 270, 'ml', 0, 0, 20, 0),
  (did, 68, 'article', 'CFO-4.2 — Chemin de câble - largeur 250 mm (voir CPS art. CFO-4.2)', NULL, NULL, NULL, 270, 'ml', 0, 0, 20, 0),
  (did, 69, 'article', 'CFO-4.3 — Chemin de câble - largeur 95 mm (voir CPS art. CFO-4.3)', NULL, NULL, NULL, 300, 'ml', 0, 0, 20, 0),
  (did, 70, 'article', 'CFO-4.4 — Chemin de câble - largeur 63 mm (voir CPS art. CFO-4.4)', NULL, NULL, NULL, 200, 'ml', 0, 0, 20, 0),
  (did, 71, 'article', 'CFO-4.5 — Tubage (fourreaux/conduits)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 72, 'titre', 'LOT CFO-5 - GROUPE ELECTROGENE 200 KVA', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 73, 'article', 'CFO-5.1 — Groupe électrogène 200 kVA complet, y compris désinstallation et évacuation de l''ancien groupe, mise à la terre séparée et travaux de gros-œuvre du local associés', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 74, 'titre', 'LOT CFO-6 - CENTRALE D’ÉCLAIRAGE DE SÉCURITÉ ADRESSABLE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 75, 'article', 'CFO-6.1 — Fourniture, pose, raccordement, programmation, essais et mise en service d’une centrale d’alimentation centralisée', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 76, 'article', 'CFO-6.2 — Bloc autonome / luminaire d’éclairage de sécurité d’ambiance adressable', NULL, NULL, NULL, 80, 'unite', 0, 0, 20, 0),
  (did, 77, 'article', 'CFO-6.3 — Bloc d’éclairage de sécurité de balisage adressable', NULL, NULL, NULL, 27, 'unite', 0, 0, 20, 0),
  (did, 78, 'titre', 'LOT CFO-7 - ATTENTE ELECTRIQUE 380V', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 79, 'article', 'CFO-7.1 — Alimentation 5*4mm²', NULL, NULL, NULL, 1, 'ml', 0, 0, 20, 0),
  (did, 80, 'article', 'CFO-7.2 — Prise courant 380V (TRIPHASE)', NULL, NULL, NULL, 80, 'unite', 0, 0, 20, 0),
  (did, 81, 'titre', 'LOT CFO-8 - DEMONTAGE DE L’EXISTANT ET INSTALLATION DU CHANTIER', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 82, 'article', 'CFO-8.1 — Démontage de l’existant', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 83, 'article', 'CFO-8.2 — Installation du chantier', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0);

    RAISE NOTICE 'Devis CFO % créé (75 articles).', ref;
  END IF;

  -- ===== Devis CFA =====
  IF EXISTS (SELECT 1 FROM public.crm_devis WHERE client_id = cid AND titre = 'PROJET KITEA RABAT - LOT CFA (COURANTS FAIBLES / SÉCURITÉ)') THEN
    RAISE NOTICE 'Devis CFA déjà existant — ignoré.';
  ELSE
    SELECT COALESCE(MAX((regexp_match(reference, '^PR-2026-10-(\d+)$'))[1]::INT), 0) INTO maxnum
    FROM public.crm_devis WHERE reference LIKE 'PR-2026-10-%';
    ref := 'PR-2026-10-' || lpad((maxnum + 1)::TEXT, 4, '0');

    INSERT INTO public.crm_devis (reference, titre, statut, date_creation, date_validite, client_id, total_ht, total_tva, total_ttc)
    VALUES (ref, 'PROJET KITEA RABAT - LOT CFA (COURANTS FAIBLES / SÉCURITÉ)', 'brouillon', DATE '2026-10-12', DATE '2026-11-11', cid, 0, 0, 0)
    RETURNING id INTO did;

    INSERT INTO public.crm_devis_lignes (
    devis_id, ordre, type, designation, description,
    article_id, categorie_id, quantite, unite, prix_ht, remise, tva, total_ht
    ) VALUES
  (did, 0, 'titre', 'LOT CFA-1 - SONORISATION', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 1, 'article', 'CFA-1.1 — Contrôleur système sonorisation (matrice de zones, priorités, entrée contact évacuation SSI)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 2, 'article', 'CFA-1.2 — Pupitre d''appel et poste de pupitre', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 3, 'article', 'CFA-1.3 — Lecteur source (MP3/USB/SD, tuner FM)', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 4, 'article', 'CFA-1.4 — Amplificateur de puissance 2x500 W', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 5, 'article', 'CFA-1.5 — Chargeur batterie 24 V + batteries 12 V/75 Ah', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 6, 'article', 'CFA-1.6 — Module de supervision de fin de ligne', NULL, NULL, NULL, 10, 'unite', 0, 0, 20, 0),
  (did, 7, 'article', 'CFA-1.7 — Baie technique 42 U + accessoires (ventilation, tablettes, organisateur, PDU)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 8, 'article', 'CFA-1.8 — Haut-parleur de plafond 6 W + dôme anti-feu', NULL, NULL, NULL, 72, 'unite', 0, 0, 20, 0),
  (did, 9, 'article', 'CFA-1.9 — Haut-parleur étanche 6 W + dôme acoustique', NULL, NULL, NULL, 8, 'unite', 0, 0, 20, 0),
  (did, 10, 'article', 'CFA-1.10 — Projecteur sonore 20 W unidirectionnel', NULL, NULL, NULL, 33, 'unite', 0, 0, 20, 0),
  (did, 11, 'article', 'CFA-1.11 — Projecteur sonore 10 W bidirectionnel', NULL, NULL, NULL, 22, 'unite', 0, 0, 20, 0),
  (did, 12, 'article', 'CFA-1.12 — Câblage 100 V résistant au feu (CR1), essais et mise en service', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 13, 'titre', 'LOT CFA-2 - DETECTION INCENDIE', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 14, 'article', 'CFA-2.1 — ECS/CMSI adressable 512 points', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 15, 'article', 'CFA-2.2 — Centralisateur de mise en sécurité', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 16, 'article', 'CFA-2.3 — Matériel déporté (répétiteur multivoies)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 17, 'article', 'CFA-2.4 — Module déporté ligne ouverte', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 18, 'article', 'CFA-2.5 — Module de surveillance', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 19, 'article', 'CFA-2.6 — Alimentation EN54-4 27,6 V/5 A + batteries', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 20, 'article', 'CFA-2.7 — Détecteur optique adressable', NULL, NULL, NULL, 80, 'unite', 0, 0, 20, 0),
  (did, 21, 'article', 'CFA-2.8 — Détecteur thermique adressable', NULL, NULL, NULL, 7, 'unite', 0, 0, 20, 0),
  (did, 22, 'article', 'CFA-2.9 — Détecteur multicritère (optique + thermique)', 'PM (pour mémoire)', NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 23, 'article', 'CFA-2.10 — Déclencheur manuel adressable + capot de protection', NULL, NULL, NULL, 29, 'unite', 0, 0, 20, 0),
  (did, 24, 'article', 'CFA-2.11 — Indicateur d''action', NULL, NULL, NULL, 7, 'unite', 0, 0, 20, 0),
  (did, 25, 'article', 'CFA-2.12 — Sirène d''évacuation avec socle', NULL, NULL, NULL, 18, 'unite', 0, 0, 20, 0),
  (did, 26, 'article', 'CFA-2.13 — Avertisseur sonore avec flash', NULL, NULL, NULL, 3, 'unite', 0, 0, 20, 0),
  (did, 27, 'article', 'CFA-2.14 — Détecteur linéaire à faisceau', NULL, NULL, NULL, 10, 'unite', 0, 0, 20, 0),
  (did, 28, 'article', 'CFA-2.15 — Module de report d''alarme SMS/GPRS', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 29, 'article', 'CFA-2.16 — Câblage (CR1/C2), essais et mise en service', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 30, 'titre', 'LOT CFA-3 - VIDEOSURVEILLANCE IP', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 31, 'article', 'CFA-3.1 — Caméra IP bullet extérieure IP66', NULL, NULL, NULL, 27, 'unite', 0, 0, 20, 0),
  (did, 32, 'article', 'CFA-3.2 — Caméra IP dôme fixe intérieure', NULL, NULL, NULL, 102, 'unite', 0, 0, 20, 0),
  (did, 33, 'article', 'CFA-3.3 — Caméra dôme varifocale', NULL, NULL, NULL, 19, 'unite', 0, 0, 20, 0),
  (did, 34, 'article', 'CFA-3.4 — NVR HD (dimensionné selon nombre de caméras, réserve 30%)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 35, 'article', 'CFA-3.5 — Commutateur PoE 24 ports', NULL, NULL, NULL, 7, 'unite', 0, 0, 20, 0),
  (did, 36, 'article', 'CFA-3.6 — Panneau de brassage 24 ports', NULL, NULL, NULL, 8, 'unite', 0, 0, 20, 0),
  (did, 37, 'article', 'CFA-3.7 — Écran de supervision et commande PTZ', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 38, 'article', 'CFA-3.8 — Baie informatique 16 U + unité de stockage 30 To', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 39, 'article', 'CFA-3.9 — Câblage, conduits, mise en marche et asservissement', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 40, 'titre', 'LOT CFA-4 - CONTROLE D''ACCES', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 41, 'article', 'CFA-4.1 — Centrale de contrôle d''accès (commutateurs PoE + logiciel de gestion)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 42, 'article', 'CFA-4.2 — Lecteur de badge de proximité', NULL, NULL, NULL, 4, 'unite', 0, 0, 20, 0),
  (did, 43, 'article', 'CFA-4.3 — Lecteur badge + digicode', NULL, NULL, NULL, 9, 'unite', 0, 0, 20, 0),
  (did, 44, 'article', 'CFA-4.4 — Lecteur badge + reconnaissance d''empreinte + reconnaissance faciale', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 45, 'article', 'CFA-4.5 — Ventouse électromagnétique', NULL, NULL, NULL, 9, 'unite', 0, 0, 20, 0),
  (did, 46, 'article', 'CFA-4.6 — Serrure électromagnétique', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 47, 'article', 'CFA-4.7 — Serrure électrique', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 48, 'article', 'CFA-4.8 — Kit de porte simple vantail à ventouse (bouton, brise-glace, ferme-porte)', NULL, NULL, NULL, 9, 'forfait', 0, 0, 20, 0),
  (did, 49, 'article', 'CFA-4.9 — Kit de porte double vantail à 2 ventouses', NULL, NULL, NULL, 3, 'forfait', 0, 0, 20, 0),
  (did, 50, 'article', 'CFA-4.10 — Kit de porte à serrure électrique', NULL, NULL, NULL, 2, 'forfait', 0, 0, 20, 0),
  (did, 51, 'article', 'CFA-4.11 — Pointeuse (badge/empreinte/code/facial) + support', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 52, 'article', 'CFA-4.12 — Cartes de proximité, programmation', NULL, NULL, NULL, 200, 'unite', 0, 0, 20, 0),
  (did, 53, 'article', 'CFA-4.13 — Vidéophone (intérieur + extérieur)', NULL, NULL, NULL, 2, 'forfait', 0, 0, 20, 0),
  (did, 54, 'article', 'CFA-4.14 — Câblage, conduits et mise en marche (contrôle d''accès)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 55, 'titre', 'LOT CFA-5 - ANTI-INTRUSION', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 56, 'article', 'CFA-5.1 — Centrale anti-intrusion (28 zones filaires/radio)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 57, 'article', 'CFA-5.2 — Détecteur volumétrique infrarouge/double technologie 180°', NULL, NULL, NULL, 24, 'unite', 0, 0, 20, 0),
  (did, 58, 'article', 'CFA-5.3 — Contact magnétique de porte', NULL, NULL, NULL, 25, 'unite', 0, 0, 20, 0),
  (did, 59, 'article', 'CFA-5.4 — Détecteur de présence d''eau IP (locaux techniques)', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 60, 'article', 'CFA-5.5 — Bouton anti-panique discret (caisse et caisse centrale)', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 61, 'article', 'CFA-5.6 — Clavier mural déporté', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 62, 'article', 'CFA-5.7 — Sirène d''intrusion intérieure', NULL, NULL, NULL, 20, 'unite', 0, 0, 20, 0),
  (did, 63, 'article', 'CFA-5.8 — Câblage, conduits et mise en service (anti-intrusion)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 64, 'titre', 'LOT CFA-6 - CABLAGE INFORMATIQUE / VDI', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 65, 'article', 'CFA-6.1 — Baie informatique fédératrice équipée, complète (panneaux de brassage catégorie 6A, cordons de brassage, tiroirs optiques, PDU connecté)', NULL, NULL, NULL, 3, 'forfait', 0, 0, 20, 0),
  (did, 66, 'article', 'CFA-6.2 — Baie informatique d''étage équipée, complète (panneaux de brassage catégorie 6A, cordons de brassage, tiroirs optiques, PDU connecté)', NULL, NULL, NULL, 2, 'forfait', 0, 0, 20, 0),
  (did, 67, 'article', 'CFA-6.3 — Câble 4 paires catégorie 6A SF/FTP', NULL, NULL, NULL, 12500, 'ml', 0, 0, 20, 0),
  (did, 68, 'article', 'CFA-6.4 — Câble multipaire cuivre 28 paires', 'PM (pour mémoire)', NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 69, 'article', 'CFA-6.5 — Fibre optique OM4 multimode 12 brins', NULL, NULL, NULL, 480, 'ml', 0, 0, 20, 0),
  (did, 70, 'article', 'CFA-6.6 — Prise RJ45 catégorie 6A', NULL, NULL, NULL, 156, 'unite', 0, 0, 20, 0),
  (did, 71, 'article', 'CFA-6.7 — Réseau de conduits (câblage informatique)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 72, 'article', 'CFA-6.8 — Obturation coupe-feu de l''ensemble des réservations de la salle de brassage', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 73, 'article', 'CFA-6.9 — Terre informatique (prise de terre dédiée, distincte de la terre électrique générale)', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 74, 'article', 'CFA-6.10 — Test de certification du câblage et mise en service', NULL, NULL, NULL, 1, 'forfait', 0, 0, 20, 0),
  (did, 75, 'article', 'CFA-6.11 — Onduleur centralisé (rackable) 10 kVA', NULL, NULL, NULL, 2, 'unite', 0, 0, 20, 0),
  (did, 76, 'titre', 'LOT CFA-7 - RESEAU WIFI ET COMMUTATION', NULL, NULL, NULL, 0, 'unite', 0, 0, 20, 0),
  (did, 77, 'article', 'CFA-7.1 — Borne WiFi 7 (point d''accès), voir caractéristiques CPS art. CFA-7.1', NULL, NULL, NULL, 24, 'unite', 0, 0, 20, 0),
  (did, 78, 'article', 'CFA-7.2 — Contrôleur WiFi (gestion centralisée des bornes)', NULL, NULL, NULL, 1, 'unite', 0, 0, 20, 0),
  (did, 79, 'article', 'CFA-7.3 — Commutateur (switch) 48 ports niveau 2, y compris module 1G', NULL, NULL, NULL, 3, 'unite', 0, 0, 20, 0),
  (did, 80, 'article', 'CFA-7.4 — Commutateur (switch) 24 ports niveau 3, y compris module 1G', NULL, NULL, NULL, 9, 'unite', 0, 0, 20, 0);

    RAISE NOTICE 'Devis CFA % créé (74 articles).', ref;
  END IF;
END $$;

-- Vérification
SELECT d.reference, d.titre, c.nom AS client, d.statut,
       COUNT(l.id) FILTER (WHERE l.type = 'titre')   AS nb_lots,
       COUNT(l.id) FILTER (WHERE l.type = 'article') AS nb_articles
FROM public.crm_devis d
JOIN public.clients c ON c.id = d.client_id
LEFT JOIN public.crm_devis_lignes l ON l.devis_id = d.id
WHERE lower(trim(c.nom)) = 'kitea rabat'
GROUP BY d.id, d.reference, d.titre, c.nom, d.statut
ORDER BY d.reference;
