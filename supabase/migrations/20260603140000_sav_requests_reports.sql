CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.sav_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                 TEXT NOT NULL,
  project_id          UUID,
  client_id           UUID,
  client_nom          TEXT,
  projet_nom          TEXT,
  ref_projet          TEXT,
  titre               TEXT,
  type_probleme       TEXT,
  categorie           TEXT,
  priorite            TEXT NOT NULL DEFAULT 'normale',
  statut              TEXT NOT NULL DEFAULT 'nouvelle',
  date_demande        DATE,
  responsable         TEXT,
  contact_client      TEXT,
  localisation        TEXT,
  departement         TEXT,
  date_intervention   DATE,
  description         TEXT,
  observations        TEXT,
  actions_prevues     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS client_nom TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS projet_nom TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS ref_projet TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS type_probleme TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS categorie TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS priorite TEXT DEFAULT 'normale';
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'nouvelle';
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS contact_client TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS localisation TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS date_intervention DATE;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS actions_prevues TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_requests_ref_unique') THEN
    ALTER TABLE public.sav_requests ADD CONSTRAINT sav_requests_ref_unique UNIQUE (ref);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_requests_project_id_fkey') THEN
      ALTER TABLE public.sav_requests
        ADD CONSTRAINT sav_requests_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_requests_client_id_fkey') THEN
      ALTER TABLE public.sav_requests
        ADD CONSTRAINT sav_requests_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

ALTER TABLE public.sav_requests DROP CONSTRAINT IF EXISTS sav_requests_statut_check;
ALTER TABLE public.sav_requests
  ADD CONSTRAINT sav_requests_statut_check
  CHECK (statut IN ('nouvelle', 'en_attente', 'planifiee', 'en_cours', 'terminee', 'cloturee'));

ALTER TABLE public.sav_requests DROP CONSTRAINT IF EXISTS sav_requests_priorite_check;
ALTER TABLE public.sav_requests
  ADD CONSTRAINT sav_requests_priorite_check
  CHECK (priorite IN ('faible', 'normale', 'urgente', 'critique'));

CREATE INDEX IF NOT EXISTS idx_sav_requests_project_id ON public.sav_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_sav_requests_client_id ON public.sav_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_sav_requests_statut ON public.sav_requests(statut);
CREATE INDEX IF NOT EXISTS idx_sav_requests_ref ON public.sav_requests(ref);
CREATE INDEX IF NOT EXISTS idx_sav_requests_date_demande ON public.sav_requests(date_demande DESC);

DROP TRIGGER IF EXISTS sav_requests_updated_at ON public.sav_requests;
CREATE TRIGGER sav_requests_updated_at
  BEFORE UPDATE ON public.sav_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sav_reports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                     TEXT NOT NULL,
  sav_request_id          UUID,
  project_id              UUID,
  client_nom              TEXT,
  projet_nom              TEXT,
  sav_ref                 TEXT,
  intervenant             TEXT,
  date_compte_rendu       DATE,
  resume_intervention     TEXT,
  actions_realisees       TEXT,
  actions_a_prevoir       TEXT,
  statut_apres_intervention TEXT,
  pieces_remplacees       TEXT,
  cout_intervention       NUMERIC(14, 2) DEFAULT 0,
  recommandations         TEXT,
  validation_client       TEXT,
  statut                  TEXT NOT NULL DEFAULT 'brouillon',
  observation             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS sav_request_id UUID;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS date_compte_rendu DATE;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS actions_a_prevoir TEXT;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS statut_apres_intervention TEXT;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS observation TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_reports_ref_unique') THEN
    ALTER TABLE public.sav_reports ADD CONSTRAINT sav_reports_ref_unique UNIQUE (ref);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sav_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_reports_sav_request_id_fkey') THEN
      ALTER TABLE public.sav_reports
        ADD CONSTRAINT sav_reports_sav_request_id_fkey
        FOREIGN KEY (sav_request_id) REFERENCES public.sav_requests(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_reports_project_id_fkey') THEN
      ALTER TABLE public.sav_reports
        ADD CONSTRAINT sav_reports_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

ALTER TABLE public.sav_reports DROP CONSTRAINT IF EXISTS sav_reports_statut_check;
ALTER TABLE public.sav_reports
  ADD CONSTRAINT sav_reports_statut_check
  CHECK (statut IN ('brouillon', 'soumis', 'valide', 'refuse'));

CREATE INDEX IF NOT EXISTS idx_sav_reports_sav_request_id ON public.sav_reports(sav_request_id);
CREATE INDEX IF NOT EXISTS idx_sav_reports_project_id ON public.sav_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_sav_reports_date_cr ON public.sav_reports(date_compte_rendu DESC);

DROP TRIGGER IF EXISTS sav_reports_updated_at ON public.sav_reports;
CREATE TRIGGER sav_reports_updated_at
  BEFORE UPDATE ON public.sav_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sav_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sav_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sav_requests_all_auth ON public.sav_requests;
CREATE POLICY sav_requests_all_auth ON public.sav_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sav_reports_all_auth ON public.sav_reports;
CREATE POLICY sav_reports_all_auth ON public.sav_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.sav_requests TO authenticated, service_role;
GRANT ALL ON public.sav_reports TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
