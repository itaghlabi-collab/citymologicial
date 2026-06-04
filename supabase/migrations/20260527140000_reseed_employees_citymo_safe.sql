-- ═══════════════════════════════════════════════════════════════════════════
-- RESEED RH — 25 employés CITYMO (idempotent, sans échec du lot entier)
-- Cause du bug précédent : INSERT groupé → violation unique sur numero_cin
-- (ex. BE884115 déjà sur i.taghlabi@citymo.ma) annule les 25 lignes.
-- Prérequis : 20260527120000_employees_extended_fields.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Compte RH existant : enrichir sans changer l’email métier
UPDATE public.employees SET
  firstname = 'IMANE',
  lastname = 'TAGHLABI',
  poste = 'Responsable Marketing',
  department = NULL,
  department_id = NULL,
  telephone = '06-20-55-05-42',
  date_embauche = '2025-09-25',
  adresse = '5 RUE TANTAN APT 8 BOURGOGNE CASABLANCA',
  numero_cin = 'BE884115',
  cnss = '134141300',
  rib = '230 780 2589222211010200 67',
  banque = 'CIH',
  situation_familiale = 'Célibataire',
  updated_at = NOW()
WHERE LOWER(email) = 'i.taghlabi@citymo.ma'
   OR UPPER(TRIM(COALESCE(numero_cin, ''))) = 'BE884115';

