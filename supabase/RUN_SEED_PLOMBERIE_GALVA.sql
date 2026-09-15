-- =============================================================================
-- CITYMO — Seed articles PLOMBERIE (Consommable) — TOUT EN UN
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent : ré-exécutable sans doublons ni écrasement de quantités existantes
--
-- Contenu :
--   • Galvanisé (manchon, réductions, bouchons, rallonge, té, union)
--   • Mamelon / coude cuivre
--   • Raccords cuivre & accessoires (bouchons, réductions, robinets…)
--
-- Prérequis (si pas déjà faits) :
--   RUN_STOCK_CATEGORIES.sql
--   RUN_STOCK_WAREHOUSES.sql
--   RUN_STOCK_ARTICLES_LEVELS.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 0) Emplacement dépôt (si manquant) ───────────────────────────────────────
INSERT INTO public.stock_warehouses (nom, type_depot, statut)
SELECT 'DEPOT LAKHYAYTA', 'Dépôt', 'Actif'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_warehouses w
  WHERE lower(trim(w.nom)) = 'depot lakhyayta'
);

-- ── 1) Catégorie PLOMBERIE ───────────────────────────────────────────────────
INSERT INTO public.stock_categories (
  legacy_id, code, name, nom, description, department, stock_type, is_active, statut
)
SELECT
  COALESCE((SELECT MAX(legacy_id) FROM public.stock_categories), 0) + 1,
  'PLOMBERIE',
  'PLOMBERIE',
  'PLOMBERIE',
  'Raccords et pièces plomberie',
  'LOGISTIQUE',
  'OUTILLAGE',
  TRUE,
  'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_categories c
  WHERE lower(trim(coalesce(c.code, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.name, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.nom, '')))  = 'plomberie'
);

-- ── 2) Articles + qty (désignations UPPERCASE) ───────────────────────────────
WITH seed(nom, qty) AS (
  VALUES
    -- Galvanisé / général
    ('MANCHON MÂLE GALVANISÉ 1" 1/2',                    1::numeric),
    ('RÉDUCTION GALVANISÉE 1" 1/2 x 1"',                  1::numeric),
    ('RALLONGE CONIQUE GALVANISÉE 1" 1/2',               1::numeric),
    ('TÉ GALVANISÉ 1/2" x 1/2" x 1/2"',                  1::numeric),
    ('UNION GALVANISÉE 16 x 16 mm',                      1::numeric),
    ('RÉDUCTION GALVANISÉE 1" 1/2 x 1" 1/4',             1::numeric),
    ('MAMELON MÂLE 1/2"',                                3::numeric),
    ('COUDE MÂLE/FEMELLE EN CUIVRE 1/2"',                1::numeric),
    -- Raccords en cuivre et accessoires
    ('BOUCHON EN CUIVRE 3/4"',                           5::numeric),
    ('BOUCHON GALVANISÉ 1"',                            19::numeric),
    ('BOUCHON GALVANISÉ 1/2"',                          18::numeric),
    ('BOUCHON GALVANISÉ 3/4"',                           1::numeric),
    ('RÉDUCTION EN CUIVRE 1/2" x 3/4"',                   1::numeric),
    ('MAMELON MÂLE/FEMELLE 1/2" x 1/8"',                 2::numeric),
    ('ROBINET D''ÉQUERRE 1/2" x 3/8"',                   5::numeric),
    ('ROBINET D''ÉQUERRE 1/2" x 1/2"',                   1::numeric),
    ('BOUCHON FEMELLE 1/2"',                             1::numeric)
),
cat AS (
  SELECT c.id
  FROM public.stock_categories c
  WHERE lower(trim(coalesce(c.code, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.name, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.nom, '')))  = 'plomberie'
  ORDER BY c.created_at NULLS LAST
  LIMIT 1
),
max_ref AS (
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(a.reference, '^ART-2026-', ''), '')::int
  ), 0) AS n
  FROM public.stock_articles a
  WHERE a.reference ~ '^ART-2026-[0-9]+$'
),
to_insert AS (
  SELECT
    s.nom,
    s.qty,
    row_number() OVER (ORDER BY s.nom) AS rn
  FROM seed s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_articles a
    WHERE lower(trim(a.nom)) = lower(trim(s.nom))
  )
),
ins AS (
  INSERT INTO public.stock_articles (
    reference, nom, categorie, category_id, article_type,
    unite, prix_unitaire, seuil_alerte, etat, emplacement, statut
  )
  SELECT
    'ART-2026-' || lpad((m.n + t.rn)::text, 4, '0'),
    t.nom,
    'PLOMBERIE',
    (SELECT id FROM cat),
    'Consommable',
    'U',
    0::numeric,
    0::numeric,
    'Neuf',
    'DEPOT LAKHYAYTA',
    'Active'
  FROM to_insert t
  CROSS JOIN max_ref m
  RETURNING id, nom, reference
)
SELECT * FROM ins;

