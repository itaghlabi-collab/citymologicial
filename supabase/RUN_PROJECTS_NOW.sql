-- Supabase SQL Editor → Run (module Projets)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                 TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_nom          TEXT,
  type_projet         TEXT,
  adresse_chantier    TEXT,
  ville               TEXT,
  date_debut          DATE,
  date_fin_prevue     DATE,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  responsable         TEXT,
  chef_chantier       TEXT,
  budget_estime       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  budget_consomme     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description         TEXT,
  observations        TEXT,
  devis_id            UUID,
  devis_reference     TEXT,
  facture_id          UUID,
  facture_reference   TEXT,
  priorite            TEXT DEFAULT 'normale',
  avancement          NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_ref_unique') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_ref_unique UNIQUE (ref);
  END IF;
END $$;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_statut_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_statut_check
  CHECK (statut IN ('brouillon', 'en_cours', 'en_pause', 'termine', 'annule'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_devis') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_devis_id_fkey') THEN
      ALTER TABLE public.projects
        ADD CONSTRAINT projects_devis_id_fkey
        FOREIGN KEY (devis_id) REFERENCES public.crm_devis(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_factures') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_facture_id_fkey') THEN
      ALTER TABLE public.projects
        ADD CONSTRAINT projects_facture_id_fkey
        FOREIGN KEY (facture_id) REFERENCES public.crm_factures(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_statut ON public.projects(statut);
CREATE INDEX IF NOT EXISTS idx_projects_type_projet ON public.projects(type_projet);
CREATE INDEX IF NOT EXISTS idx_projects_ref ON public.projects(ref);
CREATE INDEX IF NOT EXISTS idx_projects_date_debut ON public.projects(date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_all_auth ON public.projects;
CREATE POLICY projects_all_auth ON public.projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.projects TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'projects OK' AS status, COUNT(*) AS nb FROM public.projects;
