-- =============================================================================
-- CITYMO — Lier profils ↔ employés + résolution destinataires renforcée
-- Supabase → SQL Editor → Run (après RUN_NOTIFICATIONS_FIX.sql)
-- =============================================================================

-- Lier par email identique
UPDATE public.profiles p
SET employee_id = e.id, updated_at = now()
FROM public.employees e
WHERE p.employee_id IS NULL
  AND lower(trim(coalesce(p.email, ''))) = lower(trim(coalesce(e.email, '')))
  AND trim(coalesce(e.email, '')) <> '';

-- Lier par nom profil ≈ prénom + nom employé
UPDATE public.profiles p
SET employee_id = e.id, updated_at = now()
FROM public.employees e
WHERE p.employee_id IS NULL
  AND public.normalize_person_name(p.nom) IN (
    public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)),
    public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname))
  );

-- Lier par nom profil ≈ nom seul (si unique)
UPDATE public.profiles p
SET employee_id = e.id, updated_at = now()
FROM public.employees e
WHERE p.employee_id IS NULL
  AND public.normalize_person_name(p.nom) = public.normalize_person_name(e.lastname)
  AND (
    SELECT count(*) FROM public.employees e2
    WHERE public.normalize_person_name(e2.lastname) = public.normalize_person_name(e.lastname)
  ) = 1;

-- Colonnes employee_id sur tâches / RDV (ciblage notifications fiable)
ALTER TABLE public.internal_tasks
  ADD COLUMN IF NOT EXISTS responsable_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.internal_appointments
  ADD COLUMN IF NOT EXISTS responsable_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_tasks_resp_emp
  ON public.internal_tasks (responsable_employee_id);

CREATE INDEX IF NOT EXISTS idx_internal_appointments_resp_emp
  ON public.internal_appointments (responsable_employee_id);

-- Remplir employee_id depuis le nom responsable existant
UPDATE public.internal_tasks t
SET responsable_employee_id = e.id
FROM public.employees e
WHERE t.responsable_employee_id IS NULL
  AND t.responsable IS NOT NULL
  AND public.normalize_person_name(t.responsable) IN (
    public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)),
    public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname))
  );

UPDATE public.internal_appointments a
SET responsable_employee_id = e.id
FROM public.employees e
WHERE a.responsable_employee_id IS NULL
  AND a.responsable IS NOT NULL
  AND public.normalize_person_name(a.responsable) IN (
    public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)),
    public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname))
  );

-- Résolution destinataire : profil par nom employé même sans employee_id lié
CREATE OR REPLACE FUNCTION public.resolve_notification_recipient(
  p_user_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_assignee_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_emp_id uuid;
  v_emp_email text;
  v_emp_first text;
  v_emp_last text;
  v_name text;
  v_norm text;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_uid FROM public.profiles
    WHERE id = p_user_id AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  v_emp_id := p_employee_id;

  IF v_emp_id IS NULL AND p_assignee_name IS NOT NULL AND trim(p_assignee_name) <> '' THEN
    v_norm := public.normalize_person_name(p_assignee_name);
    SELECT e.id INTO v_emp_id
    FROM public.employees e
    WHERE lower(coalesce(e.statut, 'actif')) <> 'inactif'
      AND (
        public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)) = v_norm
        OR public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname)) = v_norm
        OR public.normalize_person_name(e.lastname) = v_norm
        OR public.normalize_person_name(e.firstname) = v_norm
      )
    ORDER BY e.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_emp_id IS NOT NULL THEN
    SELECT e.email, e.firstname, e.lastname
    INTO v_emp_email, v_emp_first, v_emp_last
    FROM public.employees e WHERE e.id = v_emp_id LIMIT 1;

    SELECT p.id INTO v_uid FROM public.profiles p
    WHERE p.employee_id = v_emp_id AND public.profile_is_active(p.statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;

    IF v_emp_email IS NOT NULL AND trim(v_emp_email) <> '' THEN
      SELECT id INTO v_uid FROM public.profiles
      WHERE lower(email) = lower(trim(v_emp_email)) AND public.profile_is_active(statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;

    SELECT p.id INTO v_uid FROM public.profiles p
    WHERE public.profile_is_active(p.statut)
      AND public.normalize_person_name(p.nom) IN (
        public.normalize_person_name(concat_ws(' ', v_emp_first, v_emp_last)),
        public.normalize_person_name(concat_ws(' ', v_emp_last, v_emp_first)),
        public.normalize_person_name(v_emp_last),
        public.normalize_person_name(v_emp_first)
      )
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
    SELECT id INTO v_uid FROM public.profiles
    WHERE lower(email) = lower(trim(p_email)) AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  v_name := trim(coalesce(p_assignee_name, ''));
  IF v_name <> '' THEN
    IF position('@' in v_name) > 0 THEN
      SELECT id INTO v_uid FROM public.profiles
      WHERE lower(email) = lower(v_name) AND public.profile_is_active(statut) LIMIT 1;
      IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
    END IF;

    v_norm := public.normalize_person_name(v_name);
    SELECT id INTO v_uid FROM public.profiles
    WHERE public.normalize_person_name(nom) = v_norm AND public.profile_is_active(statut) LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_notification_recipient(uuid, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'profile link OK' AS status,
  (SELECT count(*) FROM public.profiles WHERE employee_id IS NOT NULL) AS profiles_linked,
  (SELECT count(*) FROM public.profiles WHERE employee_id IS NULL) AS profiles_unlinked;
