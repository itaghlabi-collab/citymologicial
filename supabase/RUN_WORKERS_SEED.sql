-- =============================================================================
-- CITYMO — Import initial Ouvriers (Employés Externes → module Ouvriers)
-- Supabase Dashboard → SQL Editor → coller tout → Run
-- Idempotent : upsert sur numero_cin (aucun doublon)
-- Prérequis : table public.workers (20260525300000_workers_schema.sql)
-- =============================================================================

BEGIN;

-- Colonnes optionnelles pour CNSS et unité tarifaire (n'altère pas les colonnes existantes)
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS cnss TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS tarif_unite TEXT DEFAULT 'jour';

COMMENT ON COLUMN public.workers.cnss IS 'Numéro CNSS ou mention NON AFFILIE';
COMMENT ON COLUMN public.workers.tarif_unite IS 'Unité du tarif : jour, semaine ou mois';

CREATE OR REPLACE FUNCTION public._citymo_upsert_worker(
  p_prenom       TEXT,
  p_nom          TEXT,
  p_fonction     TEXT,
  p_numero_cin   TEXT,
  p_cnss         TEXT,
  p_adresse      TEXT,
  p_tarif        NUMERIC,
  p_tarif_unite  TEXT DEFAULT 'jour',
  p_statut       TEXT DEFAULT 'actif'
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.workers (
    prenom,
    nom,
    fonction,
    numero_cin,
    cnss,
    adresse,
    tarif,
    tarif_unite,
    statut,
    disponibilite,
    nationalite
  ) VALUES (
    TRIM(p_prenom),
    TRIM(p_nom),
    TRIM(p_fonction),
    UPPER(TRIM(p_numero_cin)),
    NULLIF(TRIM(p_cnss), ''),
    NULLIF(TRIM(p_adresse), ''),
    COALESCE(p_tarif, 0),
    COALESCE(NULLIF(TRIM(p_tarif_unite), ''), 'jour'),
    COALESCE(NULLIF(TRIM(p_statut), ''), 'actif'),
    'oui',
    'Marocaine'
  )
  ON CONFLICT (numero_cin)
  DO UPDATE SET
    prenom       = EXCLUDED.prenom,
    nom          = EXCLUDED.nom,
    fonction     = EXCLUDED.fonction,
    cnss         = EXCLUDED.cnss,
    adresse      = EXCLUDED.adresse,
    tarif        = EXCLUDED.tarif,
    tarif_unite  = EXCLUDED.tarif_unite,
    statut       = EXCLUDED.statut,
    disponibilite = EXCLUDED.disponibilite,
    nationalite  = EXCLUDED.nationalite,
    updated_at   = NOW();
END;
$$;

-- 1. AHMED FEDDADI — 3422.72 MAD/mois
SELECT public._citymo_upsert_worker(
  'AHMED', 'FEDDADI', 'MENUISIER', 'WA368968', 'NON AFFILIE',
  'DR KHYAYTA SAHEL BERRECHID', 3422.72, 'mois', 'actif'
);

-- 2. OTMAN SABER — 4000 MAD/mois
SELECT public._citymo_upsert_worker(
  'OTMAN', 'SABER', 'MENUISIER', 'WB217978', '162166344',
  'DR OULED LBAHLOUL OULED BRAHIM LEBSSABESS MNIAA BEN AHMED', 4000, 'mois', 'actif'
);

-- 3. IMAD MADDAH — 4000 MAD/mois
SELECT public._citymo_upsert_worker(
  'IMAD', 'MADDAH', 'VERNISSEUR PEINTRE', 'BK625087', 'NON AFFILIE',
  'MADINAT ERRAHMA 01 BLOC 17 NR 62 DAR BOUAZZA NOUACER CASA', 4000, 'mois', 'actif'
);

-- 4. REDA EL MOURABIT — 1300 MAD/jour
SELECT public._citymo_upsert_worker(
  'REDA', 'EL MOURABIT', 'MANŒUVRE', 'BK741829', 'NON AFFILIE',
  'LISSASSFA DOUAR LOUZAZNA ROUTE 1077 CASA', 1300, 'jour', 'actif'
);

-- 5. YASSER KHALFI — 1300 MAD/jour
SELECT public._citymo_upsert_worker(
  'YASSER', 'KHALFI', 'MANŒUVRE', 'X367591', 'NON AFFILIE',
  'LOT DEYAR KHEYAYTA NR 10 KHEYAYTA SAHEL BERRECHID', 1300, 'jour', 'actif'
);

-- 6. GUEYE NGAGNE DEMBA — 1000 MAD/semaine
SELECT public._citymo_upsert_worker(
  'GUEYE', 'NGAGNE DEMBA', 'FERRONIER', 'A04508688', 'NON AFFILIE',
  'MADINAT RAHMA BLOC 13 LOT 56 DAR BOUAZZA CASA', 1000, 'semaine', 'actif'
);

-- 7. DIOP MESSERIGNE — 1000 MAD/semaine
SELECT public._citymo_upsert_worker(
  'DIOP', 'MESSERIGNE', 'FERRONIER', 'A02068754', 'NON AFFILIE',
  'MADINAT RAHMA BLOC 13 LOT 56 DAR BOUAZZA CASA', 1000, 'semaine', 'actif'
);

-- 8. ABDELMOTALIB EL BZIOUI — 200 MAD/jour
SELECT public._citymo_upsert_worker(
  'ABDELMOTALIB', 'EL BZIOUI', 'MANŒUVRE', 'EA41222', 'NON AFFILIE',
  'DR MOULAY EL ABBES TASSELTANTE MARRAKECH', 200, 'jour', 'actif'
);

-- 9. HAMMADI TRIAY — 1300 MAD/jour
SELECT public._citymo_upsert_worker(
  'HAMMADI', 'TRIAY', 'MANŒUVRE', 'XA139141', 'NON AFFILIE',
  'HAY SAADA EST NR 319 TIFLET', 1300, 'jour', 'actif'
);

-- 10. BANADI MOHAMED — 2200 MAD/jour
SELECT public._citymo_upsert_worker(
  'BANADI', 'MOHAMED', 'MAÇON', 'LB168339', 'NON AFFILIE',
  'DR LAMAIR TLIK CR SOUAKEN CT OULED OUCHIH KSAR EL KEBIR', 2200, 'jour', 'actif'
);

-- 11. TADLAOUI MOHAMMED — 1500 MAD/jour
SELECT public._citymo_upsert_worker(
  'TADLAOUI', 'MOHAMMED', 'MANŒUVRE', 'XA158420', 'NON AFFILIE',
  'HAY SAADA EST NR 71 TIFLET', 1500, 'jour', 'actif'
);

-- 12. ELMEHDY ESSALEMY — 1500 MAD/jour
SELECT public._citymo_upsert_worker(
  'ELMEHDY', 'ESSALEMY', 'MANŒUVRE', 'GA213386', 'NON AFFILIE',
  'DR DOUIMIA BOUMAIZ SIDI SLIMANE', 1500, 'jour', 'actif'
);

-- 13. ABDELLAH BENCHEDDAD — 2000 MAD/jour
SELECT public._citymo_upsert_worker(
  'ABDELLAH', 'BENCHEDDAD', 'MAÇON', 'BH123942', 'NON AFFILIE',
  '36 RUE LARACHE AM CASABLANCA', 2000, 'jour', 'actif'
);

-- 14. MOHAMED RAHHOU — 1350 MAD/jour
SELECT public._citymo_upsert_worker(
  'MOHAMED', 'RAHHOU', 'MANŒUVRE', 'GA243274', 'NON AFFILIE',
  'DR DOUIMIA BOUMAIZ SIDI SLIMANE', 1350, 'jour', 'actif'
);

-- 15. ABDELALI EL KARFA — 1350 MAD/jour
SELECT public._citymo_upsert_worker(
  'ABDELALI', 'EL KARFA', 'MANŒUVRE', 'JT82258', 'NON AFFILIE',
  'DR AIT CHYOUK HISSEN OULED TEIMA', 1350, 'jour', 'actif'
);

-- 16. NOURDDINE LAAROUSSSI — 1300 MAD/jour
SELECT public._citymo_upsert_worker(
  'NOURDDINE', 'LAAROUSSSI', 'MANŒUVRE', 'BK179064', 'NON AFFILIE',
  'DOUAR OULAD ABBOU OULAD AISSA OULAD AZZOUZ NOUACEUR CASA', 1300, 'jour', 'actif'
);

-- 17. SOUFIANE FATIHI — 1300 MAD/jour
SELECT public._citymo_upsert_worker(
  'SOUFIANE', 'FATIHI', 'MANŒUVRE', 'WA169279', 'NON AFFILIE',
  '20 LOT EL AMAL SOUALEM BERRECHID', 1300, 'jour', 'actif'
);

-- 18. ABDENNABI OUAMGHAR — 2000 MAD/jour
SELECT public._citymo_upsert_worker(
  'ABDENNABI', 'OUAMGHAR', 'MAÇON', 'I438461', 'NON AFFILIE',
  'DOUAR INOUGHMACH TAOUNZA AZILAL', 2000, 'jour', 'actif'
);

-- 19. SOUHAIL EL ALLAM — 1300 MAD/jour
SELECT public._citymo_upsert_worker(
  'SOUHAIL', 'EL ALLAM', 'MANŒUVRE', 'I788916', 'NON AFFILIE',
  'ADOUZ SOUFLA ROUTE MGHILA FOUM EL ANCEUR BENI MELLAL', 1300, 'jour', 'actif'
);

-- 20. MOHAMED SABIR — 6000 MAD/jour
SELECT public._citymo_upsert_worker(
  'MOHAMED', 'SABIR', 'CHEF D''ÉQUIPE', 'I303369', 'NON AFFILIE',
  'OULD HARKAT OULD MBAREK BENI MELLAL', 6000, 'jour', 'actif'
);

DROP FUNCTION IF EXISTS public._citymo_upsert_worker(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─── Vérification (aucun doublon CIN, 20 ouvriers importés) ─────────────────
SELECT
  COUNT(*)::int AS total_ouvriers,
  COUNT(DISTINCT numero_cin)::int AS cin_uniques,
  COUNT(*) FILTER (WHERE statut = 'actif')::int AS actifs,
  COUNT(*) FILTER (WHERE tarif_unite = 'jour')::int AS tarif_jour,
  COUNT(*) FILTER (WHERE tarif_unite = 'semaine')::int AS tarif_semaine,
  COUNT(*) FILTER (WHERE tarif_unite = 'mois')::int AS tarif_mois
FROM public.workers
WHERE numero_cin IN (
  'WA368968', 'WB217978', 'BK625087', 'BK741829', 'X367591',
  'A04508688', 'A02068754', 'EA41222', 'XA139141', 'LB168339',
  'XA158420', 'GA213386', 'BH123942', 'GA243274', 'JT82258',
  'BK179064', 'WA169279', 'I438461', 'I788916', 'I303369'
);

SELECT
  numero_cin,
  prenom,
  nom,
  fonction,
  cnss,
  tarif,
  tarif_unite,
  statut
FROM public.workers
WHERE numero_cin IN (
  'WA368968', 'WB217978', 'BK625087', 'BK741829', 'X367591',
  'A04508688', 'A02068754', 'EA41222', 'XA139141', 'LB168339',
  'XA158420', 'GA213386', 'BH123942', 'GA243274', 'JT82258',
  'BK179064', 'WA169279', 'I438461', 'I788916', 'I303369'
)
ORDER BY nom, prenom;
