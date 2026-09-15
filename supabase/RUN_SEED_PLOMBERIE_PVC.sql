-- =============================================================================
-- CITYMO — Seed PLOMBERIE Consommable — COMPLÉMENT PVC / PPR
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent. Même catégorie PLOMBERIE / type Consommable que le seed galva.
-- À lancer APRÈS (ou indépendamment de) RUN_SEED_PLOMBERIE_GALVA.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO public.stock_warehouses (nom, type_depot, statut)
SELECT 'DEPOT LAKHYAYTA', 'Dépôt', 'Actif'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_warehouses w
  WHERE lower(trim(w.nom)) = 'depot lakhyayta'
);

INSERT INTO public.stock_categories (
  legacy_id, code, name, nom, description, department, stock_type, is_active, statut
)
SELECT
  COALESCE((SELECT MAX(legacy_id) FROM public.stock_categories), 0) + 1,
  'PLOMBERIE', 'PLOMBERIE', 'PLOMBERIE',
  'Raccords et pièces plomberie',
  'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_categories c
  WHERE lower(trim(coalesce(c.code, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.name, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.nom, '')))  = 'plomberie'
);

-- Doublons d’inventaire fusionnés (même désignation+taille → somme des qté)
WITH seed(nom, qty) AS (
  VALUES
    ('MANCHON BITUBE MÂLE/FEMELLE 100',     1::numeric),
    ('BOUCHON PVC 40',                      4::numeric),
    ('BOUCHON PVC 50',                      6::numeric),
    ('BOUCHON PVC 75',                      2::numeric),
    ('BOUCHON PVC 100',                     6::numeric),  -- 1+5
    ('BOUCHON PVC 110',                     4::numeric),  -- 1+3
    ('COUDE PVC 32 x 45°',                 43::numeric),
    ('COUDE PVC 32 x 90°',                 16::numeric),
    ('COUDE PVC 40 x 90°',                  3::numeric),
    ('COUDE PVC 50 x 45°',                 16::numeric),
    ('COUDE PVC 50 x 90°',                  8::numeric),
    ('COUDE PVC 75 x 45°',                 18::numeric),
    ('COUDE PVC 75 x 90°',                  2::numeric),
    ('COUDE PVC 100 x 45°',                25::numeric),
    ('COUDE PVC 100 x 90°',                13::numeric),
    ('COUDE PVC 110 x 45°',                16::numeric), -- 1+15
    ('COUDE PVC 110 x 90°',                 2::numeric),
    ('COUDE PVC 125 x 45°',                 1::numeric),
    ('TÉ PVC 32',                           2::numeric),
    ('TÉ PVC 40',                           3::numeric),
    ('TÉ PVC 50',                           1::numeric),
    ('CULOTTE PVC SIMPLE 32',               3::numeric),
    ('CULOTTE PVC SIMPLE 40',               1::numeric),
    ('CULOTTE PVC SIMPLE 50',              12::numeric),
    ('CULOTTE PVC 100',                     6::numeric),
    ('CULOTTE PVC 110',                     2::numeric),
    ('CULOTTE PVC 125',                     4::numeric),
    ('CULOTTE DOUBLE PVC 100',              2::numeric),
    ('RÉDUCTION PVC 40 x 32',                4::numeric),
    ('RÉDUCTION PVC 50 x 40',                5::numeric),
    ('RÉDUCTION PVC 100 x 50',               4::numeric),
    ('RÉDUCTION PVC 100 x 50 x 40',          3::numeric),
    ('RÉDUCTION PVC 100 x 75',               1::numeric),
    ('RÉDUCTION PVC 110 x 40',               4::numeric),
    ('RÉDUCTION PVC 110 x 40 x 32',          1::numeric),
    ('RÉDUCTION PVC 110 x 40 x 40 x 40',     3::numeric),
    ('RÉDUCTION PVC 110 x 50',              10::numeric),
    ('RÉDUCTION PVC 110 x 50 x 40',          1::numeric),
    ('RÉDUCTION PVC 110 x 75',               4::numeric),
    ('RÉDUCTION PVC 110 x 100',              8::numeric),
    ('RÉDUCTION PVC 125 x 50',               2::numeric),
    ('RÉDUCTION PVC 125 x 100',              1::numeric),
    ('RÉDUCTION PVC 160 x 110',              1::numeric),
    ('CHAPEAU DE GENDARME PPR 20',         11::numeric)
),
cat AS (
  SELECT c.id FROM public.stock_categories c
  WHERE lower(trim(coalesce(c.code, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.name, ''))) = 'plomberie'
     OR lower(trim(coalesce(c.nom, '')))  = 'plomberie'
  ORDER BY c.created_at NULLS LAST LIMIT 1
),
max_ref AS (
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(a.reference, '^ART-2026-', ''), '')::int
  ), 0) AS n
  FROM public.stock_articles a
  WHERE a.reference ~ '^ART-2026-[0-9]+$'
),
to_insert AS (
  SELECT s.nom, s.qty, row_number() OVER (ORDER BY s.nom) AS rn
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
    t.nom, 'PLOMBERIE', (SELECT id FROM cat), 'Consommable',
    'U', 0::numeric, 0::numeric, 'Neuf', 'DEPOT LAKHYAYTA', 'Active'
  FROM to_insert t CROSS JOIN max_ref m
  RETURNING id, nom, reference
)
SELECT * FROM ins;

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
FROM public.stock_categories c, (
  VALUES
    ('MANCHON BITUBE MÂLE/FEMELLE 100'),
    ('BOUCHON PVC 40'), ('BOUCHON PVC 50'), ('BOUCHON PVC 75'),
    ('BOUCHON PVC 100'), ('BOUCHON PVC 110'),
    ('COUDE PVC 32 x 45°'), ('COUDE PVC 32 x 90°'),
    ('COUDE PVC 40 x 90°'),
    ('COUDE PVC 50 x 45°'), ('COUDE PVC 50 x 90°'),
    ('COUDE PVC 75 x 45°'), ('COUDE PVC 75 x 90°'),
    ('COUDE PVC 100 x 45°'), ('COUDE PVC 100 x 90°'),
    ('COUDE PVC 110 x 45°'), ('COUDE PVC 110 x 90°'),
    ('COUDE PVC 125 x 45°'),
    ('TÉ PVC 32'), ('TÉ PVC 40'), ('TÉ PVC 50'),
    ('CULOTTE PVC SIMPLE 32'), ('CULOTTE PVC SIMPLE 40'), ('CULOTTE PVC SIMPLE 50'),
    ('CULOTTE PVC 100'), ('CULOTTE PVC 110'), ('CULOTTE PVC 125'),
    ('CULOTTE DOUBLE PVC 100'),
    ('RÉDUCTION PVC 40 x 32'), ('RÉDUCTION PVC 50 x 40'),
    ('RÉDUCTION PVC 100 x 50'), ('RÉDUCTION PVC 100 x 50 x 40'), ('RÉDUCTION PVC 100 x 75'),
    ('RÉDUCTION PVC 110 x 40'), ('RÉDUCTION PVC 110 x 40 x 32'),
    ('RÉDUCTION PVC 110 x 40 x 40 x 40'), ('RÉDUCTION PVC 110 x 50'),
    ('RÉDUCTION PVC 110 x 50 x 40'), ('RÉDUCTION PVC 110 x 75'), ('RÉDUCTION PVC 110 x 100'),
    ('RÉDUCTION PVC 125 x 50'), ('RÉDUCTION PVC 125 x 100'), ('RÉDUCTION PVC 160 x 110'),
    ('CHAPEAU DE GENDARME PPR 20')
) AS s(nom)
WHERE lower(trim(a.nom)) = lower(trim(s.nom))
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
      AND a.categorie = 'PLOMBERIE'
      AND a.article_type = 'Consommable'
      AND a.nom ILIKE '%PVC%' OR a.nom ILIKE '%PPR%' OR a.nom ILIKE '%BITUBE%';
  END IF;
