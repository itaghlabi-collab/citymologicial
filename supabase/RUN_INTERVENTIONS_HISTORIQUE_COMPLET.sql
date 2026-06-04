-- ═══════════════════════════════════════════════════════════════════════════
-- INTERVENTIONS + HISTORIQUE — SQL UNIQUE (Supabase SQL Editor → Run)
-- Prérequis : table public.vehicles existante
--
-- Tables :
--   • vehicle_intervention_requests  → Demandes d'intervention (actives)
--   • vehicle_intervention_history   → Historique (clôturées)
--
-- Trigger : passage auto vers Historique quand statut = termine / terminée / annule
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Utilitaire updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Normalisation statut (UI + alias français) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_intervention_statut(p_statut TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE LOWER(TRIM(COALESCE(p_statut, '')))
    WHEN 'terminée'   THEN 'termine'
    WHEN 'terminee'   THEN 'termine'
    WHEN 'annulée'    THEN 'annule'
    WHEN 'annulee'    THEN 'annule'
    WHEN 'en cours'   THEN 'en_cours'
    WHEN 'en_attente' THEN 'en_attente'
    ELSE LOWER(TRIM(p_statut))
  END;
$$;

-- ─── TRIGGER FUNCTION : normaliser statut avant écriture demande ───────────
CREATE OR REPLACE FUNCTION public.trg_normalize_intervention_request_statut()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.statut := public.normalize_intervention_statut(NEW.statut);
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 1 : vehicle_intervention_requests
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vehicle_intervention_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                   TEXT NOT NULL UNIQUE,
  vehicle_id            UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  matricule             TEXT,
  vehicule_label        TEXT,
  chauffeur             TEXT,
  departement           TEXT,
  type_intervention     TEXT NOT NULL DEFAULT 'Autre',
  description           TEXT,
  priorite              TEXT NOT NULL DEFAULT 'normale',
  date_demande          DATE,
  date_prevue           DATE,
  statut                TEXT NOT NULL DEFAULT 'en_attente',
  cout_estime           NUMERIC(12, 2),
  garage                TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS vehicule_label TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS type_intervention TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS date_prevue DATE;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS cout_estime NUMERIC(12, 2);
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS garage TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicle_intervention_requests DROP CONSTRAINT IF EXISTS vehicle_intervention_requests_priorite_check;
ALTER TABLE public.vehicle_intervention_requests
  ADD CONSTRAINT vehicle_intervention_requests_priorite_check
  CHECK (priorite IN ('faible', 'normale', 'urgente', 'critique', 'basse', 'haute'));

ALTER TABLE public.vehicle_intervention_requests DROP CONSTRAINT IF EXISTS vehicle_intervention_requests_statut_check;
ALTER TABLE public.vehicle_intervention_requests
  ADD CONSTRAINT vehicle_intervention_requests_statut_check
  CHECK (statut IN (
    'en_attente', 'diagnostic', 'en_cours',
    'termine', 'terminée', 'terminee',
    'annule', 'annulée', 'annulee'
  ));

CREATE INDEX IF NOT EXISTS idx_vir_vehicle_id ON public.vehicle_intervention_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vir_matricule ON public.vehicle_intervention_requests(matricule);
CREATE INDEX IF NOT EXISTS idx_vir_chauffeur ON public.vehicle_intervention_requests(chauffeur);
CREATE INDEX IF NOT EXISTS idx_vir_statut ON public.vehicle_intervention_requests(statut);
CREATE INDEX IF NOT EXISTS idx_vir_priorite ON public.vehicle_intervention_requests(priorite);
CREATE INDEX IF NOT EXISTS idx_vir_date_demande ON public.vehicle_intervention_requests(date_demande DESC);
CREATE INDEX IF NOT EXISTS idx_vir_created_at ON public.vehicle_intervention_requests(created_at DESC);

DROP TRIGGER IF EXISTS vehicle_intervention_requests_normalize_statut ON public.vehicle_intervention_requests;
CREATE TRIGGER vehicle_intervention_requests_normalize_statut
  BEFORE INSERT OR UPDATE OF statut ON public.vehicle_intervention_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_intervention_request_statut();

DROP TRIGGER IF EXISTS vehicle_intervention_requests_updated_at ON public.vehicle_intervention_requests;
CREATE TRIGGER vehicle_intervention_requests_updated_at
  BEFORE UPDATE ON public.vehicle_intervention_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 2 : vehicle_intervention_history (alias métier : intervention_history)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vehicle_intervention_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            UUID NOT NULL UNIQUE,
  ref                   TEXT NOT NULL,
  vehicle_id            UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  matricule             TEXT,
  vehicule_label        TEXT,
  chauffeur             TEXT,
  type_intervention     TEXT,
  description           TEXT,
  priorite              TEXT,
  date_demande          DATE,
  date_intervention     DATE,
  date_fin              DATE NOT NULL DEFAULT CURRENT_DATE,
  cout_final            NUMERIC(12, 2),
  prestataire           TEXT,
  observation_finale    TEXT,
  statut                TEXT NOT NULL DEFAULT 'termine',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_intervention_history_request_fk
    FOREIGN KEY (request_id) REFERENCES public.vehicle_intervention_requests(id) ON DELETE CASCADE
);

ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS vehicule_label TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS type_intervention TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS priorite TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_intervention DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_fin DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS cout_final NUMERIC(12, 2);
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS prestataire TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS observation_finale TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'termine';
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicle_intervention_history DROP CONSTRAINT IF EXISTS vehicle_intervention_history_statut_check;
ALTER TABLE public.vehicle_intervention_history
  ADD CONSTRAINT vehicle_intervention_history_statut_check
  CHECK (statut IN ('termine', 'annule'));

