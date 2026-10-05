-- ═══════════════════════════════════════════════════════════════════════════
-- CITYMO — Commercial / Marketing › Suivi des tâches
-- Tables dédiées au module (additif uniquement : aucune table existante modifiée).
-- Ré-exécutable sans risque.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tâches ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre             TEXT NOT NULL,
  description       TEXT,
  categorie         TEXT NOT NULL DEFAULT 'autre'
                    CHECK (categorie IN ('prospection', 'client', 'devis', 'relance', 'marketing', 'communication', 'administratif', 'autre')),
  societe           TEXT,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  responsable_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  priorite          TEXT NOT NULL DEFAULT 'normale'
                    CHECK (priorite IN ('urgente', 'haute', 'normale', 'faible')),
  statut            TEXT NOT NULL DEFAULT 'a_faire'
                    CHECK (statut IN ('a_faire', 'en_cours', 'en_attente_validation', 'termine')),
  bloque            BOOLEAN NOT NULL DEFAULT false,
  bloque_motif      TEXT,
  echeance          DATE,
  relance_dg        BOOLEAN NOT NULL DEFAULT false,
  relance_dg_date   DATE,
  relance_dg_objet  TEXT,
  notes             TEXT,
  position          DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_by        UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commercial_tasks_statut ON public.commercial_tasks(statut);
CREATE INDEX IF NOT EXISTS idx_commercial_tasks_responsable ON public.commercial_tasks(responsable_id);
CREATE INDEX IF NOT EXISTS idx_commercial_tasks_echeance ON public.commercial_tasks(echeance);

-- ── Commentaires ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.commercial_tasks(id) ON DELETE CASCADE,
  author_id   UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  author_nom  TEXT,
  contenu     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_task_comments_task ON public.commercial_task_comments(task_id, created_at);