END $bc$;

INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT a.id, 'DEPOT LAKHYAYTA', s.qty, w.id, NULL
FROM (
  VALUES
    ('MANCHON BITUBE MÂLE/FEMELLE 100',     1::numeric),
    ('BOUCHON PVC 40',                      4::numeric),
    ('BOUCHON PVC 50',                      6::numeric),
    ('BOUCHON PVC 75',                      2::numeric),
    ('BOUCHON PVC 100',                     6::numeric),
    ('BOUCHON PVC 110',                     4::numeric),
    ('COUDE PVC 32 x 45°',                 43::numeric),
    ('COUDE PVC 32 x 90°',                 16::numeric),
    ('COUDE PVC 40 x 90°',                  3::numeric),
    ('COUDE PVC 50 x 45°',                 16::numeric),
    ('COUDE PVC 50 x 90°',                  8::numeric),
    ('COUDE PVC 75 x 45°',                 18::numeric),
    ('COUDE PVC 75 x 90°',                  2::numeric),
    ('COUDE PVC 100 x 45°',                25::numeric),
    ('COUDE PVC 100 x 90°',                13::numeric),
    ('COUDE PVC 110 x 45°',                16::numeric),
    ('COUDE PVC 110 x 90°',                 2::numeric),
    ('COUDE PVC 125 x 45°',                 1::numeric),
    ('TÉ PVC 32',                           2::numeric),
    ('TÉ PVC 40',                           3::numeric),
    ('TÉ PVC 50',                           1::numeric),
    ('CULOTTE PVC SIMPLE 32',               3::numeric),
    ('CULOTTE PVC SIMPLE 40',               1::numeric),
    ('CULOTTE PVC SIMPLE 50',              12::numeric),
    ('CULOTTE PVC 100',                     6::numeric),
    ('CULOTTE PVC 110',                     2::numeric),
    ('CULOTTE PVC 125',                     4::numeric),
    ('CULOTTE DOUBLE PVC 100',              2::numeric),
    ('RÉDUCTION PVC 40 x 32',                4::numeric),
    ('RÉDUCTION PVC 50 x 40',                5::numeric),
    ('RÉDUCTION PVC 100 x 50',               4::numeric),
    ('RÉDUCTION PVC 100 x 50 x 40',          3::numeric),
    ('RÉDUCTION PVC 100 x 75',               1::numeric),
    ('RÉDUCTION PVC 110 x 40',               4::numeric),
    ('RÉDUCTION PVC 110 x 40 x 32',          1::numeric),
    ('RÉDUCTION PVC 110 x 40 x 40 x 40',     3::numeric),
    ('RÉDUCTION PVC 110 x 50',              10::numeric),
    ('RÉDUCTION PVC 110 x 50 x 40',          1::numeric),
    ('RÉDUCTION PVC 110 x 75',               4::numeric),
    ('RÉDUCTION PVC 110 x 100',              8::numeric),
    ('RÉDUCTION PVC 125 x 50',               2::numeric),
    ('RÉDUCTION PVC 125 x 100',              1::numeric),
    ('RÉDUCTION PVC 160 x 110',              1::numeric),
    ('CHAPEAU DE GENDARME PPR 20',         11::numeric)
) AS s(nom, qty)
JOIN public.stock_articles a ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_levels l
  WHERE l.article_id = a.id
    AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
);