-- Relier category_id / champs métier
UPDATE public.stock_articles a
SET
  category_id  = COALESCE(a.category_id, c.id),
  categorie    = COALESCE(NULLIF(trim(a.categorie), ''), 'PLOMBERIE'),
  emplacement  = COALESCE(NULLIF(trim(a.emplacement), ''), 'DEPOT LAKHYAYTA'),
  article_type = COALESCE(NULLIF(trim(a.article_type), ''), 'Consommable'),
  unite        = COALESCE(NULLIF(trim(a.unite), ''), 'U'),
  etat         = COALESCE(NULLIF(trim(a.etat), ''), 'Neuf'),
  statut       = COALESCE(NULLIF(trim(a.statut), ''), 'Active'),
  updated_at   = NOW()
FROM public.stock_categories c
WHERE lower(trim(a.nom)) IN (
  lower('MANCHON MÂLE GALVANISÉ 1" 1/2'),
  lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1"'),
  lower('RALLONGE CONIQUE GALVANISÉE 1" 1/2'),
  lower('TÉ GALVANISÉ 1/2" x 1/2" x 1/2"'),
  lower('UNION GALVANISÉE 16 x 16 mm'),
  lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1" 1/4'),
  lower('MAMELON MÂLE 1/2"'),
  lower('COUDE MÂLE/FEMELLE EN CUIVRE 1/2"'),
  lower('BOUCHON EN CUIVRE 3/4"'),
  lower('BOUCHON GALVANISÉ 1"'),
  lower('BOUCHON GALVANISÉ 1/2"'),
  lower('BOUCHON GALVANISÉ 3/4"'),
  lower('RÉDUCTION EN CUIVRE 1/2" x 3/4"'),
  lower('MAMELON MÂLE/FEMELLE 1/2" x 1/8"'),
  lower('ROBINET D''ÉQUERRE 1/2" x 3/8"'),
  lower('ROBINET D''ÉQUERRE 1/2" x 1/2"'),
  lower('BOUCHON FEMELLE 1/2"')
)
AND (
  lower(trim(coalesce(c.code, ''))) = 'plomberie'
  OR lower(trim(coalesce(c.name, ''))) = 'plomberie'
  OR lower(trim(coalesce(c.nom, ''))) = 'plomberie'
);

DO $bc$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_articles' AND column_name = 'barcode_value'
  ) THEN
    UPDATE public.stock_articles a
    SET barcode_value = a.reference
    WHERE (a.barcode_value IS NULL OR trim(a.barcode_value) = '')
      AND a.reference IS NOT NULL
      AND lower(trim(a.nom)) IN (
        lower('MANCHON MÂLE GALVANISÉ 1" 1/2'),
        lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1"'),
        lower('RALLONGE CONIQUE GALVANISÉE 1" 1/2'),
        lower('TÉ GALVANISÉ 1/2" x 1/2" x 1/2"'),
        lower('UNION GALVANISÉE 16 x 16 mm'),
        lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1" 1/4'),
        lower('MAMELON MÂLE 1/2"'),
        lower('COUDE MÂLE/FEMELLE EN CUIVRE 1/2"'),
        lower('BOUCHON EN CUIVRE 3/4"'),
        lower('BOUCHON GALVANISÉ 1"'),
        lower('BOUCHON GALVANISÉ 1/2"'),
        lower('BOUCHON GALVANISÉ 3/4"'),
        lower('RÉDUCTION EN CUIVRE 1/2" x 3/4"'),
        lower('MAMELON MÂLE/FEMELLE 1/2" x 1/8"'),
        lower('ROBINET D''ÉQUERRE 1/2" x 3/8"'),
        lower('ROBINET D''ÉQUERRE 1/2" x 1/2"'),
        lower('BOUCHON FEMELLE 1/2"')
      );
  END IF;
