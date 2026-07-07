-- =============================================================================
-- CITYMO — Audit notifications : employés RH sans compte ERP lié
-- Supabase → SQL Editor → Run (lecture seule, ré-exécutable)
-- =============================================================================

-- ─── 1. Employés RH SANS compte ERP ───────────────────────────────────────────
SELECT
  e.id AS employee_id,
  trim(concat_ws(' ', e.firstname, e.lastname)) AS nom_complet,
  e.email AS email_rh,
  e.poste,
  e.department,
  e.statut AS statut_rh,
  'Créer compte dans Administration → Utilisateurs' AS action
FROM public.employees e
WHERE lower(coalesce(e.statut, 'actif')) <> 'inactif'
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.employee_id = e.id
      AND public.profile_is_active(p.statut)
  )
ORDER BY e.lastname, e.firstname;

-- ─── 2. Profils ERP SANS fiche employé liée ─────────────────────────────────
SELECT
  p.id AS user_id,
  p.nom,
  p.prenom,
  p.email,
  p.role,
  p.statut,
  'Lier à un employé RH dans Administration → Utilisateurs' AS action
FROM public.profiles p
WHERE p.employee_id IS NULL
  AND public.profile_is_active(p.statut)
  AND lower(coalesce(p.role, '')) NOT IN (
    'super_admin', 'super admin', 'dg', 'directeur_general', 'directeur general'
  )
  AND lower(coalesce(p.email, '')) NOT IN (
    'selim.moumni@gmail.com', 'selim@citymo.ma', 'admin@citymo.ma'
  )
ORDER BY p.nom;

-- ─── 3. Synthèse ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.employees
   WHERE lower(coalesce(statut, 'actif')) <> 'inactif') AS employes_actifs,
  (SELECT count(*) FROM public.profiles
   WHERE public.profile_is_active(statut)) AS comptes_erp_actifs,
  (SELECT count(*) FROM public.profiles p
   WHERE p.employee_id IS NOT NULL AND public.profile_is_active(p.statut)) AS comptes_lies,
  (SELECT count(*) FROM public.employees e
   WHERE lower(coalesce(e.statut, 'actif')) <> 'inactif'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.employee_id = e.id AND public.profile_is_active(p.statut)
     )) AS employes_sans_compte,
  (SELECT count(*) FROM public.profiles p
   WHERE p.employee_id IS NULL AND public.profile_is_active(p.statut)
     AND lower(coalesce(p.role, '')) NOT IN ('super_admin', 'super admin', 'dg')
  ) AS comptes_sans_employe;

-- ─── 4. OK : employés correctement liés (reçoivent les notifs) ─────────────
SELECT
  trim(concat_ws(' ', e.firstname, e.lastname)) AS nom_complet,
  p.email AS email_connexion,
  p.statut,
  public.resolve_notification_recipient(p.id, p.employee_id, p.email, NULL) AS user_id_notif
FROM public.profiles p
JOIN public.employees e ON e.id = p.employee_id
WHERE public.profile_is_active(p.statut)
  AND lower(coalesce(e.statut, 'actif')) <> 'inactif'
ORDER BY e.lastname, e.firstname;
