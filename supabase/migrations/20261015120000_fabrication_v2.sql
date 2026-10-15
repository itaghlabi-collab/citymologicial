-- CITYMO — Module Fabrication V2 (bibliothèque de plans, désignations, affectations, opérations)
-- Additif et non destructif : aucune table supprimée ni vidée, aucune ligne existante modifiée.
-- Les contraintes CHECK de fabrication_plans sont uniquement élargies (nouvelles valeurs autorisées).
-- Idempotent : peut être ré-exécuté sans effet de bord. Copie : supabase/RUN_FABRICATION_V2.sql

-- 1) Bibliothèque « Plans / Projets »
CREATE TABLE IF NOT EXISTS public.fabrication_library_plans (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                TEXT NOT NULL UNIQUE,
  nom                      TEXT NOT NULL,
  project_id               UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  projet_nom               TEXT NOT NULL DEFAULT '',
  projet_ref               TEXT NOT NULL DEFAULT '',
  client_nom               TEXT NOT NULL DEFAULT '',
  designation              TEXT NOT NULL DEFAULT '',
  atelier                  TEXT,
  machine_type             TEXT,
  observations             TEXT NOT NULL DEFAULT '',
  source                   TEXT NOT NULL DEFAULT 'manuel',
  commentaire_transmission TEXT NOT NULL DEFAULT '',
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_nom           TEXT NOT NULL DEFAULT '',
  updated_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fab_lib_atelier_check CHECK (
    atelier IS NULL OR atelier IN ('menuiserie_bois', 'aluminium', 'ferronnerie', 'machinerie')
  ),
  CONSTRAINT fab_lib_machine_check CHECK (
    machine_type IS NULL OR machine_type IN ('cnc', 'laser', 'co2')
  ),
  CONSTRAINT fab_lib_source_check CHECK (source IN ('manuel', 'projets'))
);

CREATE TABLE IF NOT EXISTS public.fabrication_library_files (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_plan_id      UUID NOT NULL REFERENCES public.fabrication_library_plans(id) ON DELETE CASCADE,
  storage_path         TEXT NOT NULL,
  file_name            TEXT NOT NULL DEFAULT '',
  mime_type            TEXT,
  file_size            BIGINT,
  project_document_id  UUID REFERENCES public.project_documents(id) ON DELETE SET NULL,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Productions (table existante fabrication_plans) — colonnes ajoutées, toutes optionnelles
ALTER TABLE public.fabrication_plans
  ADD COLUMN IF NOT EXISTS library_plan_id UUID REFERENCES public.fabrication_library_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS machine_type TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observations TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsable_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.fabrication_plans DROP CONSTRAINT IF EXISTS fabrication_plans_statut_check;
ALTER TABLE public.fabrication_plans ADD CONSTRAINT fabrication_plans_statut_check CHECK (
  statut IN ('plan_recu', 'brouillon', 'a_lancer', 'en_fabrication', 'en_attente', 'bloque', 'termine')
);
ALTER TABLE public.fabrication_plans DROP CONSTRAINT IF EXISTS fabrication_plans_atelier_check;
ALTER TABLE public.fabrication_plans ADD CONSTRAINT fabrication_plans_atelier_check CHECK (
  atelier IS NULL OR atelier IN ('menuiserie_bois', 'aluminium', 'ferronnerie', 'machinerie')
);
ALTER TABLE public.fabrication_plans DROP CONSTRAINT IF EXISTS fabrication_plans_priorite_check;
ALTER TABLE public.fabrication_plans ADD CONSTRAINT fabrication_plans_priorite_check CHECK (
  priorite IN ('normale', 'haute', 'urgente')
);
ALTER TABLE public.fabrication_plans DROP CONSTRAINT IF EXISTS fabrication_plans_machine_check;
ALTER TABLE public.fabrication_plans ADD CONSTRAINT fabrication_plans_machine_check CHECK (
  machine_type IS NULL OR machine_type IN ('cnc', 'laser', 'co2')
);

-- 3) Désignations d'une production (quantités jamais additionnées entre lignes)
CREATE TABLE IF NOT EXISTS public.fabrication_production_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id      UUID NOT NULL REFERENCES public.fabrication_plans(id) ON DELETE CASCADE,
  ordre              INT NOT NULL DEFAULT 0,
  designation        TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  quantite           NUMERIC(12,2) NOT NULL DEFAULT 1,
  unite              TEXT NOT NULL DEFAULT 'unite',
  unite_autre        TEXT NOT NULL DEFAULT '',
  atelier            TEXT,
  machine_type       TEXT,
  quantite_realisee  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fab_line_qte_check CHECK (quantite > 0),
  CONSTRAINT fab_line_realisee_check CHECK (quantite_realisee >= 0),
  CONSTRAINT fab_line_unite_check CHECK (unite IN ('unite', 'ensemble', 'm2', 'ml', 'autre')),
  CONSTRAINT fab_line_atelier_check CHECK (
    atelier IS NULL OR atelier IN ('menuiserie_bois', 'aluminium', 'ferronnerie', 'machinerie')
  ),
  CONSTRAINT fab_line_machine_check CHECK (
    machine_type IS NULL OR machine_type IN ('cnc', 'laser', 'co2')
  )
);