INSERT INTO public.stock_movements (
  ref_mouvement, type_mouvement, article_id, warehouse_id,
  quantite, date_mouvement, motif, payload
)
SELECT
  'BM-SEED-PVC-' || upper(substr(replace(a.id::text, '-', ''), 1, 10)),
  'Entree', a.id, w.id, s.qty, CURRENT_DATE,
  'Création de l''article',
  jsonb_build_object(
    'statut', 'Validé', 'applied', true,
    'origine', 'Stock initial',
    'source', 'seed_plomberie_pvc',
    'action_label', 'Entrée de stock — Stock initial',
    'emplacement_destination', 'DEPOT LAKHYAYTA',
    'article_code', a.reference,
    'article_designation', a.nom,
    'ligne_index', 0
  )
FROM (
  VALUES
    ('MANCHON BITUBE MÂLE/FEMELLE 100',     1::numeric),
    ('BOUCHON PVC 40',                      4::numeric),
    ('BOUCHON PVC 50',                      6::numeric),
    ('BOUCHON PVC 75',                      2::numeric),
    ('BOUCHON PVC 100',                     6::numeric),
    ('BOUCHON PVC 110',                     4::numeric),
    ('COUDE PVC 32 x 45°',                 43::numeric),
    ('COUDE PVC 32 x 90°',                 16::numeric),
    ('COUDE PVC 40 x 90°',                  3::numeric),
    ('COUDE PVC 50 x 45°',                 16::numeric),
    ('COUDE PVC 50 x 90°',                  8::numeric),
    ('COUDE PVC 75 x 45°',                 18::numeric),
    ('COUDE PVC 75 x 90°',                  2::numeric),
    ('COUDE PVC 100 x 45°',                25::numeric),
    ('COUDE PVC 100 x 90°',                13::numeric),
    ('COUDE PVC 110 x 45°',                16::numeric),
    ('COUDE PVC 110 x 90°',                 2::numeric),
    ('COUDE PVC 125 x 45°',                 1::numeric),
    ('TÉ PVC 32',                           2::numeric),
    ('TÉ PVC 40',                           3::numeric),
    ('TÉ PVC 50',                           1::numeric),
    ('CULOTTE PVC SIMPLE 32',               3::numeric),
    ('CULOTTE PVC SIMPLE 40',               1::numeric),
    ('CULOTTE PVC SIMPLE 50',              12::numeric),
    ('CULOTTE PVC 100',                     6::numeric),
    ('CULOTTE PVC 110',                     2::numeric),
    ('CULOTTE PVC 125',                     4::numeric),
    ('CULOTTE DOUBLE PVC 100',              2::numeric),
    ('RÉDUCTION PVC 40 x 32',                4::numeric),
    ('RÉDUCTION PVC 50 x 40',                5::numeric),
    ('RÉDUCTION PVC 100 x 50',               4::numeric),
    ('RÉDUCTION PVC 100 x 50 x 40',          3::numeric),
    ('RÉDUCTION PVC 100 x 75',               1::numeric),
    ('RÉDUCTION PVC 110 x 40',               4::numeric),
    ('RÉDUCTION PVC 110 x 40 x 32',          1::numeric),
    ('RÉDUCTION PVC 110 x 40 x 40 x 40',     3::numeric),
    ('RÉDUCTION PVC 110 x 50',              10::numeric),
    ('RÉDUCTION PVC 110 x 50 x 40',          1::numeric),
    ('RÉDUCTION PVC 110 x 75',               4::numeric),
    ('RÉDUCTION PVC 110 x 100',              8::numeric),
    ('RÉDUCTION PVC 125 x 50',               2::numeric),
    ('RÉDUCTION PVC 125 x 100',              1::numeric),
    ('RÉDUCTION PVC 160 x 110',              1::numeric),
    ('CHAPEAU DE GENDARME PPR 20',         11::numeric)
) AS s(nom, qty)
JOIN public.stock_articles a ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.article_id = a.id
    AND (
      coalesce(m.payload->>'source', '') = 'seed_plomberie_pvc'
      OR (
        lower(coalesce(m.type_mouvement, '')) IN ('entree', 'entrée')
        AND coalesce(m.motif, '') = 'Création de l''article'
      )
    )
);

