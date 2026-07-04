-- =============================================================================
-- CITYMO — Diagnostic + correction email de connexion (auth.users)
-- Exécuter dans Supabase SQL Editor.
-- La connexion utilise auth.users.email, PAS employees.email seul.
-- =============================================================================

-- 1) Employé RH
SELECT 'employé RH' AS bloc, e.id, e.firstname, e.lastname, e.email
FROM public.employees e
WHERE e.lastname ILIKE '%mekssi%'
   OR e.firstname ILIKE '%mohammed%'
   OR e.email ILIKE '%mekssi%'
   OR e.email ILIKE '%bl93598%';

-- 2) Profil ERP
SELECT 'profil ERP' AS bloc, p.id, p.email, p.statut, p.employee_id
FROM public.profiles p
WHERE p.email ILIKE '%mekssi%'
   OR p.email ILIKE '%bl93598%'
   OR p.employee_id IN (
     SELECT id FROM public.employees
     WHERE lastname ILIKE '%mekssi%' OR email ILIKE '%mekssi%' OR email ILIKE '%bl93598%'
   );

-- 3) Compte Auth (utilisé pour SE CONNECTER)
SELECT
  'auth connexion' AS bloc,
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL AS email_confirme,
  u.created_at
FROM auth.users u
WHERE u.email ILIKE '%mekssi%'
   OR u.email ILIKE '%bl93598%';

-- =============================================================================
-- CORRECTION (remplacer :user_id par l'id trouvé à l'étape 3, ou créer le compte)
-- =============================================================================
-- Si une ligne existe à l'étape 3 avec un ancien email (ex. bl93598@employes.citymo.local) :

-- UPDATE auth.users
-- SET
--   email = 'm.mekssi@citymo.ma',
--   email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
--   updated_at = NOW()
-- WHERE id = ':user_id';

-- UPDATE public.profiles
-- SET email = 'm.mekssi@citymo.ma', updated_at = NOW()
-- WHERE id = ':user_id';

-- Mot de passe : Supabase Dashboard → Authentication → Users → utilisateur
-- → « Send password recovery » OU définir via Administration ERP (après déploiement sync email).

-- Si AUCUNE ligne à l'étape 3 : le compte n'existe pas → Administration → Utilisateurs
-- → Ajouter utilisateur → lier l'employé MEKSSI → définir mot de passe.
