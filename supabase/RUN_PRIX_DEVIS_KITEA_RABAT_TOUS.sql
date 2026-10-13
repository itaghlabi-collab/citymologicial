-- CITYMO — Prix des 4 devis KITEA RABAT (CFO, CFA, FLUIDES, CLOISON)
-- Complète UNIQUEMENT les lignes article dont le prix est encore à 0 : les prix déjà saisis ne sont pas touchés.
-- Lignes retrouvées par désignation exacte, puis par désignation sans code / majuscules / espaces / apostrophes
-- (cas des désignations modifiées dans l'ERP). Puis recalcul total HT / TVA / TTC (même calcul que l'ERP).
-- Devis retrouvé par client KITEA RABAT + titre, uniquement s'il est en brouillon.
-- Aucune autre table, aucun autre devis, aucune désignation ni quantité n'est modifié. Ré-exécutable sans risque.
-- Sources : bibliothèque CITYMO (export du 07/10/2026) ou estimation marché marocain — voir Excel de contrôle.

-- ===== CFO =====
DO $$
DECLARE
  did UUID;
  n1  INT;
  n2  INT;
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

  -- 1) désignation identique
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
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- 2) désignation modifiée dans l'ERP (code retiré, majuscules, espaces, apostrophes)
  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('foyer lumineux simple allumage principal', 400),
    ('foyer lumineux simple allumage secondaire', 250),
    ('foyer lumineux commandé par bouton poussoir', 350),
    ('foyer lumineux commandé par commutateur à clé', 550),
    ('détecteur de présence infrarouge', 650),
    ('goulotte lumineuse led suspendue, module led 4000k intégré, longueur 1500 mm (~57 w)', 250),
    ('goulotte lumineuse led suspendue, module led 4000k intégré, longueur 3000 mm (~115 w)', 350),
    ('downlight encastré led 4000k, 35 w', 80),
    ('downlight encastré led 4000k, 25 w', 80),
    ('spot sur rail led 4000k, 32 w, faisceau 36°', 35),
    ('spot sur rail led 4000k, 32 w, faisceau 60°', 35),
    ('projecteur linéaire sur rail led 4000k, 60 w, symétrique', 60),
    ('projecteur linéaire sur rail led 4000k, 60 w, asymétrique', 60),
    ('panneau led 4000k, 1200 x 250 mm, 32 w', 120),
    ('panneau led 4000k, 595 x 595 mm, 36 w', 120),
    ('hublot led 4000k, 14 w', 100),
    ('luminaire industriel suspendu led 4000k, puissance sélectionnable jusqu''à 200 w', 300),
    ('plafonnier linéaire led 4000k, 60 w', 150),
    ('suspension décorative led sur mesure (composition multi-éléments)', 1200),
    ('rail électrifié 3 circuits, longueur 1000 mm', 80),
    ('rail électrifié 3 circuits, longueur 2000 mm', 120),
    ('rail électrifié 3 circuits, longueur 3000 mm', 160),
    ('accessoires de raccordement et de suspension du rail 3 circuits (connecteurs, embouts, alimentation, étriers, câbles et manchons de suspension)', 15000),
    ('foyer de prises de courant principal', 450),
    ('foyer de prises de courant secondaire', 280),
    ('prise de courant normale 2x16 a+t', 220),
    ('prise de courant normale 2x16 a+t étanche', 320),
    ('prise de courant montée au plafond', 300),
    ('prise de courant ondulée 2x16 a+t (circuit teo)', 280),
    ('prise informatique rj45', 375),
    ('bloc 4 prises normales + 4 prises ondulées + 4 rj45', 2800),
    ('alimentation climatisation gainable 8 kw (unité intérieure)', 1800),
    ('alimentation cassette climatisation drv 2,5 kw (unité intérieure, attente dédiée par cassette)', 900),
    ('alimentation drv 10 kw (unité extérieure climatisation)', 3500),
    ('alimentation caisson de ventilation 2,5 kw', 1200),
    ('alimentation dédiée ascenseur', 6000),
    ('alimentation dédiée monte-charge', 6000),
    ('alimentation dédiée escalier mécanique (escalator)', 8000),
    ('alimentation caisson de désenfumage 9 kw', 3500),
    ('alimentation détection incendie', 3500),
    ('alimentation détection intrusion', 2500),
    ('alimentation sonorisation', 2500),
    ('alimentation local informatique', 6000),
    ('alimentation des enseignes', 1200),
    ('alimentation éclairage extérieur', 1500),
    ('alimentation chauffe-eau électrique instantané 8 kw', 1500),
    ('alimentation sèche-main 6,5 kw', 1200),
    ('alimentation onduleurs 20kva', 8000),
    ('attentes électriques diverses 2,3 kw (portes automatiques, armoire informatique, panneaux d''affichage)', 650),
    ('attentes électriques ascensseur / escalator / monte charge en 4 x 10 mm²', 4500),
    ('attentes électriques cr1 de 4 x10 mm²', 4000),
    ('tableau de protection électrique / tgbt (ip31, réserve 25%, parafoudre)', 280000),
    ('armoire divisionnaire (te rdc / te etage)', 45000),
    ('liaison électrique tgbt - transformateur existant (raccordement)', 1100),
    ('liaison électrique tgbt - te éclairage', 400),
    ('liaison électrique tgbt - te prises de courant', 400),
    ('liaison électrique tgbt - te climatisation', 450),
    ('liaison électrique tgbt - te ondulé (teo)', 350),
    ('liaison électrique tgbt - te secouru', 400),
    ('liaison électrique groupe électrogène - armoire (coffret) de secours', 750),
    ('réfection de la mise à la terre du bâtiment (tgbt), y compris terre séparée des compteurs (voir cps art. cfo-3.10)', 70000),
    ('chemin de câble - largeur 365 mm (voir cps art. cfo-4.1)', 380),
    ('chemin de câble - largeur 250 mm (voir cps art. cfo-4.2)', 300),
    ('chemin de câble - largeur 95 mm (voir cps art. cfo-4.3)', 140),
    ('chemin de câble - largeur 63 mm (voir cps art. cfo-4.4)', 110),
    ('tubage (fourreaux/conduits)', 45000),
    ('groupe électrogène 200 kva complet, y compris désinstallation et évacuation de l''ancien groupe, mise à la terre séparée et travaux de gros-œuvre du local associés', 420000),
    ('fourniture, pose, raccordement, programmation, essais et mise en service d''une centrale d''alimentation centralisée', 65000),
    ('bloc autonome / luminaire d''éclairage de sécurité d''ambiance adressable', 1200),
    ('bloc d''éclairage de sécurité de balisage adressable', 1100),
    ('alimentation 5*4mm²', 120),
    ('prise courant 380v (triphase)', 650),
    ('démontage de l''existant', 35000),
    ('installation du chantier', 25000)
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

  RAISE NOTICE 'Devis CFO : % lignes complétées, totaux recalculés.', n1 + n2;
