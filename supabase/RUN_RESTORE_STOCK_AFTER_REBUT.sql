-- =============================================================================
-- CITYMO — Restauration des quantités après « Mise au rebut »
-- À coller dans Supabase → SQL Editor → Run
--
-- Prérequis : les mouvements type_mouvement = 'Rebut' existent encore dans
--             public.stock_movements (sinon restauration exacte impossible).
--
-- Effet (idempotent) :
--   • Ne touche PAS à stock_articles (le catalogue reste intact)
--   • Pour chaque Rebut non encore restauré :
--       - recrée / crédite stock_levels à payload.emplacement_source
--       - insère un mouvement compensatoire type Entree avec
--         payload.source = 'restore_after_rebut'
--         payload.restore_rebut_id = <id du Rebut>
--   • Relancer le script ne restaure PAS deux fois le même Rebut
--
-- Périmètre par défaut : Rebuts créés AUJOURD’HUI (Europe/Casablanca).
-- Pour TOUS les Rebuts non restaurés : voir commentaire dans rebuts_cibles.
-- =============================================================================

-- 0) Diagnostic rapide (lecture seule)
SELECT
  (SELECT COUNT(*)::int FROM public.stock_articles) AS articles_catalogue,
  (SELECT COUNT(*)::int FROM public.stock_levels) AS lignes_levels,
  (SELECT COALESCE(SUM(quantite), 0)::numeric FROM public.stock_levels) AS total_qty_levels,
  (SELECT COUNT(*)::int FROM public.stock_movements WHERE type_mouvement = 'Rebut') AS nb_rebuts,
  (SELECT COUNT(*)::int
     FROM public.stock_movements
    WHERE type_mouvement = 'Entree'
      AND coalesce(payload->>'source', '') = 'restore_after_rebut') AS nb_restores_deja_faits;

-- 1) Aperçu des Rebuts candidats (avant écriture)
WITH already AS (
  SELECT DISTINCT nullif(trim(payload->>'restore_rebut_id'), '') AS rebut_id
  FROM public.stock_movements
  WHERE type_mouvement = 'Entree'
    AND coalesce(payload->>'source', '') = 'restore_after_rebut'
    AND nullif(trim(payload->>'restore_rebut_id'), '') IS NOT NULL
)
SELECT
  m.id,
  m.ref_mouvement,
  m.article_id,
  a.reference,
  a.nom,
  m.quantite,
  m.motif,
  m.date_mouvement,
  m.created_at,
  nullif(trim(coalesce(m.payload->>'emplacement_source', '')), '') AS emplacement_source,
  (al.rebut_id IS NOT NULL) AS deja_restaure
FROM public.stock_movements m
LEFT JOIN public.stock_articles a ON a.id = m.article_id
LEFT JOIN already al ON al.rebut_id = m.id::text
WHERE m.type_mouvement = 'Rebut'
  AND coalesce(m.quantite, 0) > 0
  AND (
    -- Défaut : aujourd’hui (timezone Maroc). Remplacer par TRUE pour tout restaurer.
    (m.created_at AT TIME ZONE 'Africa/Casablanca')::date
      = (now() AT TIME ZONE 'Africa/Casablanca')::date
    OR m.date_mouvement = (now() AT TIME ZONE 'Africa/Casablanca')::date
  )
ORDER BY m.created_at DESC;

