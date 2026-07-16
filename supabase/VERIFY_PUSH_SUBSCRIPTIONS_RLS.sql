-- =============================================================================
-- CITYMO — Vérification schéma + procédure de tests RLS push_subscriptions
-- Lecture / tests contrôlés. Ré-exécutable.
--
-- IMPORTANT :
-- - En SQL Editor (rôle postgres / service), RLS est BYPASSÉ.
-- - Les tests A–C doivent être faits en session "authenticated" (voir section 2)
--   OU via le client Supabase JS avec deux comptes réels.
-- - Remplacer :USER_A_ID et :USER_B_ID par de vrais UUID auth.users (deux comptes).
-- - Nettoyer les lignes de test ensuite (section 4).
-- =============================================================================

-- ─── 1. Vérifications structurelles (OK en SQL Editor) ───────────────────────

SELECT
  to_regclass('public.push_subscriptions') IS NOT NULL AS table_exists,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_subscriptions'::regclass) AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.push_subscriptions'::regclass) AS rls_forced;

SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.push_subscriptions'::regclass
ORDER BY conname;
-- Attendu : push_subscriptions_pkey (p), push_subscriptions_endpoint_key (u),
--           FK vers auth.users

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
ORDER BY indexname;
-- Attendu : idx_push_subscriptions_user_id,
--           idx_push_subscriptions_user_id_active,
--           idx_push_subscriptions_revoked_at,
--           push_subscriptions_endpoint_key / pkey

SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
ORDER BY policyname;
-- Attendu : select/insert/update/delete _own, TO authenticated, auth.uid() = user_id

SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.push_subscriptions'::regclass
  AND NOT tgisinternal;
-- Attendu : push_subscriptions_updated_at

-- Doublon endpoint (contrainte) — exécutable en SQL Editor (bypass RLS)
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users LIMIT 1;
  IF uid IS NULL THEN
    RAISE NOTICE 'SKIP duplicate test: aucun auth.users';
    RETURN;
  END IF;

  DELETE FROM public.push_subscriptions
  WHERE endpoint LIKE 'https://citymo-test.invalid/push/%';

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
  VALUES (uid, 'https://citymo-test.invalid/push/dup', 'p256dh-test', 'auth-test');

  BEGIN
    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
    VALUES (uid, 'https://citymo-test.invalid/push/dup', 'p256dh-test-2', 'auth-test-2');
    RAISE EXCEPTION 'FAIL: duplicate endpoint should have been rejected';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS D: duplicate endpoint rejected';
  END;

  DELETE FROM public.push_subscriptions
  WHERE endpoint LIKE 'https://citymo-test.invalid/push/%';
END $$;

-- ─── 2. Procédure RLS (à exécuter avec JWT utilisateur, PAS en bypass) ───────
--
-- Option recommandée : depuis l’app / un script Node avec deux sessions
-- signInWithPassword (User A et User B), puis :
--
-- A. En tant que A :
--    insert { user_id: A, endpoint: '.../a1', p256dh, auth_key }  → OK
--    select *  → voit seulement ses lignes
--    update is_active / last_used_at sur sa ligne → OK
--    delete sa ligne → OK
--
-- B. En tant que A :
--    insert { user_id: B, ... }  → ERREUR / 0 row (WITH CHECK)
--    select où user_id = B → vide
--    update / delete ligne de B → 0 row
--
-- C. anon (pas de session) :
--    select / insert / update / delete → refusés
--
-- Simulation SQL Editor (si supportée sur votre projet) :
--
--   -- Remplacer les UUID :
--   -- USER_A = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
--   -- USER_B = 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
--
--   BEGIN;
--   SELECT set_config('request.jwt.claim.sub', 'USER_A', true);
--   SELECT set_config('request.jwt.claim.role', 'authenticated', true);
--   SET LOCAL ROLE authenticated;
--
--   INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
--   VALUES ('USER_A', 'https://citymo-test.invalid/push/a', 'k', 'a');  -- OK
--
--   INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
--   VALUES ('USER_B', 'https://citymo-test.invalid/push/b-steal', 'k', 'a');  -- FAIL
--
--   SELECT count(*) FROM public.push_subscriptions WHERE user_id = 'USER_B'; -- 0
--
--   ROLLBACK;
--
-- E. ON DELETE CASCADE :
--   (NE PAS tester sur un vrai compte prod)
--   Créer un user test, insert abonnement, delete auth.users → abonnement disparu.

-- ─── 3. Checklist manuelle ───────────────────────────────────────────────────
-- [ ] A insert/select/update/delete own OK
-- [ ] B cross-user insert/select/update/delete bloqués
-- [ ] C anon aucun accès
-- [ ] D unique endpoint
-- [ ] E cascade delete user → subscriptions

-- ─── 4. Nettoyage lignes de test ─────────────────────────────────────────────
-- DELETE FROM public.push_subscriptions WHERE endpoint LIKE 'https://citymo-test.invalid/%';