END $$;

-- ===== CFA =====
DO $$
DECLARE
  did UUID;
  n1  INT;
  n2  INT;
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

  -- 1) désignation identique
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
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- 2) désignation modifiée dans l'ERP (code retiré, majuscules, espaces, apostrophes)
  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('contrôleur système sonorisation (matrice de zones, priorités, entrée contact évacuation ssi)', 45000),
    ('pupitre d''appel et poste de pupitre', 6500),
    ('lecteur source (mp3/usb/sd, tuner fm)', 4500),
    ('amplificateur de puissance 2x500 w', 14000),
    ('chargeur batterie 24 v + batteries 12 v/75 ah', 9000),
    ('module de supervision de fin de ligne', 900),
    ('baie technique 42 u + accessoires (ventilation, tablettes, organisateur, pdu)', 12000),
    ('haut-parleur de plafond 6 w + dôme anti-feu', 650),
    ('haut-parleur étanche 6 w + dôme acoustique', 750),
    ('projecteur sonore 20 w unidirectionnel', 1100),
    ('projecteur sonore 10 w bidirectionnel', 1300),
    ('câblage 100 v résistant au feu (cr1), essais et mise en service', 55000),
    ('ecs/cmsi adressable 512 points', 95000),
    ('centralisateur de mise en sécurité', 45000),
    ('matériel déporté (répétiteur multivoies)', 12000),
    ('module déporté ligne ouverte', 6000),
    ('module de surveillance', 5000),
    ('alimentation en54-4 27,6 v/5 a + batteries', 6500),
    ('détecteur optique adressable', 650),
    ('détecteur thermique adressable', 650),
    ('déclencheur manuel adressable + capot de protection', 750),
    ('indicateur d''action', 250),
    ('sirène d''évacuation avec socle', 900),
    ('avertisseur sonore avec flash', 1200),
    ('détecteur linéaire à faisceau', 12000),
    ('module de report d''alarme sms/gprs', 4500),
    ('câblage (cr1/c2), essais et mise en service', 85000),
    ('caméra ip bullet extérieure ip66', 1000),
    ('caméra ip dôme fixe intérieure', 950),
    ('caméra dôme varifocale', 2200),
    ('nvr hd (dimensionné selon nombre de caméras, réserve 30%)', 25000),
    ('commutateur poe 24 ports', 8525),
    ('panneau de brassage 24 ports', 450),
    ('écran de supervision et commande ptz', 18000),
    ('baie informatique 16 u + unité de stockage 30 to', 25000),
    ('câblage, conduits, mise en marche et asservissement', 45000),
    ('centrale de contrôle d''accès (commutateurs poe + logiciel de gestion)', 25000),
    ('lecteur de badge de proximité', 1500),
    ('lecteur badge + digicode', 2200),
    ('lecteur badge + reconnaissance d''empreinte + reconnaissance faciale', 6500),
    ('ventouse électromagnétique', 1200),
    ('serrure électromagnétique', 1500),
    ('serrure électrique', 1200),
    ('kit de porte simple vantail à ventouse (bouton, brise-glace, ferme-porte)', 1800),
    ('kit de porte double vantail à 2 ventouses', 3200),
    ('kit de porte à serrure électrique', 1600),
    ('pointeuse (badge/empreinte/code/facial) + support', 4500),
    ('cartes de proximité, programmation', 25),
    ('vidéophone (intérieur + extérieur)', 4500),
    ('câblage, conduits et mise en marche (contrôle d''accès)', 18000),
    ('centrale anti-intrusion (28 zones filaires/radio)', 12000),
    ('détecteur volumétrique infrarouge/double technologie 180°', 650),
    ('contact magnétique de porte', 250),
    ('détecteur de présence d''eau ip (locaux techniques)', 800),
    ('bouton anti-panique discret (caisse et caisse centrale)', 450),
    ('clavier mural déporté', 1800),
    ('sirène d''intrusion intérieure', 650),
    ('câblage, conduits et mise en service (anti-intrusion)', 15000),
    ('baie informatique fédératrice équipée, complète (panneaux de brassage catégorie 6a, cordons de brassage, tiroirs optiques, pdu connecté)', 45000),
    ('baie informatique d''étage équipée, complète (panneaux de brassage catégorie 6a, cordons de brassage, tiroirs optiques, pdu connecté)', 30000),
    ('câble 4 paires catégorie 6a sf/ftp', 35),
    ('fibre optique om4 multimode 12 brins', 75),
    ('prise rj45 catégorie 6a', 375),
    ('réseau de conduits (câblage informatique)', 35000),
    ('obturation coupe-feu de l''ensemble des réservations de la salle de brassage', 8000),
    ('terre informatique (prise de terre dédiée, distincte de la terre électrique générale)', 15000),
    ('test de certification du câblage et mise en service', 12000),
    ('onduleur centralisé (rackable) 10 kva', 28000),
    ('borne wifi 7 (point d''accès), voir caractéristiques cps art. cfa-7.1', 4500),
    ('contrôleur wifi (gestion centralisée des bornes)', 3335),
    ('commutateur (switch) 48 ports niveau 2, y compris module 1g', 9500),
    ('commutateur (switch) 24 ports niveau 3, y compris module 1g', 12000)
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

  RAISE NOTICE 'Devis CFA : % lignes complétées, totaux recalculés.', n1 + n2;
