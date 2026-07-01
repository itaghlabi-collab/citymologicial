-- CITYMO — Besoins matériaux chantier (fiche déclarative, saisie libre)
-- Exécuter dans Supabase SQL Editor (projet npddbwsskaojcawaxygh)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.project_chantier_material_needs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_besoin        TEXT,
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_ref       TEXT,
  project_name      TEXT,
  client_name       TEXT,
  date_besoin       DATE NOT NULL DEFAULT CURRENT_DATE,
  priorite          TEXT NOT NULL DEFAULT 'Normale',
  demandeur_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  demandeur_name    TEXT,
  observation       TEXT,
  statut            TEXT NOT NULL DEFAULT 'brouillon',
  validation_direction TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_chantier_material_needs_statut_check CHECK (
    statut IN ('brouillon', 'soumis', 'valide', 'refuse', 'transmis', 'cloture')
  ),
  CONSTRAINT project_chantier_material_needs_priorite_check CHECK (
    priorite IN ('Normale', 'Urgente')
  )
);

CREATE TABLE IF NOT EXISTS public.project_chantier_material_need_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id         UUID NOT NULL REFERENCES public.project_chantier_material_needs(id) ON DELETE CASCADE,
  line_order      INT NOT NULL DEFAULT 0,
  designation     TEXT NOT NULL,
  quantite        NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unite           TEXT NOT NULL DEFAULT 'unité',
  lot             TEXT NOT NULL DEFAULT 'Autre',
  date_souhaitee  DATE,
  observation     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcmn_project ON public.project_chantier_material_needs (project_id);
CREATE INDEX IF NOT EXISTS idx_pcmn_statut ON public.project_chantier_material_needs (statut);
CREATE INDEX IF NOT EXISTS idx_pcmn_lines_need ON public.project_chantier_material_need_lines (need_id);

DROP TRIGGER IF EXISTS project_chantier_material_needs_updated_at ON public.project_chantier_material_needs;
CREATE TRIGGER project_chantier_material_needs_updated_at
  BEFORE UPDATE ON public.project_chantier_material_needs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_chantier_material_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chantier_material_need_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcmn_auth ON public.project_chantier_material_needs;
CREATE POLICY pcmn_auth ON public.project_chantier_material_needs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pcmn_lines_auth ON public.project_chantier_material_need_lines;
CREATE POLICY pcmn_lines_auth ON public.project_chantier_material_need_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.project_chantier_material_needs TO authenticated, service_role;
GRANT ALL ON public.project_chantier_material_need_lines TO authenticated, service_role;