END $bc$;

-- ── 3) stock_levels DEPOT LAKHYAYTA (insert si absente) ───────────────────────
INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT
  a.id,
  'DEPOT LAKHYAYTA',
  s.qty,
  w.id,
  NULL
FROM (
  VALUES
    ('MANCHON MÂLE GALVANISÉ 1" 1/2',                    1::numeric),
    ('RÉDUCTION GALVANISÉE 1" 1/2 x 1"',                  1::numeric),
    ('RALLONGE CONIQUE GALVANISÉE 1" 1/2',               1::numeric),
    ('TÉ GALVANISÉ 1/2" x 1/2" x 1/2"',                  1::numeric),
    ('UNION GALVANISÉE 16 x 16 mm',                      1::numeric),
    ('RÉDUCTION GALVANISÉE 1" 1/2 x 1" 1/4',             1::numeric),
    ('MAMELON MÂLE 1/2"',                                3::numeric),
    ('COUDE MÂLE/FEMELLE EN CUIVRE 1/2"',                1::numeric),
    ('BOUCHON EN CUIVRE 3/4"',                           5::numeric),
    ('BOUCHON GALVANISÉ 1"',                            19::numeric),
    ('BOUCHON GALVANISÉ 1/2"',                          18::numeric),
    ('BOUCHON GALVANISÉ 3/4"',                           1::numeric),
    ('RÉDUCTION EN CUIVRE 1/2" x 3/4"',                   1::numeric),
    ('MAMELON MÂLE/FEMELLE 1/2" x 1/8"',                 2::numeric),
    ('ROBINET D''ÉQUERRE 1/2" x 3/8"',                   5::numeric),
    ('ROBINET D''ÉQUERRE 1/2" x 1/2"',                   1::numeric),
    ('BOUCHON FEMELLE 1/2"',                             1::numeric)
) AS s(nom, qty)
JOIN public.stock_articles a
  ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w
  ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_levels l
  WHERE l.article_id = a.id
    AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
);

-- Si BOUCHON GALVANISÉ 1" existait déjà avec qty 2 (ancien seed), aligner à 19
UPDATE public.stock_levels l
SET quantite = 19, updated_at = NOW()
FROM public.stock_articles a
WHERE l.article_id = a.id
  AND lower(trim(a.nom)) = lower('BOUCHON GALVANISÉ 1"')
  AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
  AND COALESCE(l.quantite, 0) < 19;

-- ── 4) Mouvements Entrée initiaux ────────────────────────────────────────────
INSERT INTO public.stock_movements (
  ref_mouvement, type_mouvement, article_id, warehouse_id,
  quantite, date_mouvement, motif, payload
)
SELECT
  'BM-SEED-PLOMB-' || upper(substr(replace(a.id::text, '-', ''), 1, 10)),
  'Entree',
  a.id,
  w.id,
  s.qty,
  CURRENT_DATE,
  'Création de l''article',
  jsonb_build_object(
    'statut', 'Validé',
    'applied', true,
    'origine', 'Stock initial',
    'source', 'seed_plomberie_consommable',
    'action_label', 'Entrée de stock — Stock initial',
    'emplacement_destination', 'DEPOT LAKHYAYTA',
    'article_code', a.reference,
    'article_designation', a.nom,
    'ligne_index', 0
  )