-- 4) Ouvriers affectés (employés RH internes, sans doublon par production)
CREATE TABLE IF NOT EXISTS public.fabrication_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id  UUID NOT NULL REFERENCES public.fabrication_plans(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_nom   TEXT NOT NULL DEFAULT '',
  poste          TEXT NOT NULL DEFAULT '',
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fab_assign_unique UNIQUE (production_id, employee_id)
);

-- 5) Dispatching par opération
CREATE TABLE IF NOT EXISTS public.fabrication_operations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id            UUID NOT NULL REFERENCES public.fabrication_plans(id) ON DELETE CASCADE,
  ordre                    INT NOT NULL DEFAULT 0,
  travail                  TEXT NOT NULL,
  responsable_employee_id  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  responsable_nom          TEXT NOT NULL DEFAULT '',
  date_prevue              DATE,
  date_limite              DATE,
  statut                   TEXT NOT NULL DEFAULT 'a_faire',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fab_op_statut_check CHECK (statut IN ('a_faire', 'en_cours', 'termine'))
);

-- 6) Historique : saisies d'avancement par désignation
ALTER TABLE public.fabrication_history
  ADD COLUMN IF NOT EXISTS line_id UUID REFERENCES public.fabrication_production_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantite_realisee NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS probleme TEXT,
  ADD COLUMN IF NOT EXISTS date_saisie DATE;

-- Index
CREATE INDEX IF NOT EXISTS idx_fab_lib_project ON public.fabrication_library_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_fab_lib_created ON public.fabrication_library_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fab_lib_files_plan ON public.fabrication_library_files(library_plan_id);
CREATE INDEX IF NOT EXISTS idx_fab_plans_library ON public.fabrication_plans(library_plan_id);
CREATE INDEX IF NOT EXISTS idx_fab_lines_prod ON public.fabrication_production_lines(production_id, ordre);
CREATE INDEX IF NOT EXISTS idx_fab_assign_prod ON public.fabrication_assignments(production_id);
CREATE INDEX IF NOT EXISTS idx_fab_assign_emp ON public.fabrication_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_fab_ops_prod ON public.fabrication_operations(production_id, ordre);
CREATE INDEX IF NOT EXISTS idx_fab_hist_line ON public.fabrication_history(line_id);

-- RLS : même règle que les tables Fabrication existantes
ALTER TABLE public.fabrication_library_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrication_library_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrication_production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrication_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrication_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabrication_library_plans_auth ON public.fabrication_library_plans;
CREATE POLICY fabrication_library_plans_auth ON public.fabrication_library_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fabrication_library_files_auth ON public.fabrication_library_files;
CREATE POLICY fabrication_library_files_auth ON public.fabrication_library_files
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fabrication_production_lines_auth ON public.fabrication_production_lines;
CREATE POLICY fabrication_production_lines_auth ON public.fabrication_production_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fabrication_assignments_auth ON public.fabrication_assignments;
CREATE POLICY fabrication_assignments_auth ON public.fabrication_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fabrication_operations_auth ON public.fabrication_operations;
CREATE POLICY fabrication_operations_auth ON public.fabrication_operations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.fabrication_library_plans TO authenticated, service_role;
GRANT ALL ON public.fabrication_library_files TO authenticated, service_role;
GRANT ALL ON public.fabrication_production_lines TO authenticated, service_role;
GRANT ALL ON public.fabrication_assignments TO authenticated, service_role;
GRANT ALL ON public.fabrication_operations TO authenticated, service_role;

-- Droits du nouveau sous-menu « Plans / Projets » : copie exacte des droits « Plans à fabriquer »
-- (inserts uniquement, aucun droit existant modifié)
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT role_id, module_code, 'fabrication-plans-projets', action_code, granted
FROM public.role_permissions
WHERE submodule_code = 'fabrication-plans'
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

INSERT INTO public.user_permission_exceptions (user_id, submodule_code, action_code, granted)
SELECT user_id, 'fabrication-plans-projets', action_code, granted
FROM public.user_permission_exceptions
WHERE submodule_code = 'fabrication-plans'
ON CONFLICT ON CONSTRAINT user_permission_exceptions_user_id_submodule_code_action_co_key DO NOTHING;

SELECT 'fabrication V2 OK' AS status;
