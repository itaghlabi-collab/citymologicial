-- CITYMO — Prix des devis KITEA RABAT (CFO, CFA, FLUIDES)
-- Met à jour UNIQUEMENT le prix HT et le total HT des lignes article de ces 3 devis,
-- puis recalcule total HT / TVA / TTC de ces 3 devis (même calcul que l'ERP).
-- Sécurités : devis retrouvé par client KITEA RABAT + titre, uniquement s'il est en brouillon ;
-- une ligne n'est modifiée que si son prix est encore à 0 (aucun prix saisi n'est écrasé).
-- Aucune autre table, aucun autre devis, aucune désignation ni quantité n'est modifié.
-- Sources des prix : bibliothèque CITYMO (export du 07/10/2026) ou estimation marché marocain — voir Excel de contrôle.

-- ===== CFO (PR-2026-10-0007) =====
DO $$
DECLARE
  did UUID;
  n   INT;
BEGIN
  SELECT d.id INTO did FROM public.crm_devis d
  JOIN public.clients c ON c.id = d.client_id
  WHERE lower(trim(c.nom)) = 'kitea rabat' AND coalesce(trim(c.prenom), '') = ''
    AND d.titre = 'PROJET KITEA RABAT - LOT CFO (COURANTS FORTS)'
  LIMIT 1;

  IF did IS NULL THEN
    RAISE NOTICE 'Devis CFO introuvable — rien modifié.';
    RETURN;
  END IF;
  IF (SELECT statut FROM public.crm_devis WHERE id = did) <> 'brouillon' THEN
    RAISE NOTICE 'Devis CFO n''est plus en brouillon — rien modifié.';
    RETURN;
  END IF;

  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('CFO-1.1 — Foyer lumineux simple allumage principal', 400),
    ('CFO-1.2 — Foyer lumineux simple allumage secondaire', 250),
    ('CFO-1.3 — Foyer lumineux commandé par bouton poussoir', 350),
    ('CFO-1.4 — Foyer lumineux commandé par commutateur à clé', 550),
    ('CFO-1.5 — Détecteur de présence infrarouge', 650),
    ('CFO-1.6 — Goulotte lumineuse LED suspendue, module LED 4000K intégré, longueur 1500 mm (~57 W)', 250),
    ('CFO-1.7 — Goulotte lumineuse LED suspendue, module LED 4000K intégré, longueur 3000 mm (~115 W)', 350),
    ('CFO-1.8 — Downlight encastré LED 4000K, 35 W', 80),
    ('CFO-1.9 — Downlight encastré LED 4000K, 25 W', 80),
    ('CFO-1.10 — Spot sur rail LED 4000K, 32 W, faisceau 36°', 35),
    ('CFO-1.11 — Spot sur rail LED 4000K, 32 W, faisceau 60°', 35),
    ('CFO-1.12 — Projecteur linéaire sur rail LED 4000K, 60 W, symétrique', 60),
    ('CFO-1.13 — Projecteur linéaire sur rail LED 4000K, 60 W, asymétrique', 60),
    ('CFO-1.14 — Panneau LED 4000K, 1200 x 250 mm, 32 W', 120),
    ('CFO-1.15 — Panneau LED 4000K, 595 x 595 mm, 36 W', 120),
    ('CFO-1.16 — Hublot LED 4000K, 14 W', 100),
    ('CFO-1.17 — Luminaire industriel suspendu LED 4000K, puissance sélectionnable jusqu''à 200 W', 300),
    ('CFO-1.18 — Plafonnier linéaire LED 4000K, 60 W', 150),
    ('CFO-1.19 — Suspension décorative LED sur mesure (composition multi-éléments)', 1200),
    ('CFO-1.20 — Rail électrifié 3 circuits, longueur 1000 mm', 80),
    ('CFO-1.21 — Rail électrifié 3 circuits, longueur 2000 mm', 120),
    ('CFO-1.22 — Rail électrifié 3 circuits, longueur 3000 mm', 160),
    ('CFO-1.23 — Accessoires de raccordement et de suspension du rail 3 circuits (connecteurs, embouts, alimentation, étriers, câbles et manchons de suspension)', 15000),
    ('CFO-2.1 — Foyer de prises de courant principal', 450),
    ('CFO-2.2 — Foyer de prises de courant secondaire', 280),
    ('CFO-2.3 — Prise de courant normale 2x16 A+T', 220),
    ('CFO-2.4 — Prise de courant normale 2x16 A+T étanche', 320),
    ('CFO-2.5 — Prise de courant montée au plafond', 300),
    ('CFO-2.6 — Prise de courant ondulée 2x16 A+T (circuit TEO)', 280),
    ('CFO-2.7 — Prise informatique RJ45', 375),
    ('CFO-2.8 — Bloc 4 prises normales + 4 prises ondulées + 4 RJ45', 2800),
    ('CFO-2.10 — Alimentation climatisation gainable 8 kW (unité intérieure)', 1800),
    ('CFO-2.11 — Alimentation cassette climatisation DRV 2,5 kW (unité intérieure, attente dédiée par cassette)', 900),
    ('CFO-2.12 — Alimentation DRV 10 kW (unité extérieure climatisation)', 3500),
    ('CFO-2.13 — Alimentation caisson de ventilation 2,5 kW', 1200),
    ('CFO-2.14 — Alimentation dédiée ascenseur', 6000),
    ('CFO-2.15 — Alimentation dédiée monte-charge', 6000),
    ('CFO-2.16 — Alimentation dédiée escalier mécanique (escalator)', 8000),
    ('CFO-2.17 — Alimentation caisson de désenfumage 9 kW', 3500),
    ('CFO-2.18 — Alimentation détection incendie', 3500),
    ('CFO-2.19 — Alimentation détection intrusion', 2500),
    ('CFO-2.20 — Alimentation sonorisation', 2500),
    ('CFO-2.21 — Alimentation local informatique', 6000),
    ('CFO-2.22 — Alimentation des enseignes', 1200),
    ('CFO-2.23 — Alimentation éclairage extérieur', 1500),
    ('CFO-2.24 — Alimentation chauffe-eau électrique instantané 8 kW', 1500),
    ('CFO-2.25 — Alimentation sèche-main 6,5 kW', 1200),
    ('CFO-2.26 — Alimentation onduleurs 20kva', 8000),
    ('CFO-2.27 — Attentes électriques diverses 2,3 kW (portes automatiques, armoire informatique, panneaux d''affichage)', 650),
    ('CFO-2.28 — Attentes électriques ascensseur / escalator / monte charge en 4 x 10 mm²', 4500),
    ('CFO-2.29 — Attentes électriques CR1 de 4 x10 mm²', 4000),
    ('CFO-3.1 — Tableau de protection électrique / TGBT (IP31, réserve 25%, parafoudre)', 280000),
    ('CFO-3.2 — Armoire divisionnaire (TE RDC / TE ETAGE)', 45000),
    ('CFO-3.3 — Liaison électrique TGBT - transformateur existant (raccordement)', 1100),
    ('CFO-3.4 — Liaison électrique TGBT - TE éclairage', 400),
    ('CFO-3.5 — Liaison électrique TGBT - TE prises de courant', 400),
    ('CFO-3.6 — Liaison électrique TGBT - TE climatisation', 450),
    ('CFO-3.7 — Liaison électrique TGBT - TE ondulé (TEO)', 350),
    ('CFO-3.8 — Liaison électrique TGBT - TE secouru', 400),
    ('CFO-3.9 — Liaison électrique groupe électrogène - armoire (coffret) de secours', 750),
    ('CFO-3.10 — Réfection de la mise à la terre du bâtiment (TGBT), y compris terre séparée des compteurs (voir CPS art. CFO-3.10)', 70000),
    ('CFO-4.1 — Chemin de câble - largeur 365 mm (voir CPS art. CFO-4.1)', 380),
    ('CFO-4.2 — Chemin de câble - largeur 250 mm (voir CPS art. CFO-4.2)', 300),
    ('CFO-4.3 — Chemin de câble - largeur 95 mm (voir CPS art. CFO-4.3)', 140),
    ('CFO-4.4 — Chemin de câble - largeur 63 mm (voir CPS art. CFO-4.4)', 110),
    ('CFO-4.5 — Tubage (fourreaux/conduits)', 45000),
    ('CFO-5.1 — Groupe électrogène 200 kVA complet, y compris désinstallation et évacuation de l''ancien groupe, mise à la terre séparée et travaux de gros-œuvre du local associés', 420000),
    ('CFO-6.1 — Fourniture, pose, raccordement, programmation, essais et mise en service d’une centrale d’alimentation centralisée', 65000),
    ('CFO-6.2 — Bloc autonome / luminaire d’éclairage de sécurité d’ambiance adressable', 1200),
    ('CFO-6.3 — Bloc d’éclairage de sécurité de balisage adressable', 1100),
    ('CFO-7.1 — Alimentation 5*4mm²', 120),
    ('CFO-7.2 — Prise courant 380V (TRIPHASE)', 650),
    ('CFO-8.1 — Démontage de l’existant', 35000),
    ('CFO-8.2 — Installation du chantier', 25000)
  ) AS v(designation, prix)
  WHERE l.devis_id = did
    AND coalesce(l.type, 'article') = 'article'
    AND l.designation = v.designation
    AND coalesce(l.prix_ht, 0) = 0;
  GET DIAGNOSTICS n = ROW_COUNT;

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

  RAISE NOTICE 'Devis CFO : % lignes chiffrées, totaux recalculés.', n;