-- Helper : upsert par CIN (conflit email/CIN gérés séparément)
CREATE OR REPLACE FUNCTION public._citymo_upsert_employee(
  p_firstname TEXT,
  p_lastname TEXT,
  p_email TEXT,
  p_poste TEXT,
  p_telephone TEXT,
  p_date_embauche DATE,
  p_adresse TEXT,
  p_numero_cin TEXT,
  p_cnss TEXT,
  p_rib TEXT,
  p_banque TEXT,
  p_situation_familiale TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_numero_cin IS NOT NULL AND TRIM(p_numero_cin) <> '' THEN
    INSERT INTO public.employees (
      firstname, lastname, email, poste, department, department_id,
      telephone, salaire, statut, date_embauche,
      adresse, numero_cin, cnss, rib, banque, situation_familiale
    ) VALUES (
      p_firstname, p_lastname, LOWER(p_email), p_poste, NULL, NULL,
      p_telephone, 0, 'Actif', p_date_embauche,
      p_adresse, UPPER(TRIM(p_numero_cin)), p_cnss, p_rib, p_banque, p_situation_familiale
    )
    ON CONFLICT (numero_cin)
    WHERE numero_cin IS NOT NULL AND TRIM(numero_cin) <> ''
    DO UPDATE SET
      firstname = EXCLUDED.firstname,
      lastname = EXCLUDED.lastname,
      poste = EXCLUDED.poste,
      department = NULL,
      department_id = NULL,
      telephone = EXCLUDED.telephone,
      date_embauche = EXCLUDED.date_embauche,
      adresse = EXCLUDED.adresse,
      cnss = EXCLUDED.cnss,
      rib = EXCLUDED.rib,
      banque = EXCLUDED.banque,
      situation_familiale = EXCLUDED.situation_familiale,
      updated_at = NOW();
    RETURN;
  END IF;

  INSERT INTO public.employees (
    firstname, lastname, email, poste, department, department_id,
    telephone, salaire, statut, date_embauche,
    adresse, numero_cin, cnss, rib, banque, situation_familiale
  ) VALUES (
    p_firstname, p_lastname, LOWER(p_email), p_poste, NULL, NULL,
    p_telephone, 0, 'Actif', p_date_embauche,
    p_adresse, NULL, p_cnss, p_rib, p_banque, p_situation_familiale
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
END;
$$;

SELECT public._citymo_upsert_employee('Chaimaa','EL FALLAH GRINI','bb115904@employes.citymo.local','Assistante de direction','06-33-90-29-44','2025-02-04','RES ARSAT BERNOUSSI GH2 IMM 9 ETG 3 NR 6 BERNOUSSI CASA','BB115904','148407401','007 780 0000865300310001 86','AWB','Célibataire');
SELECT public._citymo_upsert_employee('Mohamed','AIT LAMKADEM','ee54555@employes.citymo.local','Chauffeur','07-61-77-79-73','2025-09-01','RUE DES OUDAYAS NO 71 LA VILLETTE H M CASA','EE54555','188849454','022 780 0001550027847410 74','SAHAM BANK','Marié');
SELECT public._citymo_upsert_employee('Otman','SABER','wb217978@employes.citymo.local','Menuisière','06-19-33-52-99','2025-09-01','DR OULED LBAHLOUL OULD BRAHIM LEBSSABESS MNIAA BEN AHMED','WB217978','162166344','230 629 6586592211020300 84','CIH','Célibataire');
SELECT public._citymo_upsert_employee('Abdelhak','ELKHOUMRI','j386372@employes.citymo.local','Chef de chantier','06-66-67-06-15','2025-09-01','DR BOUJEMAA NR 61 AHL LOUGHLAM CASABLANCA','J386372','188392065','190 780 2111100111290003 96','BANQUE POPULAIRE','Marié');
SELECT public._citymo_upsert_employee('Jihane','ELOUADOUD','ba21889@employes.citymo.local','Techniciene BTP','06-48-61-58-10','2025-09-22','14 BLOC 28 SID OTHMANE CASABLANCA','BA21889','119360850','011 780 0000732000048223 37','BMCEMAMC','Célibataire');
SELECT public._citymo_upsert_employee('IMANE','TAGHLABI','i.taghlabi@citymo.ma','Responsable Marketing','06-20-55-05-42','2025-09-25','5 RUE TANTAN APT 8 BOURGOGNE CASABLANCA','BE884115','134141300','230 780 2589222211010200 67','CIH','Célibataire');
SELECT public._citymo_upsert_employee('HAMZA','ABID','bk619171@employes.citymo.local','Chef de chantier','06-07-29-54-55','2025-10-13','DR ABBED LAHRECH OULAD AZZOUZ DAR BOUAZZA CASA','BK619171','152674527','230 792 2901144211031100 81','CIH','Célibataire');
SELECT public._citymo_upsert_employee('AZZEDDINE','EL FANNANE','bk404974@employes.citymo.local','Chef de chantier','06-69-76-24-45','2025-10-14','LISSASFA 3 BLOC E NR 220 CASA','BK404974','147612082','007 780 0006709000308252 25','AWB','Marié');
SELECT public._citymo_upsert_employee('HASSAN','LAGHOUIBA','bk310903@employes.citymo.local','Chauffeur','06-66-88-52-94','2025-10-23','DOUAR OLD ABBOU OLD AISSA OLD AZZOUZ NOUACEUR CASA','BK310903','110265669','190 780 2111101679690006 39','BP','Marié');
SELECT public._citymo_upsert_employee('LAILA','WOTFI','bb47180@employes.citymo.local','Enployer polyvalent','06-12-62-19-30','2025-11-12','BLOC 201 NR 49 BERNOUSSI CASABLANCA','BB47180','147614492','022 780 0000790029686665 74','SAHAM BANK','Marié');
SELECT public._citymo_upsert_employee('LHOU','HEZGUIT','ua12994@employes.citymo.local','SAV',NULL,'2025-09-01','DR EL KHEYAYTA','UA12994','924620720','833 780 0000000366350408 36','BARID CASH','Marié');
SELECT public._citymo_upsert_employee('SAID','HSINA','bh288165@employes.citymo.local','COURCIER',NULL,'2025-11-01','HAY MASSIRA 02 RUE 23 NO 07 CASABLANCA','BH288165','180280268','190 780 2111127879760000 28','BP','Marié');
SELECT public._citymo_upsert_employee('MOUHCINE','EL MOUTTAKI','bk728676@employes.citymo.local','Chauffeur','06-69-27-47-34','2025-12-02','LISSASFA DR EL OUZAZNA QUARTIER INDUSTRIEL CASABLANCA','BK728676',NULL,'007 780 0006952000302763 48','AWB','Célibataire');
SELECT public._citymo_upsert_employee('TAOUFIK','EL HAKIMY','bk690554@employes.citymo.local','Chauffeur','06-12-77-08-94','2025-12-02','HAY NASSIM DR LOUZAZNA RTE 1077 CASA','BK690554',NULL,'190 780 2111114118910000 25','BP','Marié');
SELECT public._citymo_upsert_employee('Nourddine','FATIHI','wa183274@employes.citymo.local','Chef de chantier','06-91-82-67-17','2026-01-21','LOT EL WAHDA NR 24 SOUALEM BERRECHID','WA183274','101341693','007 780 0003755000306948 83','AWB','Célibataire');
SELECT public._citymo_upsert_employee('LHSSEN','BEN AICHA','bk108176@employes.citymo.local','RH','06-63-48-04-15','2026-01-26','134 LOT EL WAHDA BERRCHID','BK108176',NULL,'230 629 3253720211020300 38','CIH','Marié');
SELECT public._citymo_upsert_employee('ABDELKHALEK','JERRAR','bk603582@employes.citymo.local','MAGASINIER','06-90-63-89-93','2026-03-11','DR OLD KHADDOU LAHRECH OLD AZZOUZ DAR BOUAZZA NOUACEUR CASA','BK603582','103312813','190 792 2111109406530007 36','BMCEMAMC','Célibataire');
SELECT public._citymo_upsert_employee('MOHAMMED','ZAANOUN','bf9861@employes.citymo.local','Chef de chantier','06-60-08-37-53','2026-02-09','LOT PARC ERRAHMA GH 1 IMM 2 NR 23 ERRAHMA 02 DAR BOUAZZA NOUACEUR CASA','BF9861','101199465','022 780 0003550028210381 74','SAHAM BANK','Célibataire');
SELECT public._citymo_upsert_employee('OTHMANE','RSAIM','bb128160@employes.citymo.local','Chef de chantier','06-03-31-54-25','2026-02-13','BC 130 NR 19 BERNOUSSI CASA','BB128160','174100427','007 780 0003763000309800 23','AWB','Célibataire');
SELECT public._citymo_upsert_employee('HIBA','BARKAOUI','bh650129@employes.citymo.local','Employer polyvalente','07-04-16-06-80','2026-03-06','DERB KOUDIA RUE 14 N 60 C D CASA','BH650129','NON AFFILIEÉ','021 780 0000053001298992 53','CDM','Célibataire');
SELECT public._citymo_upsert_employee('MEKSSI','MOHAMMED','bl93598@employes.citymo.local','COMPTABLE','06-17-86-02-33','2026-04-01','2 RUE 19 HABOUS CASABLANCA','BL93598','136023399','022780 0000580010489066 74','SAHAM BANK','Célibataire');
SELECT public._citymo_upsert_employee('MAROUAN','TOUIMI','bb96317@employes.citymo.local','COURSIER','06-69-10-29-27','2026-05-21','BLOC 11 NR15 BERNOUSSI CASABLANCA','BB96317','NON AFFILIEÉ','007 780 0003098000307750 89','AWB','Marié');
SELECT public._citymo_upsert_employee('EL WARDI','KHALID','bk300700@employes.citymo.local','Menuisière',NULL,NULL,'ALINA DEV','BK300700','191113250','190 629 2111145340660005 61','BP',NULL);
SELECT public._citymo_upsert_employee('MORAD','ABIDINE','morad.abidine@employes.citymo.local','Menuisière',NULL,'2026-01-21','ALINA DEV',NULL,NULL,NULL,NULL,NULL);
SELECT public._citymo_upsert_employee('NABIL','LAKHDAR','bh225151@employes.citymo.local','Chauffeur',NULL,'2026-01-26','LOT EL WAHDA NR 04 SOUALEM BERRECHID','BH225151','961397431','820 780 2611182890058482 26','WAFACASH','Marié');

DROP FUNCTION public._citymo_upsert_employee(
  TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

COMMIT;

SELECT COUNT(*) AS total_employes FROM public.employees;
