-- =============================================================================
-- CITYMO — Notifications tâches/RDV côté serveur + insert RPC
-- Supabase → SQL Editor → Run (après RUN_NOTIFICATIONS_PROFILE_LINK.sql)
-- =============================================================================

-- Insert notification (bypass RLS lecture retour INSERT)
CREATE OR REPLACE FUNCTION public.insert_user_notification(
  p_recipient_user_id uuid,
  p_title text,
  p_message text DEFAULT NULL,
  p_type text DEFAULT 'system',
  p_priority text DEFAULT 'normal',
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_action_url text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_submodule_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notifications;
BEGIN
  IF p_recipient_user_id IS NULL OR trim(coalesce(p_title, '')) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id, title, message, type, priority,
    entity_type, entity_id, action_url, created_by, submodule_code,
    is_read, read_at
  ) VALUES (
    p_recipient_user_id,
    trim(p_title),
    NULLIF(trim(coalesce(p_message, '')), ''),
    coalesce(p_type, 'system'),
    coalesce(p_priority, 'normal'),
    p_entity_type,
    p_entity_id,
    p_action_url,
    p_created_by,
    p_submodule_code,
    false,
    NULL
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_user_notification(
  uuid, text, text, text, text, text, uuid, text, uuid, text
) TO authenticated;

-- Résolution renforcée (prenom + nom profil)
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
      AND (
        public.normalize_person_name(p.nom) IN (
          public.normalize_person_name(concat_ws(' ', v_emp_first, v_emp_last)),
          public.normalize_person_name(concat_ws(' ', v_emp_last, v_emp_first)),
          public.normalize_person_name(v_emp_last),
          public.normalize_person_name(v_emp_first)
        )
        OR public.normalize_person_name(concat_ws(' ', p.prenom, p.nom)) IN (
          public.normalize_person_name(concat_ws(' ', v_emp_first, v_emp_last)),
          public.normalize_person_name(concat_ws(' ', v_emp_last, v_emp_first))
        )
        OR public.normalize_person_name(concat_ws(' ', p.nom, p.prenom)) IN (
          public.normalize_person_name(concat_ws(' ', v_emp_first, v_emp_last)),
          public.normalize_person_name(concat_ws(' ', v_emp_last, v_emp_first))
        )
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
    WHERE public.profile_is_active(statut)
      AND (
        public.normalize_person_name(nom) = v_norm
        OR public.normalize_person_name(concat_ws(' ', prenom, nom)) = v_norm
        OR public.normalize_person_name(concat_ws(' ', nom, prenom)) = v_norm
      )
    LIMIT 1;
    IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_notification_recipient(uuid, uuid, text, text) TO authenticated;

-- Lier profils restants (email local-part, prenom+nom)
UPDATE public.profiles p
SET employee_id = e.id, updated_at = now()
FROM public.employees e
WHERE p.employee_id IS NULL
  AND split_part(lower(trim(p.email)), '@', 1) = split_part(lower(trim(e.email)), '@', 1)
  AND trim(coalesce(e.email, '')) <> '';

UPDATE public.profiles p
SET employee_id = e.id, updated_at = now()
FROM public.employees e
WHERE p.employee_id IS NULL
  AND public.normalize_person_name(concat_ws(' ', p.prenom, p.nom)) IN (
    public.normalize_person_name(concat_ws(' ', e.firstname, e.lastname)),
    public.normalize_person_name(concat_ws(' ', e.lastname, e.firstname))
  );

-- ─── Trigger tâches ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_internal_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_priority text;
  v_entity_type text;
  v_title text;
  v_message text;
BEGIN
  IF coalesce(trim(NEW.responsable), '') = '' AND NEW.responsable_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.responsable IS NOT DISTINCT FROM OLD.responsable
       AND NEW.responsable_employee_id IS NOT DISTINCT FROM OLD.responsable_employee_id THEN
      RETURN NEW;
    END IF;
  END IF;

  v_recipient := public.resolve_notification_recipient(
    NULL, NEW.responsable_employee_id, NULL, NEW.responsable
  );

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  v_priority := CASE
    WHEN NEW.priorite = 'urgente' OR NEW.dg_push THEN 'urgent'
    WHEN NEW.priorite = 'haute' THEN 'high'
    ELSE 'normal'
  END;

  IF TG_OP = 'UPDATE' THEN
    v_entity_type := 'internal_task_assigned';
    v_title := 'Tâche assignée';
  ELSIF NEW.is_dg_task THEN
    v_entity_type := 'internal_task_dg_assign';
    v_title := 'Tâche DG';
  ELSE
    v_entity_type := 'internal_task';
    v_title := 'Nouvelle tâche assignée';
  END IF;

  v_message := format(
    'La tâche « %s » vous a été assignée%s.',
    NEW.titre,
    CASE WHEN NEW.date_echeance IS NOT NULL THEN ' — échéance ' || NEW.date_echeance::text ELSE '' END
  );

  PERFORM public.upsert_user_notification(
    v_recipient,
    v_title,
    v_message,
    'task',
    v_priority,
    v_entity_type,
    NEW.id,
    'module:taches',
    NEW.created_by,
    'taches'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_internal_tasks_notify ON public.internal_tasks;
CREATE TRIGGER trg_internal_tasks_notify
  AFTER INSERT OR UPDATE OF responsable, responsable_employee_id, titre, date_echeance, priorite
  ON public.internal_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_internal_task();

-- ─── Trigger rendez-vous ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_internal_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_entity_type text;
  v_title text;
  v_message text;
BEGIN
  IF coalesce(trim(NEW.responsable), '') = '' AND NEW.responsable_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.responsable IS NOT DISTINCT FROM OLD.responsable
       AND NEW.responsable_employee_id IS NOT DISTINCT FROM OLD.responsable_employee_id
       AND NEW.date_rdv IS NOT DISTINCT FROM OLD.date_rdv
       AND NEW.heure_debut IS NOT DISTINCT FROM OLD.heure_debut
       AND NEW.titre IS NOT DISTINCT FROM OLD.titre THEN
      RETURN NEW;
    END IF;
  END IF;

  v_recipient := public.resolve_notification_recipient(
    NULL, NEW.responsable_employee_id, NULL, NEW.responsable
  );

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_entity_type := 'internal_appointment_updated';
    v_title := 'Rendez-vous modifié';
    v_message := format(
      'Le RDV « %s » a été modifié : %s à %s%s.',
      NEW.titre,
      coalesce(NEW.date_rdv::text, '—'),
      coalesce(left(NEW.heure_debut::text, 5), '—'),
      CASE WHEN coalesce(trim(NEW.lieu), '') <> '' THEN ' — ' || NEW.lieu ELSE '' END
    );
  ELSE
    v_entity_type := 'internal_appointment';
    v_title := 'Nouveau rendez-vous';
    v_message := format(
      'RDV « %s » le %s à %s%s.',
      NEW.titre,
      coalesce(NEW.date_rdv::text, '—'),
      coalesce(left(NEW.heure_debut::text, 5), '—'),
      CASE WHEN coalesce(trim(NEW.lieu), '') <> '' THEN ' — ' || NEW.lieu ELSE '' END
    );
  END IF;

  PERFORM public.upsert_user_notification(
    v_recipient,
    v_title,
    v_message,
    'appointment',
    'high',
    v_entity_type,
    NEW.id,
    'module:rendezvous',
    NULL,
    'rendez-vous'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_internal_appointments_notify ON public.internal_appointments;
CREATE TRIGGER trg_internal_appointments_notify
  AFTER INSERT OR UPDATE OF responsable, responsable_employee_id, titre, date_rdv, heure_debut, lieu
  ON public.internal_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_internal_appointment();

NOTIFY pgrst, 'reload schema';

-- Diagnostic Hiba / employés non liés
SELECT p.id, p.nom, p.prenom, p.email, p.employee_id, p.statut,
       e.firstname, e.lastname,
       public.resolve_notification_recipient(NULL, p.employee_id, p.email, p.nom) AS resolved_self
FROM public.profiles p
LEFT JOIN public.employees e ON e.id = p.employee_id
WHERE lower(coalesce(p.nom, '')) LIKE '%hiba%'
   OR lower(coalesce(p.email, '')) LIKE '%hiba%'
   OR lower(coalesce(e.lastname, '')) = 'barkaoui';

SELECT public.resolve_notification_recipient(
  NULL,
  (SELECT id FROM public.employees WHERE lower(lastname) = 'barkaoui' AND lower(firstname) = 'hiba' LIMIT 1),
  NULL,
  'HIBA BARKAOUI'
) AS hiba_user_id;
