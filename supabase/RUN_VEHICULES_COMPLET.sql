-- ═══════════════════════════════════════════════════════════════════════════
-- VÉHICULES CITYMO — TOUT EN UN (copier-coller → SQL Editor → Run)
-- Équivalent : fichier 1 puis fichier 2 ci-dessous
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── FICHIER 1/2 : 20260527150000_logistique_vehicles.sql ───

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicule            TEXT,
  matricule_ww        TEXT,
  matricule           TEXT NOT NULL,
  type                TEXT,
  marque              TEXT,
  modele              TEXT,
  annee               INTEGER,
  couleur             TEXT,
  chauffeur           TEXT,
  departement         TEXT,
  responsable         TEXT,
  statut              TEXT NOT NULL DEFAULT 'disponible',
  assurance           TEXT,
  date_exp_assurance  DATE,
  visite_technique    TEXT,
  date_exp_visite     DATE,
  carte_grise         TEXT,
  km_actuel           NUMERIC(12, 2),
  carburant           TEXT,
  consommation        NUMERIC(8, 2),
  observations        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicule TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS matricule_ww TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS marque TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS modele TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS annee INTEGER;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS couleur TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'disponible';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS assurance TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS date_exp_assurance DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS visite_technique TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS date_exp_visite DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS carte_grise TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS km_actuel NUMERIC(12, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS carburant TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS consommation NUMERIC(8, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_statut_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_statut_check
  CHECK (statut IN ('disponible', 'affecte', 'intervention', 'hors_service', 'maintenance'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_matricule_unique
  ON public.vehicles (matricule);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_matricule_ww_unique
  ON public.vehicles (matricule_ww)
  WHERE matricule_ww IS NOT NULL AND TRIM(matricule_ww) <> '';

CREATE INDEX IF NOT EXISTS idx_vehicles_statut ON public.vehicles (statut);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON public.vehicles (type);
CREATE INDEX IF NOT EXISTS idx_vehicles_chauffeur ON public.vehicles (chauffeur);
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON public.vehicles (created_at DESC);

DROP TRIGGER IF EXISTS vehicles_updated_at ON public.vehicles;
CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicles_all_auth ON public.vehicles;
CREATE POLICY vehicles_all_auth ON public.vehicles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

-- ─── FICHIER 2/2 : 20260527150100_seed_logistique_vehicles.sql ───

BEGIN;

CREATE OR REPLACE FUNCTION public._citymo_upsert_vehicle(
  p_vehicule TEXT,
  p_matricule_ww TEXT,
  p_matricule TEXT,
  p_type TEXT,
  p_marque TEXT,
  p_modele TEXT,
  p_chauffeur TEXT,
  p_statut TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_mat TEXT := UPPER(TRIM(p_matricule));
  v_ww TEXT := NULLIF(UPPER(TRIM(COALESCE(p_matricule_ww, ''))), '');
BEGIN
  IF v_mat IS NULL OR v_mat = '' THEN
    RAISE EXCEPTION 'matricule requis';
  END IF;

  INSERT INTO public.vehicles (
    vehicule, matricule_ww, matricule, type, marque, modele, chauffeur, statut
  ) VALUES (
    NULLIF(TRIM(p_vehicule), ''),
    v_ww,
    v_mat,
    NULLIF(TRIM(p_type), ''),
    NULLIF(TRIM(p_marque), ''),
    NULLIF(TRIM(p_modele), ''),
    NULLIF(TRIM(p_chauffeur), ''),
    COALESCE(NULLIF(TRIM(p_statut), ''), 'disponible')
  )
  ON CONFLICT (matricule) DO UPDATE SET
    vehicule = EXCLUDED.vehicule,
    matricule_ww = COALESCE(EXCLUDED.matricule_ww, vehicles.matricule_ww),
    type = EXCLUDED.type,
    marque = EXCLUDED.marque,
    modele = EXCLUDED.modele,
    chauffeur = EXCLUDED.chauffeur,
    statut = EXCLUDED.statut,
    updated_at = NOW();
END;
$$;

SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW583662','97155-T-6','Fourgon','RENAULT','EXPRESS','LHOU HEZGHIT','affecte');
SELECT public._citymo_upsert_vehicle('OPEL','WW451463','91735-T-6',NULL,'OPEL',NULL,NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW583663','97156-T-6','Fourgon','RENAULT','EXPRESS','MOHAMMED ZAANOUN','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW441502','83399-T-6','Fourgon','RENAULT','EXPRESS',NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW711071','12853-Y-6','Fourgon','RENAULT','EXPRESS','AZZEDDINE EL FANNANE','affecte');
SELECT public._citymo_upsert_vehicle('H100','WW687257','12346-Y-6',NULL,'H100',NULL,'MOUHCINE EL MOUTTAKI','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW711070','12852-Y-6','Fourgon','RENAULT','EXPRESS','Abdelhak ELKHOUMRI','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW238961','58674-T-6','Fourgon','RENAULT','EXPRESS','OTHMANE RSAIM','affecte');
SELECT public._citymo_upsert_vehicle('KIA','WW705598','16611-Y-6',NULL,'KIA',NULL,'TOUFIK EL KAKIMI','affecte');
SELECT public._citymo_upsert_vehicle('FORDE','WW733171','19699-Y-6',NULL,'FORDE',NULL,'HASSAN LAGHOUIBA','affecte');
SELECT public._citymo_upsert_vehicle('DACIA DUSTER','WW803739','22340-Y-6',NULL,'DACIA','DUSTER','NOURDINE FATIHI','affecte');
SELECT public._citymo_upsert_vehicle('DACIA DUSTER','WW803740','22341-Y-6',NULL,'DACIA','DUSTER',NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT TRAFIC','WW803383','21881-Y-6','Fourgon','RENAULT','TRAFIC','NABIL LAKHDAR','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW803386','22505-Y-6','Fourgon','RENAULT','EXPRESS',NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW803387','22141-Y-6','Fourgon','RENAULT','EXPRESS','HAMZA ABID','affecte');
SELECT public._citymo_upsert_vehicle('DACIA LOGAN','WW803457','23948-Y-6',NULL,'DACIA','LOGAN','LHSSEN BENAICHA','affecte');
SELECT public._citymo_upsert_vehicle('MOTO SYM',NULL,'72-041148','Scooter','MOTO','SYM','MOHAMMED AIT LEMKADEM','affecte');
SELECT public._citymo_upsert_vehicle('MOTO KYMCO',NULL,'LU2U60050S54','Scooter','MOTO','KYMCO','SAID HSINA','affecte');

DROP FUNCTION public._citymo_upsert_vehicle(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

COMMIT;

SELECT COUNT(*) AS total_vehicules FROM public.vehicles;
