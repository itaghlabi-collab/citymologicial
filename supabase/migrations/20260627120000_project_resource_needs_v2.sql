-- Besoins RH projet v2 — demandes de ressources complètes

ALTER TABLE public.project_staff_needs
  DROP CONSTRAINT IF EXISTS project_staff_needs_project_id_fonction_key;

ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS ref_besoin TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS type_besoin TEXT NOT NULL DEFAULT 'Ouvriers';
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS corps_metier TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS specialite TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS date_debut_souhaitee DATE;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS date_fin_estimee DATE;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS duree_prevue TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'Normale';
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS responsable_demande TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS description_travaux TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS competences TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS epi_obligatoires TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS observation TEXT;
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'brouillon';
ALTER TABLE public.project_staff_needs ADD COLUMN IF NOT EXISTS resource_request_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_staff_needs_statut_check'
  ) THEN
    ALTER TABLE public.project_staff_needs ADD CONSTRAINT project_staff_needs_statut_check CHECK (
      statut IN ('brouillon', 'soumis', 'en_recherche_rh', 'partiellement_couvert', 'couvert', 'annule', 'clos')
    );
  END IF;
END $$;

UPDATE public.project_staff_needs
SET type_besoin = COALESCE(NULLIF(type_besoin, ''), fonction, 'Ouvriers'),
    statut = CASE WHEN statut IS NULL OR statut = '' THEN 'soumis' ELSE statut END
WHERE type_besoin IS NULL OR type_besoin = '' OR statut IS NULL OR statut = '';

CREATE TABLE IF NOT EXISTS public.project_staff_need_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id     UUID NOT NULL REFERENCES public.project_staff_needs(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  details     TEXT,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_staff_need_history_need ON public.project_staff_need_history(need_id);
CREATE INDEX IF NOT EXISTS idx_project_staff_needs_statut ON public.project_staff_needs(statut);
CREATE INDEX IF NOT EXISTS idx_project_staff_needs_type ON public.project_staff_needs(type_besoin);

ALTER TABLE public.resource_requests ADD COLUMN IF NOT EXISTS staff_need_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resource_requests_staff_need_id_fkey'
  ) THEN
    ALTER TABLE public.resource_requests
      ADD CONSTRAINT resource_requests_staff_need_id_fkey
      FOREIGN KEY (staff_need_id) REFERENCES public.project_staff_needs(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.project_staff_need_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_staff_need_history_auth ON public.project_staff_need_history;
CREATE POLICY project_staff_need_history_auth ON public.project_staff_need_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.project_staff_need_history TO authenticated, service_role;
