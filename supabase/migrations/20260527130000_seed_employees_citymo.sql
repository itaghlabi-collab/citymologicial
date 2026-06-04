-- ═══════════════════════════════════════════════════════════════════════════
-- SEED RH — 25 employés CITYMO
-- Prérequis : migration 20260527120000_employees_extended_fields.sql exécutée
-- Coller ce fichier dans Supabase → SQL Editor → Run
-- ⚠️ NE PAS utiliser seul : l’INSERT groupé échoue si un CIN existe déjà (ex. BE884115).
-- Utiliser plutôt : 20260527140000_reseed_employees_citymo_safe.sql
-- Idempotent : ON CONFLICT (email) — insuffisant si conflit sur numero_cin
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.employees (
  firstname,
  lastname,
  email,
  poste,
  department,
  department_id,
  telephone,
  salaire,
  statut,
  date_embauche,
  adresse,
  numero_cin,
  cnss,
  rib,
  banque,
  situation_familiale
) VALUES
  (
    'Chaimaa', 'EL FALLAH GRINI', 'bb115904@employes.citymo.local',
    'Assistante de direction', NULL, NULL, '06-33-90-29-44', 0, 'Actif', '2025-02-04',
    'RES ARSAT BERNOUSSI GH2 IMM 9 ETG 3 NR 6 BERNOUSSI CASA', 'BB115904', '148407401',
    '007 780 0000865300310001 86', 'AWB', 'Célibataire'
  ),
  (
    'Mohamed', 'AIT LAMKADEM', 'ee54555@employes.citymo.local',
    'Chauffeur', NULL, NULL, '07-61-77-79-73', 0, 'Actif', '2025-09-01',
    'RUE DES OUDAYAS NO 71 LA VILLETTE H M CASA', 'EE54555', '188849454',
    '022 780 0001550027847410 74', 'SAHAM BANK', 'Marié'
  ),
  (
    'Otman', 'SABER', 'wb217978@employes.citymo.local',
    'Menuisière', NULL, NULL, '06-19-33-52-99', 0, 'Actif', '2025-09-01',
    'DR OULED LBAHLOUL OULD BRAHIM LEBSSABESS MNIAA BEN AHMED', 'WB217978', '162166344',
    '230 629 6586592211020300 84', 'CIH', 'Célibataire'
  ),
  (
    'Abdelhak', 'ELKHOUMRI', 'j386372@employes.citymo.local',
    'Chef de chantier', NULL, NULL, '06-66-67-06-15', 0, 'Actif', '2025-09-01',
    'DR BOUJEMAA NR 61 AHL LOUGHLAM CASABLANCA', 'J386372', '188392065',
    '190 780 2111100111290003 96', 'BANQUE POPULAIRE', 'Marié'
  ),
  (
    'Jihane', 'ELOUADOUD', 'ba21889@employes.citymo.local',
    'Techniciene BTP', NULL, NULL, '06-48-61-58-10', 0, 'Actif', '2025-09-22',
    '14 BLOC 28 SID OTHMANE CASABLANCA', 'BA21889', '119360850',
    '011 780 0000732000048223 37', 'BMCEMAMC', 'Célibataire'
  ),
  (
    'IMANE', 'TAGHLABI', 'be884115@employes.citymo.local',
    'Responsable Marketing', NULL, NULL, '06-20-55-05-42', 0, 'Actif', '2025-09-25',
    '5 RUE TANTAN APT 8 BOURGOGNE CASABLANCA', 'BE884115', '134141300',
    '230 780 2589222211010200 67', 'CIH', 'Célibataire'
  ),
  (
    'HAMZA', 'ABID', 'bk619171@employes.citymo.local',
    'Chef de chantier', NULL, NULL, '06-07-29-54-55', 0, 'Actif', '2025-10-13',
    'DR ABBED LAHRECH OULAD AZZOUZ DAR BOUAZZA CASA', 'BK619171', '152674527',
    '230 792 2901144211031100 81', 'CIH', 'Célibataire'
  ),
  (
    'AZZEDDINE', 'EL FANNANE', 'bk404974@employes.citymo.local',
    'Chef de chantier', NULL, NULL, '06-69-76-24-45', 0, 'Actif', '2025-10-14',
    'LISSASFA 3 BLOC E NR 220 CASA', 'BK404974', '147612082',
    '007 780 0006709000308252 25', 'AWB', 'Marié'
  ),
  (
    'HASSAN', 'LAGHOUIBA', 'bk310903@employes.citymo.local',
    'Chauffeur', NULL, NULL, '06-66-88-52-94', 0, 'Actif', '2025-10-23',
    'DOUAR OLD ABBOU OLD AISSA OLD AZZOUZ NOUACEUR CASA', 'BK310903', '110265669',
    '190 780 2111101679690006 39', 'BP', 'Marié'
  ),
  (
    'LAILA', 'WOTFI', 'bb47180@employes.citymo.local',
    'Enployer polyvalent', NULL, NULL, '06-12-62-19-30', 0, 'Actif', '2025-11-12',
    'BLOC 201 NR 49 BERNOUSSI CASABLANCA', 'BB47180', '147614492',
    '022 780 0000790029686665 74', 'SAHAM BANK', 'Marié'
  ),
  (
    'LHOU', 'HEZGUIT', 'ua12994@employes.citymo.local',
    'SAV', NULL, NULL, NULL, 0, 'Actif', '2025-09-01',
    'DR EL KHEYAYTA', 'UA12994', '924620720',
    '833 780 0000000366350408 36', 'BARID CASH', 'Marié'
  ),
  (
    'SAID', 'HSINA', 'bh288165@employes.citymo.local',
    'COURCIER', NULL, NULL, NULL, 0, 'Actif', '2025-11-01',
    'HAY MASSIRA 02 RUE 23 NO 07 CASABLANCA', 'BH288165', '180280268',
    '190 780 2111127879760000 28', 'BP', 'Marié'
  ),
  (
    'MOUHCINE', 'EL MOUTTAKI', 'bk728676@employes.citymo.local',
    'Chauffeur', NULL, NULL, '06-69-27-47-34', 0, 'Actif', '2025-12-02',
    'LISSASFA DR EL OUZAZNA QUARTIER INDUSTRIEL CASABLANCA', 'BK728676', NULL,
    '007 780 0006952000302763 48', 'AWB', 'Célibataire'
  ),
  (
    'TAOUFIK', 'EL HAKIMY', 'bk690554@employes.citymo.local',
    'Chauffeur', NULL, NULL, '06-12-77-08-94', 0, 'Actif', '2025-12-02',
    'HAY NASSIM DR LOUZAZNA RTE 1077 CASA', 'BK690554', NULL,
    '190 780 2111114118910000 25', 'BP', 'Marié'
  ),
  (
    'Nourddine', 'FATIHI', 'wa183274@employes.citymo.local',
    'Chef de chantier', NULL, NULL, '06-91-82-67-17', 0, 'Actif', '2026-01-21',
    'LOT EL WAHDA NR 24 SOUALEM BERRECHID', 'WA183274', '101341693',
    '007 780 0003755000306948 83', 'AWB', 'Célibataire'
  ),
  (
    'LHSSEN', 'BEN AICHA', 'bk108176@employes.citymo.local',
    'RH', NULL, NULL, '06-63-48-04-15', 0, 'Actif', '2026-01-26',
    '134 LOT EL WAHDA BERRCHID', 'BK108176', NULL,
    '230 629 3253720211020300 38', 'CIH', 'Marié'
  ),
  (
    'ABDELKHALEK', 'JERRAR', 'bk603582@employes.citymo.local',
    'MAGASINIER', NULL, NULL, '06-90-63-89-93', 0, 'Actif', '2026-03-11',
    'DR OLD KHADDOU LAHRECH OLD AZZOUZ DAR BOUAZZA NOUACEUR CASA', 'BK603582', '103312813',
    '190 792 2111109406530007 36', 'BMCEMAMC', 'Célibataire'
  ),
  (
    'MOHAMMED', 'ZAANOUN', 'bf9861@employes.citymo.local',
    'Chef de chantier', NULL, NULL, '06-60-08-37-53', 0, 'Actif', '2026-02-09',
    'LOT PARC ERRAHMA GH 1 IMM 2 NR 23 ERRAHMA 02 DAR BOUAZZA NOUACEUR CASA', 'BF9861', '101199465',
    '022 780 0003550028210381 74', 'SAHAM BANK', 'Célibataire'
  ),
  (
    'OTHMANE', 'RSAIM', 'bb128160@employes.citymo.local',
    'Chef de chantier', NULL, NULL, '06-03-31-54-25', 0, 'Actif', '2026-02-13',
    'BC 130 NR 19 BERNOUSSI CASA', 'BB128160', '174100427',
    '007 780 0003763000309800 23', 'AWB', 'Célibataire'
  ),
  (
    'HIBA', 'BARKAOUI', 'bh650129@employes.citymo.local',
    'Employer polyvalente', NULL, NULL, '07-04-16-06-80', 0, 'Actif', '2026-03-06',
    'DERB KOUDIA RUE 14 N 60 C D CASA', 'BH650129', 'NON AFFILIEÉ',
    '021 780 0000053001298992 53', 'CDM', 'Célibataire'
  ),
  (
    'MEKSSI', 'MOHAMMED', 'bl93598@employes.citymo.local',
    'COMPTABLE', NULL, NULL, '06-17-86-02-33', 0, 'Actif', '2026-04-01',
    '2 RUE 19 HABOUS CASABLANCA', 'BL93598', '136023399',
    '022780 0000580010489066 74', 'SAHAM BANK', 'Célibataire'
  ),
  (
    'MAROUAN', 'TOUIMI', 'bb96317@employes.citymo.local',
    'COURSIER', NULL, NULL, '06-69-10-29-27', 0, 'Actif', '2026-05-21',
    'BLOC 11 NR15 BERNOUSSI CASABLANCA', 'BB96317', 'NON AFFILIEÉ',
    '007 780 0003098000307750 89', 'AWB', 'Marié'
  ),
  (
    'EL WARDI', 'KHALID', 'bk300700@employes.citymo.local',
    'Menuisière', NULL, NULL, NULL, 0, 'Actif', NULL,
    'ALINA DEV', 'BK300700', '191113250',
    '190 629 2111145340660005 61', 'BP', NULL
  ),
  (
    'MORAD', 'ABIDINE', 'morad.abidine@employes.citymo.local',
    'Menuisière', NULL, NULL, NULL, 0, 'Actif', '2026-01-21',
    'ALINA DEV', NULL, NULL,
    NULL, NULL, NULL
  ),
  (
    'NABIL', 'LAKHDAR', 'bh225151@employes.citymo.local',
    'Chauffeur', NULL, NULL, NULL, 0, 'Actif', '2026-01-26',
    'LOT EL WAHDA NR 04 SOUALEM BERRECHID', 'BH225151', '961397431',
    '820 780 2611182890058482 26', 'WAFACASH', 'Marié'
  )
ON CONFLICT (email) DO UPDATE SET
  firstname = EXCLUDED.firstname,
  lastname = EXCLUDED.lastname,
  poste = EXCLUDED.poste,
  department = NULL,
  department_id = NULL,
  telephone = EXCLUDED.telephone,
  date_embauche = EXCLUDED.date_embauche,
  adresse = EXCLUDED.adresse,
  numero_cin = EXCLUDED.numero_cin,
  cnss = EXCLUDED.cnss,
  rib = EXCLUDED.rib,
  banque = EXCLUDED.banque,
  situation_familiale = EXCLUDED.situation_familiale,
  updated_at = NOW();

-- Vérification
SELECT COUNT(*) AS total_employes FROM public.employees;
SELECT firstname, lastname, numero_cin, poste, email
FROM public.employees
ORDER BY created_at DESC
LIMIT 30;