FROM (
  VALUES
    ('MANCHON MÂLE GALVANISÉ 1" 1/2',                    1::numeric),
    ('RÉDUCTION GALVANISÉE 1" 1/2 x 1"',                  1::numeric),
    ('RALLONGE CONIQUE GALVANISÉE 1" 1/2',               1::numeric),
    ('TÉ GALVANISÉ 1/2" x 1/2" x 1/2"',                  1::numeric),
    ('UNION GALVANISÉE 16 x 16 mm',                      1::numeric),
    ('RÉDUCTION GALVANISÉE 1" 1/2 x 1" 1/4',             1::numeric),
    ('MAMELON MÂLE 1/2"',                                3::numeric),
    ('COUDE MÂLE/FEMELLE EN CUIVRE 1/2"',                1::numeric),
    ('BOUCHON EN CUIVRE 3/4"',                           5::numeric),
    ('BOUCHON GALVANISÉ 1"',                            19::numeric),
    ('BOUCHON GALVANISÉ 1/2"',                          18::numeric),
    ('BOUCHON GALVANISÉ 3/4"',                           1::numeric),
    ('RÉDUCTION EN CUIVRE 1/2" x 3/4"',                   1::numeric),
    ('MAMELON MÂLE/FEMELLE 1/2" x 1/8"',                 2::numeric),
    ('ROBINET D''ÉQUERRE 1/2" x 3/8"',                   5::numeric),
    ('ROBINET D''ÉQUERRE 1/2" x 1/2"',                   1::numeric),
    ('BOUCHON FEMELLE 1/2"',                             1::numeric)
) AS s(nom, qty)
JOIN public.stock_articles a
  ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w
  ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.article_id = a.id
    AND (
      coalesce(m.payload->>'source', '') IN ('seed_plomberie_galva', 'seed_plomberie_consommable')
      OR (
        lower(coalesce(m.type_mouvement, '')) IN ('entree', 'entrée')
        AND coalesce(m.motif, '') = 'Création de l''article'
      )
    )
);

-- ── 5) Vérification ──────────────────────────────────────────────────────────
SELECT
  a.reference,
  a.nom,
  a.article_type,
  a.categorie,
  COALESCE(l.quantite, 0) AS qty_depot
FROM public.stock_articles a
LEFT JOIN public.stock_levels l
  ON l.article_id = a.id
 AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
WHERE lower(trim(a.nom)) IN (
  lower('MANCHON MÂLE GALVANISÉ 1" 1/2'),
  lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1"'),
  lower('RALLONGE CONIQUE GALVANISÉE 1" 1/2'),
  lower('TÉ GALVANISÉ 1/2" x 1/2" x 1/2"'),
  lower('UNION GALVANISÉE 16 x 16 mm'),
  lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1" 1/4'),
  lower('MAMELON MÂLE 1/2"'),
  lower('COUDE MÂLE/FEMELLE EN CUIVRE 1/2"'),
  lower('BOUCHON EN CUIVRE 3/4"'),
  lower('BOUCHON GALVANISÉ 1"'),
  lower('BOUCHON GALVANISÉ 1/2"'),
  lower('BOUCHON GALVANISÉ 3/4"'),
  lower('RÉDUCTION EN CUIVRE 1/2" x 3/4"'),
  lower('MAMELON MÂLE/FEMELLE 1/2" x 1/8"'),
  lower('ROBINET D''ÉQUERRE 1/2" x 3/8"'),
  lower('ROBINET D''ÉQUERRE 1/2" x 1/2"'),
  lower('BOUCHON FEMELLE 1/2"')
)
ORDER BY a.nom;

SELECT COUNT(*)::int AS articles_plomberie_seed
FROM public.stock_articles a
WHERE lower(trim(a.nom)) IN (
  lower('MANCHON MÂLE GALVANISÉ 1" 1/2'),
  lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1"'),
  lower('RALLONGE CONIQUE GALVANISÉE 1" 1/2'),
  lower('TÉ GALVANISÉ 1/2" x 1/2" x 1/2"'),
  lower('UNION GALVANISÉE 16 x 16 mm'),
  lower('RÉDUCTION GALVANISÉE 1" 1/2 x 1" 1/4'),
  lower('MAMELON MÂLE 1/2"'),
  lower('COUDE MÂLE/FEMELLE EN CUIVRE 1/2"'),
  lower('BOUCHON EN CUIVRE 3/4"'),
  lower('BOUCHON GALVANISÉ 1"'),
  lower('BOUCHON GALVANISÉ 1/2"'),
  lower('BOUCHON GALVANISÉ 3/4"'),
  lower('RÉDUCTION EN CUIVRE 1/2" x 3/4"'),
  lower('MAMELON MÂLE/FEMELLE 1/2" x 1/8"'),
  lower('ROBINET D''ÉQUERRE 1/2" x 3/8"'),
  lower('ROBINET D''ÉQUERRE 1/2" x 1/2"'),
  lower('BOUCHON FEMELLE 1/2"')
);

NOTIFY pgrst, 'reload schema';