END $$;

-- ===== FLUIDES =====
DO $$
DECLARE
  did UUID;
  n1  INT;
  n2  INT;
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

  -- 1) désignation identique
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
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- 2) désignation modifiée dans l'ERP (code retiré, majuscules, espaces, apostrophes)
  UPDATE public.crm_devis_lignes l
  SET prix_ht  = v.prix,
      total_ht = round(l.quantite * v.prix * (1 - coalesce(l.remise, 0) / 100.0), 2)
  FROM (VALUES
    ('branchement eau potable', 15000),
    ('compteur eau calibre 20 (ketia)', 3500),
    ('ø 32 intérieur', 75),
    ('ø 25 intérieur', 55),
    ('ø 20 intérieur', 45),
    ('ø 16 intérieur', 40),
    ('ø 32', 220),
    ('ø 25', 180),
    ('ø 20', 150),
    ('ø 15', 120),
    ('lavabo sur colonne (pose)', 400),
    ('w-c a l''anglaise a reservoir (pose)', 500),
    ('évier en acier inoxydable (pose)', 400),
    ('anti – belier', 650),
    ('dn 32', 1800),
    ('dn 40', 2600),
    ('chauffe eau 50 litres', 4500),
    ('ø 75', 90),
    ('ø 110', 120),
    ('ø 125', 150),
    ('ø 80', 450),
    ('tube en pvc ø = 40 à 50 mm', 60),
    ('branchement eau incendie', 35000),
    ('ø 80/90', 450),
    ('ø 40/49 à ø 50/60', 280),
    ('dn 25/8 (hall de vente, galerie marchande)', 4500),
    ('dn 33/12 (réserves)', 6500),
    ('vanne d''isolement', 1500),
    ('extincteur à eau pulvérisée 6 litres', 450),
    ('extincteur à poudre polyvalente (abc) de 9 kg', 700),
    ('extincteur à c02 de 2 kg', 210),
    ('extincteur à c02 de 6 kg', 1100),
    ('puissance frigorifique 12.60 kwf', 42000),
    ('puissance frigorifique 17.00 kwf', 52000),
    ('ø 400 à ø 510', 650),
    ('gaine regtangulaire pre--isolee', 450),
    ('ø 200 a ø 250', 150),
    ('gaine en tôle galvanisee', 380),
    ('ø 100 à ø 315', 180),
    ('ø 300 à ø 550', 320),
    ('ø 630', 450),
    ('débit 200 à 600 m³/h', 650),
    ('débit 650 à 1000 m³/h', 850),
    ('débit 1100 à 2000 m³/h', 1300),
    ('grille de transfert 500 x 150', 450),
    ('régulateur de débit pour gaine', 1500),
    ('4000 m³/h à 5000 m³/h', 2500),
    ('ø 250 à ø 315', 450),
    ('ø 100 à ø 200', 300),
    ('attente évacuation condensât', 60),
    ('1500 à 2000', 18000),
    ('2500 à 4000 m³/h', 26000),
    ('600 à 1000 m³/h', 9500),
    ('1200 à 2000 m³/h', 14000),
    ('2200 à 4000 m³/h', 22000),
    ('bouche vmc auto réglable', 250),
    ('3 kw f', 7000),
    ('5 kw f', 11500),
    ('puissance frigorifique : 28 kw', 120000),
    ('puissance frigorifique : 2,8 kw', 9500),
    ('puissance frigorifique : 5,6 kw', 12500),
    ('puissance frigorifique : 3,6 kw', 11000),
    ('plénum de soufflage', 1800),
    ('a) tableau et raccordement électrique climatisations unités extérieures et intérieures hall de vente', 45000),
    ('tableau et raccordement électrique caissons de ventilation.', 25000),
    ('repérage', 8000),
    ('débit d''air de 34 000 m3/h / 68 000 m3/h à hmt appropriée', 150000),
    ('débit d''air de 41 000 m3/h / 82 000 m3/h à hmt appropriée', 165000),
    ('débit : 9500 m3/h / 19 000 m3/h', 38000),
    ('débit : 20 000 m3/h / 40 000 m3/h', 58000),
    ('débit : 30 000 m3/h / 60 000 m3/h', 75000),
    ('débit : 9000 m3/h / 18 000 m3/h', 36000),
    ('débit : 17 000 m3/h / 34 000 m3/h', 52000),
    ('débit : 25 000 m3/h / 50 000 m3/h', 68000),
    ('coffret de relayage', 4500),
    ('clapet coupe-feu', 4500),
    ('gaine en staff 4 cm', 380),
    ('gaine en tole galvanisee', 380),
    ('calfeutrement gaines techniques', 450),
    ('désenfumage hall de vente (rdc)', 65000),
    ('désenfumage hall de vente (r+1)', 55000),
    ('désenfumage stock', 45000),
    ('tetes sprinkleurs (dn15 à dn20)', 280),
    ('ø 150', 950),
    ('ø 102/114', 650),
    ('ø 50/60', 320),
    ('ø 40/49', 260),
    ('ø 33/42', 220),
    ('ø 26/32', 180),
    ('zone hall de vente', 85000),
    ('zone bureaux', 15000),
    ('zone réserves', 45000),
    ('vidanges et point f', 6500),
    ('armoire électrique et câblage', 45000),
    ('armoire reports d''alarmes', 18000),
    ('reperage', 8000),
    ('indicateur de passage d''eau', 9000),
    ('démontage de l''existant', 40000),
    ('installation du chantier', 25000)
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

  RAISE NOTICE 'Devis FLUIDES : % lignes complétées, totaux recalculés.', n1 + n2;
END $$;

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
