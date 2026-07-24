-- =============================================================================
-- CITYMO — Fiche sous-traitant V3 (évaluations + docs enrichis + archive soft)
-- Supabase SQL Editor → Run
-- ADDITIF / IDEMPOTENT — aucune suppression de données
-- PRÉREQUIS : RUN_SUBCONTRACTOR_ACCOUNT_V2.sql
-- =============================================================================

-- ─── 1. Soft archive sur sous-traitants ───────────────────────────────────────
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS responsable_interne TEXT;

-- ─── 2. Documents enrichis (catégories / version / archive) ─────────────────
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS document_date DATE;
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.subcontractor_documents(id) ON DELETE SET NULL;
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.subcontractor_documents
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- ─── 3. Évaluations performance ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_evaluations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id       UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id             UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  qualite                SMALLINT CHECK (qualite IS NULL OR (qualite BETWEEN 1 AND 5)),
  respect_delais         SMALLINT CHECK (respect_delais IS NULL OR (respect_delais BETWEEN 1 AND 5)),
  consignes              SMALLINT CHECK (consignes IS NULL OR (consignes BETWEEN 1 AND 5)),
  securite               SMALLINT CHECK (securite IS NULL OR (securite BETWEEN 1 AND 5)),
  reactivite             SMALLINT CHECK (reactivite IS NULL OR (reactivite BETWEEN 1 AND 5)),
  administratif          SMALLINT CHECK (administratif IS NULL OR (administratif BETWEEN 1 AND 5)),
  communication          SMALLINT CHECK (communication IS NULL OR (communication BETWEEN 1 AND 5)),
  rapport_qualite_prix   SMALLINT CHECK (rapport_qualite_prix IS NULL OR (rapport_qualite_prix BETWEEN 1 AND 5)),
  commentaire            TEXT,
  status                 TEXT NOT NULL DEFAULT 'validated'
    CHECK (status IN ('draft', 'validated', 'cancelled')),
  created_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_eval_sub
  ON public.subcontractor_evaluations (subcontractor_id);

ALTER TABLE public.subcontractor_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_eval_auth ON public.subcontractor_evaluations;
CREATE POLICY sub_eval_auth ON public.subcontractor_evaluations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS sub_eval_updated_at ON public.subcontractor_evaluations;
CREATE TRIGGER sub_eval_updated_at
  BEFORE UPDATE ON public.subcontractor_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Retenues dédiées (optionnel, soft) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_retenues (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id       UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id             UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  situation_id           UUID REFERENCES public.subcontractor_situations(id) ON DELETE SET NULL,
  retention_type         TEXT NOT NULL DEFAULT 'garantie'
    CHECK (retention_type IN (
      'garantie', 'penalite', 'avance_regulariser', 'administrative', 'autre'
    )),
  amount                 NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  percentage             NUMERIC(8, 4),
  motif                  TEXT,
  retention_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  release_date_planned   DATE,
  released_at            TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'cancelled')),
  observation            TEXT,
  created_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_ret_sub
  ON public.subcontractor_retenues (subcontractor_id);

ALTER TABLE public.subcontractor_retenues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_ret_auth ON public.subcontractor_retenues;
CREATE POLICY sub_ret_auth ON public.subcontractor_retenues
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

SELECT 'subcontractor_evaluations' AS objet,
  (SELECT COUNT(*)::text FROM public.subcontractor_evaluations) AS n
UNION ALL
SELECT 'subcontractor_retenues',
  (SELECT COUNT(*)::text FROM public.subcontractor_retenues);