SELECT a.reference, a.nom, COALESCE(l.quantite, 0) AS qty_depot
FROM public.stock_articles a
LEFT JOIN public.stock_levels l
  ON l.article_id = a.id
 AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
WHERE a.nom IN (
  'MANCHON BITUBE MÂLE/FEMELLE 100',
  'BOUCHON PVC 40', 'BOUCHON PVC 50', 'BOUCHON PVC 75', 'BOUCHON PVC 100', 'BOUCHON PVC 110',
  'COUDE PVC 32 x 45°', 'COUDE PVC 32 x 90°', 'COUDE PVC 40 x 90°',
  'COUDE PVC 50 x 45°', 'COUDE PVC 50 x 90°', 'COUDE PVC 75 x 45°', 'COUDE PVC 75 x 90°',
  'COUDE PVC 100 x 45°', 'COUDE PVC 100 x 90°', 'COUDE PVC 110 x 45°', 'COUDE PVC 110 x 90°',
  'COUDE PVC 125 x 45°',
  'TÉ PVC 32', 'TÉ PVC 40', 'TÉ PVC 50',
  'CULOTTE PVC SIMPLE 32', 'CULOTTE PVC SIMPLE 40', 'CULOTTE PVC SIMPLE 50',
  'CULOTTE PVC 100', 'CULOTTE PVC 110', 'CULOTTE PVC 125', 'CULOTTE DOUBLE PVC 100',
  'RÉDUCTION PVC 40 x 32', 'RÉDUCTION PVC 50 x 40',
  'RÉDUCTION PVC 100 x 50', 'RÉDUCTION PVC 100 x 50 x 40', 'RÉDUCTION PVC 100 x 75',
  'RÉDUCTION PVC 110 x 40', 'RÉDUCTION PVC 110 x 40 x 32', 'RÉDUCTION PVC 110 x 40 x 40 x 40',
  'RÉDUCTION PVC 110 x 50', 'RÉDUCTION PVC 110 x 50 x 40', 'RÉDUCTION PVC 110 x 75', 'RÉDUCTION PVC 110 x 100',
  'RÉDUCTION PVC 125 x 50', 'RÉDUCTION PVC 125 x 100', 'RÉDUCTION PVC 160 x 110',
  'CHAPEAU DE GENDARME PPR 20'
)
ORDER BY a.nom;

SELECT COUNT(*)::int AS articles_pvc_seed
FROM public.stock_articles a
WHERE a.nom LIKE '%PVC%' OR a.nom LIKE '%PPR%' OR a.nom LIKE '%BITUBE%';

NOTIFY pgrst, 'reload schema';
