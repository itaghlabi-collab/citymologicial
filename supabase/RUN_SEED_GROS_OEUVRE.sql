-- =============================================================================
-- CITYMO — Seed GROS OEUVRE (outils + consommables, liste inventaire 1–26)
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent : pas de doublon (même nom), n’écrase pas une qté déjà présente.
-- Catégorie : GROS OEUVRE — Emplacement : DEPOT LAKHYAYTA
-- Fil d'attache : qté 1 (quantité non indiquée sur la liste source)
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
  'GROS_OEUVRE', 'GROS OEUVRE', 'GROS OEUVRE',
  'Matériel gros œuvre (outils et consommables)',
  'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_categories c
  WHERE replace(lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
     OR replace(lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
     OR replace(lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
);

DROP TABLE IF EXISTS tmp_seed_gros_oeuvre;
CREATE TEMP TABLE tmp_seed_gros_oeuvre (
  nom text PRIMARY KEY,
  qty numeric NOT NULL,
  article_type text NOT NULL
);

INSERT INTO tmp_seed_gros_oeuvre (nom, qty, article_type) VALUES
  ('Taloche 30 × 20 cm',           20, 'Outil'),
  ('Taloche 40 × 30 cm',            8, 'Outil'),
  ('Burin plat',                    7, 'Outil'),
  ('Burin pointu',                  8, 'Outil'),
  ('Arrache-clou',                  2, 'Outil'),
  ('Marteau',                       1, 'Outil'),
  ('Massette 5 kg',                 1, 'Outil'),
  ('Massette 1 kg',                 2, 'Outil'),
  ('Truelle',                       6, 'Outil'),
  ('Seau de maçonnerie',           10, 'Outil'),
  ('Gamelle de maçonnerie',        10, 'Outil'),
  ('Support métallique',            8, 'Outil'),
  ('Pioche',                        4, 'Outil'),
  ('Faucille',                      2, 'Outil'),
  ('Cisaille Pigeon 600',           1, 'Outil'),
  ('Griffe de ferrailleur',         1, 'Outil'),
  ('Râteau Bellota',                1, 'Outil'),
  ('Ciseau Bellota',                1, 'Outil'),
  ('Balai à gazon',                 2, 'Outil'),
  ('Bac à plâtre',                  2, 'Outil'),
  ('Scie',                          1, 'Outil'),
  ('Clous 60 mm',                  72, 'Consommable'),
  ('Clous 80 mm',                  54, 'Consommable'),
  ('Clous 100 mm',                  2, 'Consommable'),
  ('Fil d''attache',                1, 'Consommable'),
  ('Chalumeau',                     2, 'Outil');

WITH cat AS (
  SELECT c.id FROM public.stock_categories c
  WHERE replace(lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
     OR replace(lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
     OR replace(lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
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
  SELECT s.nom, s.qty, s.article_type, row_number() OVER (ORDER BY s.nom) AS rn
  FROM tmp_seed_gros_oeuvre s
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
    t.nom, 'GROS OEUVRE', (SELECT id FROM cat), t.article_type,
    'U', 0::numeric, 0::numeric, 'Neuf', 'DEPOT LAKHYAYTA', 'Active'
  FROM to_insert t CROSS JOIN max_ref m
  RETURNING id, nom, reference
)
SELECT * FROM ins;

UPDATE public.stock_articles a
SET
  category_id  = COALESCE(a.category_id, c.id),
  categorie    = COALESCE(NULLIF(trim(a.categorie), ''), 'GROS OEUVRE'),
  emplacement  = COALESCE(NULLIF(trim(a.emplacement), ''), 'DEPOT LAKHYAYTA'),
  article_type = COALESCE(NULLIF(trim(a.article_type), ''), s.article_type),
  unite        = COALESCE(NULLIF(trim(a.unite), ''), 'U'),
  etat         = COALESCE(NULLIF(trim(a.etat), ''), 'Neuf'),
  statut       = COALESCE(NULLIF(trim(a.statut), ''), 'Active'),
  updated_at   = NOW()
FROM public.stock_categories c, tmp_seed_gros_oeuvre s
WHERE lower(trim(a.nom)) = lower(trim(s.nom))
  AND (
    replace(lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
    OR replace(lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
    OR replace(lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊËœŒ', 'eeeeEEEEoeOE')), '_', ' ') IN ('gros oeuvre', 'gros oeuvres')
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
      AND EXISTS (
        SELECT 1 FROM tmp_seed_gros_oeuvre s
        WHERE lower(trim(a.nom)) = lower(trim(s.nom))
      );
  END IF;
END $bc$;

INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT a.id, 'DEPOT LAKHYAYTA', s.qty, w.id, NULL
FROM tmp_seed_gros_oeuvre s
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
  'BM-SEED-GROE-' || upper(substr(replace(a.id::text, '-', ''), 1, 10)),
  'Entree', a.id, w.id, s.qty, CURRENT_DATE,
  'Création de l''article',
  jsonb_build_object(
    'statut', 'Validé', 'applied', true,
    'origine', 'Stock initial',
    'source', 'seed_gros_oeuvre',
    'action_label', 'Entrée de stock — Stock initial',
    'emplacement_destination', 'DEPOT LAKHYAYTA',
    'article_code', a.reference,
    'article_designation', a.nom,
    'ligne_index', 0
  )
FROM tmp_seed_gros_oeuvre s
JOIN public.stock_articles a ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.article_id = a.id
    AND (
      coalesce(m.payload->>'source', '') = 'seed_gros_oeuvre'
      OR (
        lower(coalesce(m.type_mouvement, '')) IN ('entree', 'entrée')
        AND coalesce(m.motif, '') = 'Création de l''article'
      )
    )
);

SELECT a.reference, a.nom, a.article_type, COALESCE(l.quantite, 0) AS qty_depot
FROM public.stock_articles a
JOIN tmp_seed_gros_oeuvre s ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_levels l
  ON l.article_id = a.id
 AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
ORDER BY a.nom;

SELECT COUNT(*)::int AS articles_seed_gros_oeuvre
FROM public.stock_articles a
JOIN tmp_seed_gros_oeuvre s ON lower(trim(a.nom)) = lower(trim(s.nom));

NOTIFY pgrst, 'reload schema';