END $$;

-- ===== CFA (PR-2026-10-0008) =====
DO $$
DECLARE
  did UUID;
  n   INT;
BEGIN
  SELECT d.id INTO did FROM public.crm_devis d
  JOIN public.clients c ON c.id = d.client_id
  WHERE lower(trim(c.nom)) = 'kitea rabat' AND coalesce(trim(c.prenom), '') = ''
    AND d.titre = 'PROJET KITEA RABAT - LOT CFA (COURANTS FAIBLES / SÉCURITÉ)'
  LIMIT 1;

  IF did IS NULL THEN
    RAISE NOTICE 'Devis CFA introuvable — rien modifié.';
    RETURN;
  END IF;
  IF (SELECT statut FROM public.crm_devis WHERE id = did) <> 'brouillon' THEN
    RAISE NOTICE 'Devis CFA n''est plus en brouillon — rien modifié.';
    RETURN;
  END IF;

  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('CFA-1.1 — Contrôleur système sonorisation (matrice de zones, priorités, entrée contact évacuation SSI)', 45000),
    ('CFA-1.2 — Pupitre d''appel et poste de pupitre', 6500),
    ('CFA-1.3 — Lecteur source (MP3/USB/SD, tuner FM)', 4500),
    ('CFA-1.4 — Amplificateur de puissance 2x500 W', 14000),
    ('CFA-1.5 — Chargeur batterie 24 V + batteries 12 V/75 Ah', 9000),
    ('CFA-1.6 — Module de supervision de fin de ligne', 900),
    ('CFA-1.7 — Baie technique 42 U + accessoires (ventilation, tablettes, organisateur, PDU)', 12000),
    ('CFA-1.8 — Haut-parleur de plafond 6 W + dôme anti-feu', 650),
    ('CFA-1.9 — Haut-parleur étanche 6 W + dôme acoustique', 750),
    ('CFA-1.10 — Projecteur sonore 20 W unidirectionnel', 1100),
    ('CFA-1.11 — Projecteur sonore 10 W bidirectionnel', 1300),
    ('CFA-1.12 — Câblage 100 V résistant au feu (CR1), essais et mise en service', 55000),
    ('CFA-2.1 — ECS/CMSI adressable 512 points', 95000),
    ('CFA-2.2 — Centralisateur de mise en sécurité', 45000),
    ('CFA-2.3 — Matériel déporté (répétiteur multivoies)', 12000),
    ('CFA-2.4 — Module déporté ligne ouverte', 6000),
    ('CFA-2.5 — Module de surveillance', 5000),
    ('CFA-2.6 — Alimentation EN54-4 27,6 V/5 A + batteries', 6500),
    ('CFA-2.7 — Détecteur optique adressable', 650),
    ('CFA-2.8 — Détecteur thermique adressable', 650),
    ('CFA-2.10 — Déclencheur manuel adressable + capot de protection', 750),
    ('CFA-2.11 — Indicateur d''action', 250),
    ('CFA-2.12 — Sirène d''évacuation avec socle', 900),
    ('CFA-2.13 — Avertisseur sonore avec flash', 1200),
    ('CFA-2.14 — Détecteur linéaire à faisceau', 12000),
    ('CFA-2.15 — Module de report d''alarme SMS/GPRS', 4500),
    ('CFA-2.16 — Câblage (CR1/C2), essais et mise en service', 85000),
    ('CFA-3.1 — Caméra IP bullet extérieure IP66', 1000),
    ('CFA-3.2 — Caméra IP dôme fixe intérieure', 950),
    ('CFA-3.3 — Caméra dôme varifocale', 2200),
    ('CFA-3.4 — NVR HD (dimensionné selon nombre de caméras, réserve 30%)', 25000),
    ('CFA-3.5 — Commutateur PoE 24 ports', 8525),
    ('CFA-3.6 — Panneau de brassage 24 ports', 450),
    ('CFA-3.7 — Écran de supervision et commande PTZ', 18000),
    ('CFA-3.8 — Baie informatique 16 U + unité de stockage 30 To', 25000),
    ('CFA-3.9 — Câblage, conduits, mise en marche et asservissement', 45000),
    ('CFA-4.1 — Centrale de contrôle d''accès (commutateurs PoE + logiciel de gestion)', 25000),
    ('CFA-4.2 — Lecteur de badge de proximité', 1500),
    ('CFA-4.3 — Lecteur badge + digicode', 2200),
    ('CFA-4.4 — Lecteur badge + reconnaissance d''empreinte + reconnaissance faciale', 6500),
    ('CFA-4.5 — Ventouse électromagnétique', 1200),
    ('CFA-4.6 — Serrure électromagnétique', 1500),
    ('CFA-4.7 — Serrure électrique', 1200),
    ('CFA-4.8 — Kit de porte simple vantail à ventouse (bouton, brise-glace, ferme-porte)', 1800),
    ('CFA-4.9 — Kit de porte double vantail à 2 ventouses', 3200),
    ('CFA-4.10 — Kit de porte à serrure électrique', 1600),
    ('CFA-4.11 — Pointeuse (badge/empreinte/code/facial) + support', 4500),
    ('CFA-4.12 — Cartes de proximité, programmation', 25),
    ('CFA-4.13 — Vidéophone (intérieur + extérieur)', 4500),
    ('CFA-4.14 — Câblage, conduits et mise en marche (contrôle d''accès)', 18000),
    ('CFA-5.1 — Centrale anti-intrusion (28 zones filaires/radio)', 12000),
    ('CFA-5.2 — Détecteur volumétrique infrarouge/double technologie 180°', 650),
    ('CFA-5.3 — Contact magnétique de porte', 250),
    ('CFA-5.4 — Détecteur de présence d''eau IP (locaux techniques)', 800),
    ('CFA-5.5 — Bouton anti-panique discret (caisse et caisse centrale)', 450),
    ('CFA-5.6 — Clavier mural déporté', 1800),
    ('CFA-5.7 — Sirène d''intrusion intérieure', 650),
    ('CFA-5.8 — Câblage, conduits et mise en service (anti-intrusion)', 15000),
    ('CFA-6.1 — Baie informatique fédératrice équipée, complète (panneaux de brassage catégorie 6A, cordons de brassage, tiroirs optiques, PDU connecté)', 45000),
    ('CFA-6.2 — Baie informatique d''étage équipée, complète (panneaux de brassage catégorie 6A, cordons de brassage, tiroirs optiques, PDU connecté)', 30000),
    ('CFA-6.3 — Câble 4 paires catégorie 6A SF/FTP', 35),
    ('CFA-6.5 — Fibre optique OM4 multimode 12 brins', 75),
    ('CFA-6.6 — Prise RJ45 catégorie 6A', 375),
    ('CFA-6.7 — Réseau de conduits (câblage informatique)', 35000),
    ('CFA-6.8 — Obturation coupe-feu de l''ensemble des réservations de la salle de brassage', 8000),
    ('CFA-6.9 — Terre informatique (prise de terre dédiée, distincte de la terre électrique générale)', 15000),
    ('CFA-6.10 — Test de certification du câblage et mise en service', 12000),
    ('CFA-6.11 — Onduleur centralisé (rackable) 10 kVA', 28000),
    ('CFA-7.1 — Borne WiFi 7 (point d''accès), voir caractéristiques CPS art. CFA-7.1', 4500),
    ('CFA-7.2 — Contrôleur WiFi (gestion centralisée des bornes)', 3335),
    ('CFA-7.3 — Commutateur (switch) 48 ports niveau 2, y compris module 1G', 9500),
    ('CFA-7.4 — Commutateur (switch) 24 ports niveau 3, y compris module 1G', 12000)
  ) AS v(designation, prix)
  WHERE l.devis_id = did
    AND coalesce(l.type, 'article') = 'article'
    AND l.designation = v.designation
    AND coalesce(l.prix_ht, 0) = 0;
  GET DIAGNOSTICS n = ROW_COUNT;

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

  RAISE NOTICE 'Devis CFA : % lignes chiffrées, totaux recalculés.', n;
