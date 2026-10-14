-- =============================================================================
-- RUN_RLS_PERF_ERP_CAN.sql — Accélère toutes les lectures ERP (RLS)
--
-- Problème : les policies appellent erp_can('action','module') directement.
-- Postgres réévalue alors la fonction POUR CHAQUE LIGNE (1000 lignes = 1000
-- vérifications de droits). Mesure : feuille de caisse 349 ms → 1 ms.
--
-- Correction : erp_can(...) devient (SELECT erp_can(...)) → évalué UNE fois
-- par requête. Mêmes droits, mêmes rôles, mêmes noms de policies.
-- Aucune donnée n'est modifiée. Sauvegarde dans public._rls_policy_backup_20261014.
--
-- Retour arrière possible : voir le bloc ROLLBACK en bas du fichier.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public._rls_policy_backup_20261014 (
  schemaname text,
  tablename  text,
  policyname text,
  cmd        text,
  qual       text,
  with_check text,
  saved_at   timestamptz DEFAULT now(),
  PRIMARY KEY (schemaname, tablename, policyname)
);

ALTER TABLE public._rls_policy_backup_20261014 ENABLE ROW LEVEL SECURITY;

INSERT INTO public._rls_policy_backup_20261014 (schemaname, tablename, policyname, cmd, qual, with_check)
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'erp_can\('
ON CONFLICT (schemaname, tablename, policyname) DO NOTHING;

DO $$
DECLARE
  r record;
  pat constant text := '(?<!SELECT )(?<![A-Za-z0-9_.])(erp_can\(''[^'']*''::text, ''[^'']*''::text\))';
  new_qual text;
  new_check text;
  stmt text;
  changed int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'erp_can\('
  LOOP
    new_qual  := CASE WHEN r.qual IS NULL THEN NULL
                      ELSE regexp_replace(r.qual, pat, '(SELECT \1)', 'g') END;
    new_check := CASE WHEN r.with_check IS NULL THEN NULL
                      ELSE regexp_replace(r.with_check, pat, '(SELECT \1)', 'g') END;

    IF new_qual IS NOT DISTINCT FROM r.qual AND new_check IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE;
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    changed := changed + 1;
  END LOOP;

  RAISE NOTICE 'Policies accélérées : %', changed;
END $$;

SELECT
  count(*) FILTER (WHERE (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(?<!SELECT )erp_can\(') AS restant_non_optimise,
  count(*) FILTER (WHERE (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'SELECT erp_can\(') AS optimise,
  'RLS erp_can OK' AS statut
FROM pg_policies
WHERE schemaname = 'public';

-- =============================================================================
-- ROLLBACK (à exécuter seulement en cas de besoin) :
--
-- DO $$
-- DECLARE b record; stmt text;
-- BEGIN
--   FOR b IN SELECT * FROM public._rls_policy_backup_20261014 LOOP
--     stmt := format('ALTER POLICY %I ON %I.%I', b.policyname, b.schemaname, b.tablename);
--     IF b.qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)', b.qual); END IF;
--     IF b.with_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', b.with_check); END IF;
--     EXECUTE stmt;
--   END LOOP;
-- END $$;
-- =============================================================================
