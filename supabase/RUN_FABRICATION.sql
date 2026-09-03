-- CITYMO — Module Fabrication (V1)
-- À coller dans le SQL Editor Supabase.
-- Additive, isolé, non destructif.

CREATE TABLE IF NOT EXISTS public.fabrication_plans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference               TEXT NOT NULL UNIQUE,
  project_id              UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  projet_nom              TEXT,
  projet_ref              TEXT,
  designation             TEXT NOT NULL,
  commentaire_transmission TEXT NOT NULL DEFAULT '',
  statut                  TEXT NOT NULL DEFAULT 'plan_recu',
  atelier                 TEXT,
  chef_atelier_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  chef_atelier_nom        TEXT,
  priorite                TEXT NOT NULL DEFAULT 'normale',
  date_transmission       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_debut_prevue       DATE,
  date_fin_prevue         DATE,
  date_debut_reelle       DATE,
  date_fin_reelle         DATE,
  avancement              INT NOT NULL DEFAULT 0,
  consigne                TEXT NOT NULL DEFAULT '',
  motif_blocage           TEXT,
  transmetteur_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transmetteur_nom        TEXT,
  affecte_par_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  affecte_par_nom         TEXT,
  date_affectation        TIMESTAMPTZ,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fabrication_plans_statut_check CHECK (
    statut IN ('plan_recu', 'a_lancer', 'en_fabrication', 'bloque', 'termine')
  ),
  CONSTRAINT fabrication_plans_atelier_check CHECK (
    atelier IS NULL OR atelier IN ('menuiserie_bois', 'aluminium', 'ferronnerie')
  ),
  CONSTRAINT fabrication_plans_priorite_check CHECK (
    priorite IN ('normale', 'urgente')
  ),
  CONSTRAINT fabrication_plans_avancement_check CHECK (
    avancement >= 0 AND avancement <= 100
  )
);

CREATE TABLE IF NOT EXISTS public.fabrication_attachments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              UUID NOT NULL REFERENCES public.fabrication_plans(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL DEFAULT 'plan',
  storage_path         TEXT NOT NULL,
  file_name            TEXT NOT NULL DEFAULT '',
  mime_type            TEXT,
  file_size            BIGINT,
  project_document_id  UUID REFERENCES public.project_documents(id) ON DELETE SET NULL,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fabrication_attachments_kind_check CHECK (kind IN ('plan', 'photo'))
);

CREATE TABLE IF NOT EXISTS public.fabrication_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID NOT NULL REFERENCES public.fabrication_plans(id) ON DELETE CASCADE,
  utilisateur_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  utilisateur_nom  TEXT,
  ancien_statut    TEXT,
  nouveau_statut   TEXT,
  avancement       INT,
  commentaire      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fab_plans_project ON public.fabrication_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_fab_plans_statut ON public.fabrication_plans(statut);
CREATE INDEX IF NOT EXISTS idx_fab_plans_atelier ON public.fabrication_plans(atelier);
CREATE INDEX IF NOT EXISTS idx_fab_plans_chef ON public.fabrication_plans(chef_atelier_user_id);
CREATE INDEX IF NOT EXISTS idx_fab_plans_date_trans ON public.fabrication_plans(date_transmission DESC);
CREATE INDEX IF NOT EXISTS idx_fab_plans_date_fin ON public.fabrication_plans(date_fin_prevue);
CREATE INDEX IF NOT EXISTS idx_fab_att_plan ON public.fabrication_attachments(plan_id);
CREATE INDEX IF NOT EXISTS idx_fab_hist_plan ON public.fabrication_history(plan_id, created_at DESC);

ALTER TABLE public.fabrication_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrication_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrication_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabrication_plans_auth ON public.fabrication_plans;
CREATE POLICY fabrication_plans_auth ON public.fabrication_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fabrication_attachments_auth ON public.fabrication_attachments;
CREATE POLICY fabrication_attachments_auth ON public.fabrication_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fabrication_history_auth ON public.fabrication_history;
CREATE POLICY fabrication_history_auth ON public.fabrication_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.fabrication_plans TO authenticated, service_role;
GRANT ALL ON public.fabrication_attachments TO authenticated, service_role;
GRANT ALL ON public.fabrication_history TO authenticated, service_role;

DO $$
DECLARE
  r RECORD;
  sub TEXT;
  a TEXT;
  subs TEXT[] := ARRAY['fabrication', 'fabrication-plans', 'fabrication-suivi', 'fabrication-terminee'];
  acts_full TEXT[] := ARRAY['voir', 'creer', 'modifier', 'supprimer', 'valider', 'exporter'];
  acts_chef TEXT[] := ARRAY['voir', 'creer'];
BEGIN
  FOR r IN
    SELECT id, code FROM public.erp_roles
    WHERE code IN ('dg', 'chef_projet', 'chef_chantier')
  LOOP
    FOREACH sub IN ARRAY subs LOOP
      IF r.code = 'chef_projet' THEN
        FOREACH a IN ARRAY acts_chef LOOP
          INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
          VALUES (r.id, 'fabrication', sub, a, true)
          ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;
        END LOOP;
      ELSE
        FOREACH a IN ARRAY acts_full LOOP
          INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
          VALUES (r.id, 'fabrication', sub, a, true)
          ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fabrication role_permissions seed skipped: %', SQLERRM;
END $$;

SELECT 'fabrication_plans OK' AS status;