END $$;

-- ===== FLUIDES (PR-2026-10-0009) =====
DO $$
DECLARE
  did UUID;
  n   INT;
BEGIN
  SELECT d.id INTO did FROM public.crm_devis d
  JOIN public.clients c ON c.id = d.client_id
  WHERE lower(trim(c.nom)) = 'kitea rabat' AND coalesce(trim(c.prenom), '') = ''
    AND d.titre = 'PROJET KITEA RABAT - LOT FLUIDES'
  LIMIT 1;

  IF did IS NULL THEN
    RAISE NOTICE 'Devis FLUIDES introuvable — rien modifié.';
    RETURN;
  END IF;
  IF (SELECT statut FROM public.crm_devis WHERE id = did) <> 'brouillon' THEN
    RAISE NOTICE 'Devis FLUIDES n''est plus en brouillon — rien modifié.';
    RETURN;
  END IF;

  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('1.01 — BRANCHEMENT EAU POTABLE', 15000),
    ('01.02.01 — Compteur eau calibre 20 (KETIA)', 3500),
    ('01.03.01 — Ø 32 intérieur', 75),
    ('01.03.02 — Ø 25 intérieur', 55),
    ('01.03.03 — Ø 20 intérieur', 45),
    ('01.03.04 — Ø 16 intérieur', 40),
    ('01.04.01 — Ø 32', 220),
    ('01.04.02 — Ø 25', 180),
    ('01.04.03 — Ø 20', 150),
    ('01.04.04 — Ø 15', 120),
    ('1.05 — LAVABO SUR COLONNE (Pose)', 400),
    ('1.06 — W-C A L''ANGLAISE A RESERVOIR (Pose)', 500),
    ('1.07 — ÉVIER EN ACIER INOXYDABLE (Pose)', 400),
    ('1.08 — ANTI – BELIER', 650),
    ('01.09.01 — DN 32', 1800),
    ('01.09.02 — DN 40', 2600),
    ('01.10.01 — Chauffe eau 50 litres', 4500),
    ('01.11.01.01 — Ø 75', 90),
    ('01.11.01.02 — Ø 110', 120),
    ('01.11.01.03 — Ø 125', 150),
    ('01.011.02.01 — Ø 80', 450),
    ('1.12 — TUBE EN PVC Ø = 40 à 50 mm', 60),
    ('2.01 — BRANCHEMENT EAU INCENDIE', 35000),
    ('02.02.01 — Ø 80/90', 450),
    ('02.02.02 — Ø 66/76', 380),
    ('02.02.03 — Ø 40/49 à Ø 50/60', 280),
    ('02.03.02 — DN 25/8 (hall de vente, galerie marchande)', 4500),
    ('02.03.03 — DN 33/12 (réserves)', 6500),
    ('2.04 — VANNE D''ISOLEMENT', 1500),
    ('02.05.01 — Extincteur à Eau pulvérisée 6 litres', 450),
    ('02.05.02 — Extincteur à poudre polyvalente (ABC) de 9 kg', 700),
    ('02.05.03 — Extincteur à C02 de 2 kg', 210),
    ('02.05.04 — Extincteur à C02 de 6 kg', 1100),
    ('03.01.01 — Puissance frigorifique 12.60 KwF', 42000),
    ('03.01.02 — Puissance frigorifique 17.00 KwF', 52000),
    ('03.02.01 — Ø 400 à Ø 510', 650),
    ('3.03 — GAINE REGTANGULAIRE PRE--ISOLEE', 450),
    ('03.04.01 — Ø 200 A Ø 250', 150),
    ('3.05 — GAINE EN TÔLE GALVANISEE', 380),
    ('03.06.01 — Ø 100 à Ø 315', 180),
    ('03.06.02 — Ø 300 à Ø 550', 320),
    ('03.06.03 — Ø 630', 450),
    ('03.07.01 — Débit 200 à 600 m³/h', 650),
    ('03.07.02 — Débit 650 à 1000 m³/h', 850),
    ('03.07.03 — Débit 1100 à 2000 m³/h', 1300),
    ('3.08 — GRILLE DE TRANSFERT 500 x 150', 450),
    ('3.09 — RÉGULATEUR DE DÉBIT POUR GAINE', 1500),
    ('03.10.01 — 4000 m³/h à 5000 m³/h', 2500),
    ('03.11.01 — Ø 250 à Ø 315', 450),
    ('03.11.02 — Ø 100 à Ø 200', 300),
    ('3.12 — ATTENTE ÉVACUATION CONDENSÂT', 60),
    ('03.13.02 — 1500 à 2000', 18000),
    ('03.13.03 — 2500 à 4000 m³/h', 26000),
    ('03.14.01 — 600 à 1000 m³/h', 9500),
    ('03.14.02 — 1200 à 2000 m³/h', 14000),
    ('03.14.03 — 2200 à 4000 m³/h', 22000),
    ('3.15 — BOUCHE VMC AUTO RÉGLABLE', 250),
    ('03.16.01 — 3 kW F', 7000),
    ('03.16.02 — 5 kW F', 11500),
    ('Puissance Frigorifique : 28 KW', 120000),
    ('Puissance Frigorifique : 2,8 KW', 9500),
    ('Puissance Frigorifique : 5,6 KW', 12500),
    ('Puissance Frigorifique : 3,6 KW', 11000),
    ('PLÉNUM DE SOUFFLAGE', 1800),
    ('03.17.01 — a) Tableau et Raccordement électrique Climatisations Unités extérieures et intérieures hall de vente', 45000),
    ('03.17.02 — Tableau et Raccordement électrique Caissons de ventilation.', 25000),
    ('3.18 — REPÉRAGE', 8000),
    ('04.01.01 — Débit d’air de 34 000 m3/h / 68 000 m3/h à HMT appropriée', 150000),
    ('04.02.01 — Débit d’air de 41 000 m3/h / 82 000 m3/h à HMT appropriée', 165000),
    ('Débit : 9500 m3/h / 19 000 m3/h', 38000),
    ('Débit : 20 000 m3/h / 40 000 m3/h', 58000),
    ('Débit : 30 000 m3/h / 60 000 m3/h', 75000),
    ('Débit : 9000 m3/h / 18 000 m3/h', 36000),
    ('Débit : 17 000 m3/h / 34 000 m3/h', 52000),
    ('Débit : 25 000 m3/h / 50 000 m3/h', 68000),
    ('4.03 — COFFRET DE RELAYAGE', 4500),
    ('4.04 — CLAPET COUPE-FEU', 4500),
    ('4.05 — GAINE EN STAFF 4 CM', 380),
    ('4.06 — GAINE EN TOLE GALVANISEE', 380),
    ('4.07 — CALFEUTREMENT GAINES TECHNIQUES', 450),
    ('04.08.01 — Désenfumage HALL DE VENTE (RDC)', 65000),
    ('Désenfumage HALL DE VENTE (R+1)', 55000),
    ('04.08.02 — Désenfumage STOCK', 45000),
    ('5.01 — TETES SPRINKLEURS (DN15 à DN20)', 280),
    ('05.02.01.01 — Ø 150', 950),
    ('05.02.01.01 — Ø 102/114', 650),
    ('05.02.01.02 — Ø 66/76', 420),
    ('05.02.01.03 — Ø 50/60', 320),
    ('05.02.01.04 — Ø 40/49', 260),
    ('05.02.01.05 — Ø 33/42', 220),
    ('05.02.01.06 — Ø 26/32', 180),
    ('05.02.02.01 — zone Hall de Vente', 85000),
    ('05.02.02.02 — zone Bureaux', 15000),
    ('05.02.02.03 — zone réserves', 45000),
    ('5.03 — VIDANGES ET POINT F', 6500),
    ('5.04 — ARMOIRE ÉLECTRIQUE ET CÂBLAGE', 45000),
    ('5.05 — ARMOIRE REPORTS D''ALARMES', 18000),
    ('5.06 — REPERAGE', 8000),
    ('5.07 — INDICATEUR DE PASSAGE D''EAU', 9000),
    ('6.01 — Démontage de l’existant', 40000),
    ('6.02 — Installation du chantier', 25000)
  ) AS v(designation, prix)
  WHERE l.devis_id = did
    AND coalesce(l.type, 'article') = 'article'
    AND l.designation = v.designation
    AND coalesce(l.prix_ht, 0) = 0;
  GET DIAGNOSTICS n = ROW_COUNT;

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

  RAISE NOTICE 'Devis FLUIDES : % lignes chiffrées, totaux recalculés.', n;
END $$;

SELECT 'prix KITEA RABAT OK' AS status;