-- ── Historique (rempli uniquement par trigger) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_task_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.commercial_tasks(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  actor_id    UUID,
  actor_nom   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_task_history_task ON public.commercial_task_history(task_id, created_at);

-- ── Fonctions du module ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercial_task_user_nom(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(TRIM(p.nom), ''), p.email)
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.commercial_tasks_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := NOW();
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    IF NEW.statut = 'termine' AND OLD.statut IS DISTINCT FROM 'termine' THEN
      NEW.completed_at := NOW();
    ELSIF NEW.statut <> 'termine' THEN
      NEW.completed_at := NULL;
    END IF;
  ELSE
    IF NEW.statut = 'termine' THEN
      NEW.completed_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commercial_tasks_log_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_nom   text := public.commercial_task_user_nom(auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.commercial_task_history (task_id, event, new_value, actor_id, actor_nom)
    VALUES (NEW.id, 'creee', NEW.titre, v_actor, v_nom);
    IF NEW.relance_dg THEN
      INSERT INTO public.commercial_task_history (task_id, event, new_value, actor_id, actor_nom)
      VALUES (NEW.id, 'relance_dg', COALESCE(NEW.relance_dg_date::text, ''), v_actor, v_nom);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.commercial_task_history (task_id, event, old_value, new_value, actor_id, actor_nom)
    VALUES (NEW.id, CASE WHEN NEW.statut = 'termine' THEN 'terminee' ELSE 'statut' END,
            OLD.statut, NEW.statut, v_actor, v_nom);
  END IF;

  IF NEW.responsable_id IS DISTINCT FROM OLD.responsable_id THEN
    INSERT INTO public.commercial_task_history (task_id, event, old_value, new_value, actor_id, actor_nom)
    VALUES (NEW.id, 'responsable',
            public.commercial_task_user_nom(OLD.responsable_id),
            public.commercial_task_user_nom(NEW.responsable_id), v_actor, v_nom);
  END IF;

  IF NEW.priorite IS DISTINCT FROM OLD.priorite THEN
    INSERT INTO public.commercial_task_history (task_id, event, old_value, new_value, actor_id, actor_nom)
    VALUES (NEW.id, 'priorite', OLD.priorite, NEW.priorite, v_actor, v_nom);
  END IF;

  IF NEW.echeance IS DISTINCT FROM OLD.echeance THEN
    INSERT INTO public.commercial_task_history (task_id, event, old_value, new_value, actor_id, actor_nom)
    VALUES (NEW.id, 'echeance', OLD.echeance::text, NEW.echeance::text, v_actor, v_nom);
  END IF;

  IF NEW.relance_dg IS DISTINCT FROM OLD.relance_dg
     OR (NEW.relance_dg AND NEW.relance_dg_date IS DISTINCT FROM OLD.relance_dg_date) THEN
    INSERT INTO public.commercial_task_history (task_id, event, old_value, new_value, actor_id, actor_nom)
    VALUES (NEW.id, CASE WHEN NEW.relance_dg THEN 'relance_dg' ELSE 'relance_dg_retiree' END,
            OLD.relance_dg_date::text, NEW.relance_dg_date::text, v_actor, v_nom);
  END IF;

  IF NEW.bloque IS DISTINCT FROM OLD.bloque THEN
    INSERT INTO public.commercial_task_history (task_id, event, new_value, actor_id, actor_nom)
    VALUES (NEW.id, CASE WHEN NEW.bloque THEN 'bloquee' ELSE 'debloquee' END,
            NEW.bloque_motif, v_actor, v_nom);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commercial_task_comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.author_id := auth.uid();
  NEW.author_nom := public.commercial_task_user_nom(auth.uid());
  NEW.created_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commercial_tasks_before_write ON public.commercial_tasks;
CREATE TRIGGER trg_commercial_tasks_before_write
  BEFORE INSERT OR UPDATE ON public.commercial_tasks
  FOR EACH ROW EXECUTE FUNCTION public.commercial_tasks_before_write();

DROP TRIGGER IF EXISTS trg_commercial_tasks_log_history ON public.commercial_tasks;
CREATE TRIGGER trg_commercial_tasks_log_history
  AFTER INSERT OR UPDATE ON public.commercial_tasks
  FOR EACH ROW EXECUTE FUNCTION public.commercial_tasks_log_history();

DROP TRIGGER IF EXISTS trg_commercial_task_comments_before_insert ON public.commercial_task_comments;
CREATE TRIGGER trg_commercial_task_comments_before_insert
  BEFORE INSERT ON public.commercial_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.commercial_task_comments_before_insert();

-- Responsables assignables : utilisateurs ERP actifs (profiles), sans exposer d'autres colonnes.
CREATE OR REPLACE FUNCTION public.list_commercial_task_assignees()
RETURNS TABLE (id uuid, nom text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, COALESCE(NULLIF(TRIM(p.nom), ''), p.email) AS nom, p.email
  FROM public.profiles p
  WHERE COALESCE(p.statut, 'actif') = 'actif'
    AND public.erp_can('voir', 'suivi-taches-com')
  ORDER BY 2;
$$;

GRANT EXECUTE ON FUNCTION public.list_commercial_task_assignees() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_task_user_nom(uuid) TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_tasks_select ON public.commercial_tasks;
CREATE POLICY commercial_tasks_select ON public.commercial_tasks
  FOR SELECT TO authenticated
  USING (public.erp_can('voir', 'suivi-taches-com'));

DROP POLICY IF EXISTS commercial_tasks_insert ON public.commercial_tasks;
CREATE POLICY commercial_tasks_insert ON public.commercial_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.erp_can('creer', 'suivi-taches-com'));

-- Le responsable peut faire avancer sa propre tâche même sans le droit « modifier ».
DROP POLICY IF EXISTS commercial_tasks_update ON public.commercial_tasks;
CREATE POLICY commercial_tasks_update ON public.commercial_tasks
  FOR UPDATE TO authenticated
  USING (
    public.erp_can('modifier', 'suivi-taches-com')
    OR (responsable_id = auth.uid() AND public.erp_can('voir', 'suivi-taches-com'))
  )
  WITH CHECK (public.erp_can('voir', 'suivi-taches-com'));

DROP POLICY IF EXISTS commercial_tasks_delete ON public.commercial_tasks;
CREATE POLICY commercial_tasks_delete ON public.commercial_tasks
  FOR DELETE TO authenticated
  USING (public.erp_can('supprimer', 'suivi-taches-com'));

DROP POLICY IF EXISTS commercial_task_comments_select ON public.commercial_task_comments;
CREATE POLICY commercial_task_comments_select ON public.commercial_task_comments
  FOR SELECT TO authenticated
  USING (public.erp_can('voir', 'suivi-taches-com'));

DROP POLICY IF EXISTS commercial_task_comments_insert ON public.commercial_task_comments;
CREATE POLICY commercial_task_comments_insert ON public.commercial_task_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.erp_can('voir', 'suivi-taches-com'));

DROP POLICY IF EXISTS commercial_task_comments_delete ON public.commercial_task_comments;
CREATE POLICY commercial_task_comments_delete ON public.commercial_task_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.erp_can('supprimer', 'suivi-taches-com'));

DROP POLICY IF EXISTS commercial_task_history_select ON public.commercial_task_history;
CREATE POLICY commercial_task_history_select ON public.commercial_task_history
  FOR SELECT TO authenticated
  USING (public.erp_can('voir', 'suivi-taches-com'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_tasks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.commercial_task_comments TO authenticated;
GRANT SELECT ON public.commercial_task_history TO authenticated;
GRANT ALL ON public.commercial_tasks, public.commercial_task_comments, public.commercial_task_history TO service_role;

-- ── Permissions additives : mêmes droits que « Actions marketing » ──────────
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT rp.role_id, 'commercial_marketing', 'suivi-taches-com', rp.action_code, true
FROM public.role_permissions rp
WHERE rp.submodule_code = 'actions-marketing'
  AND rp.granted = true
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT 'commercial_task_tracking OK' AS status;