CREATE INDEX IF NOT EXISTS idx_vih_request_id ON public.vehicle_intervention_history(request_id);
CREATE INDEX IF NOT EXISTS idx_vih_vehicle_id ON public.vehicle_intervention_history(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vih_matricule ON public.vehicle_intervention_history(matricule);
CREATE INDEX IF NOT EXISTS idx_vih_chauffeur ON public.vehicle_intervention_history(chauffeur);
CREATE INDEX IF NOT EXISTS idx_vih_type ON public.vehicle_intervention_history(type_intervention);
CREATE INDEX IF NOT EXISTS idx_vih_date_fin ON public.vehicle_intervention_history(date_fin DESC);
CREATE INDEX IF NOT EXISTS idx_vih_created_at ON public.vehicle_intervention_history(created_at DESC);

DROP TRIGGER IF EXISTS vehicle_intervention_history_updated_at ON public.vehicle_intervention_history;
CREATE TRIGGER vehicle_intervention_history_updated_at
  BEFORE UPDATE ON public.vehicle_intervention_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── TRIGGER FUNCTION : copier demande → historique si clôturée ─────────────
CREATE OR REPLACE FUNCTION public.sync_vehicle_intervention_to_history(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vehicle_intervention_requests%ROWTYPE;
  v_statut TEXT;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO r FROM public.vehicle_intervention_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_statut := public.normalize_intervention_statut(r.statut);

  IF v_statut NOT IN ('termine', 'annule') THEN
    DELETE FROM public.vehicle_intervention_history WHERE request_id = p_request_id;
    RETURN;
  END IF;

  INSERT INTO public.vehicle_intervention_history (
    request_id, ref, vehicle_id, matricule, vehicule_label, chauffeur,
    type_intervention, description, priorite,
    date_demande, date_intervention, date_fin,
    cout_final, prestataire, observation_finale, statut
  ) VALUES (
    r.id, r.ref, r.vehicle_id, r.matricule, r.vehicule_label, r.chauffeur,
    r.type_intervention, r.description, r.priorite,
    r.date_demande, COALESCE(r.date_prevue, r.date_demande, v_today), v_today,
    r.cout_estime, r.garage, r.notes,
    v_statut
  )
  ON CONFLICT (request_id) DO UPDATE SET
    ref = EXCLUDED.ref,
    vehicle_id = EXCLUDED.vehicle_id,
    matricule = EXCLUDED.matricule,
    vehicule_label = EXCLUDED.vehicule_label,
    chauffeur = EXCLUDED.chauffeur,
    type_intervention = EXCLUDED.type_intervention,
    description = EXCLUDED.description,
    priorite = EXCLUDED.priorite,
    date_demande = EXCLUDED.date_demande,
    date_intervention = EXCLUDED.date_intervention,
    date_fin = EXCLUDED.date_fin,
    cout_final = EXCLUDED.cout_final,
    prestataire = EXCLUDED.prestataire,
    observation_finale = EXCLUDED.observation_finale,
    statut = EXCLUDED.statut,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_vehicle_intervention_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_vehicle_intervention_to_history(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicle_intervention_requests_sync_history ON public.vehicle_intervention_requests;
CREATE TRIGGER vehicle_intervention_requests_sync_history
  AFTER INSERT OR UPDATE ON public.vehicle_intervention_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_vehicle_intervention_history();

-- ─── Rattrapage : demandes déjà terminées sans ligne historique ─────────────
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM public.vehicle_intervention_requests
    WHERE public.normalize_intervention_statut(statut) IN ('termine', 'annule')
  LOOP
    PERFORM public.sync_vehicle_intervention_to_history(rec.id);
  END LOOP;
END;
$$;

-- ─── RLS : authenticated (comme vehicles) ───────────────────────────────────
ALTER TABLE public.vehicle_intervention_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_intervention_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_intervention_requests_all_auth ON public.vehicle_intervention_requests;
CREATE POLICY vehicle_intervention_requests_all_auth ON public.vehicle_intervention_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vehicle_intervention_history_all_auth ON public.vehicle_intervention_history;
CREATE POLICY vehicle_intervention_history_all_auth ON public.vehicle_intervention_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicle_intervention_requests TO authenticated;
GRANT ALL ON public.vehicle_intervention_requests TO service_role;
GRANT ALL ON public.vehicle_intervention_history TO authenticated;
GRANT ALL ON public.vehicle_intervention_history TO service_role;

GRANT EXECUTE ON FUNCTION public.normalize_intervention_statut(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_vehicle_intervention_to_history(UUID) TO authenticated, service_role;

-- ─── Vérifications ──────────────────────────────────────────────────────────
SELECT COUNT(*) AS nb_demandes FROM public.vehicle_intervention_requests;
SELECT COUNT(*) AS nb_historique FROM public.vehicle_intervention_history;

SELECT r.ref, r.statut AS statut_demande, h.statut AS statut_historique, h.date_fin
FROM public.vehicle_intervention_requests r
LEFT JOIN public.vehicle_intervention_history h ON h.request_id = r.id
WHERE public.normalize_intervention_statut(r.statut) IN ('termine', 'annule')
ORDER BY r.created_at DESC
LIMIT 20;