-- 2) Restauration idempotente
DO $restore$
DECLARE
  r RECORD;
  v_emp TEXT;
  v_qty NUMERIC(14,3);
  v_level_id UUID;
  v_ref TEXT;
  v_restored INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR r IN
    WITH already AS (
      SELECT DISTINCT nullif(trim(payload->>'restore_rebut_id'), '') AS rebut_id
      FROM public.stock_movements
      WHERE type_mouvement = 'Entree'
        AND coalesce(payload->>'source', '') = 'restore_after_rebut'
        AND nullif(trim(payload->>'restore_rebut_id'), '') IS NOT NULL
    ),
    rebuts_cibles AS (
      SELECT m.*
      FROM public.stock_movements m
      WHERE m.type_mouvement = 'Rebut'
        AND coalesce(m.quantite, 0) > 0
        AND m.article_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM already a WHERE a.rebut_id = m.id::text)
        AND (
          -- >>> PÉRIMÈTRE <<<
          -- Aujourd’hui uniquement (Africa/Casablanca). Pour TOUS les Rebuts
          -- non restaurés : remplacer le bloc ci-dessous par : TRUE
          (m.created_at AT TIME ZONE 'Africa/Casablanca')::date
            = (now() AT TIME ZONE 'Africa/Casablanca')::date
          OR m.date_mouvement = (now() AT TIME ZONE 'Africa/Casablanca')::date
        )
    )
    SELECT * FROM rebuts_cibles
    ORDER BY created_at ASC
  LOOP
    v_emp := nullif(trim(coalesce(r.payload->>'emplacement_source', '')), '');
    IF v_emp IS NULL THEN
      -- Fallback : emplacement article, sinon dépôt par défaut
      SELECT nullif(trim(coalesce(a.emplacement, '')), '')
        INTO v_emp
      FROM public.stock_articles a
      WHERE a.id = r.article_id;
      v_emp := coalesce(v_emp, 'DEPOT LAKHYAYTA');
    END IF;

    v_qty := round(coalesce(r.quantite, 0)::numeric, 3);
    IF v_qty <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Crédit stock_levels à l’emplacement débité
    SELECT l.id
      INTO v_level_id
    FROM public.stock_levels l
    WHERE l.article_id = r.article_id
      AND lower(trim(coalesce(l.emplacement, ''))) = lower(trim(v_emp))
    ORDER BY l.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_level_id IS NOT NULL THEN
      UPDATE public.stock_levels
      SET quantite = coalesce(quantite, 0) + v_qty,
          updated_at = now()
      WHERE id = v_level_id;
    ELSE
      INSERT INTO public.stock_levels (
        article_id, warehouse_id, project_id, emplacement, quantite
      ) VALUES (
        r.article_id, NULL, NULL, v_emp, v_qty
      );
    END IF;

    -- Mouvement compensatoire Entrée (audit + idempotence)
    v_ref := 'RESTORE-REBUT-' || substr(replace(r.id::text, '-', ''), 1, 12);

    INSERT INTO public.stock_movements (
      ref_mouvement,
      type_mouvement,
      article_id,
      warehouse_id,
      quantite,
      date_mouvement,
      motif,
      payload,
      created_by
    ) VALUES (
      v_ref,
      'Entree',
      r.article_id,
      r.warehouse_id,
      v_qty,
      coalesce(r.date_mouvement, (now() AT TIME ZONE 'Africa/Casablanca')::date),
      'Restauration après Mise au rebut',
      jsonb_build_object(
        'emplacement_source', '',
        'emplacement_destination', v_emp,
        'statut', 'Validé',
        'applied', true,
        'source', 'restore_after_rebut',
        'restore_rebut_id', r.id::text,
        'restore_rebut_ref', coalesce(r.ref_mouvement, ''),
        'note', 'Compensation automatique — ne pas supprimer si traçabilité requise'
      ),
      r.created_by
    );

    v_restored := v_restored + 1;
  END LOOP;

  RAISE NOTICE 'Restauration Rebut terminée : % mouvement(s) compensés, % ignoré(s).',
    v_restored, v_skipped;
END
$restore$;

-- 3) Vérification après restauration
SELECT
  (SELECT COUNT(*)::int FROM public.stock_articles) AS articles_catalogue,
  (SELECT COALESCE(SUM(quantite), 0)::numeric FROM public.stock_levels) AS total_qty_levels,
  (SELECT COUNT(*)::int FROM public.stock_levels WHERE quantite > 0) AS lignes_avec_stock,
  (SELECT COUNT(*)::int
     FROM public.stock_movements
    WHERE type_mouvement = 'Entree'
      AND coalesce(payload->>'source', '') = 'restore_after_rebut') AS nb_restores;

-- Détail des restaurations
SELECT
  m.id,
  m.ref_mouvement,
  m.article_id,
  a.reference,
  a.nom,
  m.quantite,
  m.payload->>'emplacement_destination' AS emplacement_restaure,
  m.payload->>'restore_rebut_id' AS rebut_id_source,
  m.created_at
FROM public.stock_movements m
LEFT JOIN public.stock_articles a ON a.id = m.article_id
WHERE m.type_mouvement = 'Entree'
  AND coalesce(m.payload->>'source', '') = 'restore_after_rebut'
ORDER BY m.created_at DESC
LIMIT 200;

NOTIFY pgrst, 'reload schema';
