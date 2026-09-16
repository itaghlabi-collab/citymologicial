-- =============================================================================
-- CITYMO — Seed PEINTURE Consommable (liste inventaire 1–53)
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent : pas de doublon (même nom), n’écrase pas une qté déjà présente.
-- Type : Consommable — Catégorie : PEINTURE — Emplacement : DEPOT LAKHYAYTA
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
  'PEINTURE', 'PEINTURE', 'PEINTURE',
  'Matériel peinture consommable',
  'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_categories c
  WHERE lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
     OR lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
     OR lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
);

DROP TABLE IF EXISTS tmp_seed_peinture_consommables;
CREATE TEMP TABLE tmp_seed_peinture_consommables (
  nom text PRIMARY KEY,
  qty numeric NOT NULL
);

INSERT INTO tmp_seed_peinture_consommables (nom, qty) VALUES
  ('Diluant cellulosique 5 L',                          33),
  ('Peinture vinylique 30 kg',                          32),
  ('Enduit R8245 25 kg',                                10),
  ('Apprêt cellulosique gris 5 kg',                     36),
  ('Masque de peinture Maestro 2834',                    8),
  ('Teinte à base d''eau noire',                         4),
  ('Teinte à base d''eau rouge',                         2),
  ('Teinte à base d''eau jaune',                         3),
  ('Teinte pâte à base d''eau noire',                    2),
  ('Peinture vinylique 1 kg',                            2),
  ('Pistolet à peinture AS-PE92U',                       1),
  ('Machine à crépir manuelle',                          2),
  ('Colle Panoglue Sader 5 kg',                          5),
  ('Colle Collène Sader 5 kg',                           4),
  ('Vernis cellulosique mat Facop 5 kg',                 4),
  ('Vernis cellulosique brillant Atlas 5 kg',            1),
  ('Vernis cellulosique pour parquet Facop 5 kg',        2),
  ('Mastic cellulosique Atlas 1 kg',                    58),
  ('Mastic cellulosique Facop 1 kg',                     2),
  ('Mastic polyester Logic Color 850 g',                26),
  ('Mastic polyester Maestro 1 kg',                      6),
  ('Diluant universel n° 3 – 1 L',                       8),
  ('Apprêt Filler 2K',                                   5),
  ('Wash Primer 5 kg',                                   1),
  ('Santofer 0,5 kg',                                    1),
  ('Peinture cellulosique rouge taxi 1 kg',              4),
  ('Peinture cellulosique bleue 1 kg',                   2),
  ('Peinture cellulosique noire mate 1 kg',              8),
  ('Peinture de raccord blanche 1 kg',                   1),
  ('Papier abrasif grain 100',                          50),
  ('Papier abrasif grain 80',                           64),
  ('Papier abrasif grain 60',                           54),
  ('Carte abrasive grain 600',                         250),
  ('Carte abrasive grain 220',                         250),
  ('Carte abrasive grain 400',                         200),
  ('Carte abrasive grain 180',                         100),
  ('Tampon d''essuyage',                                12),
  ('Balai de chantier 40 cm',                            5),
  ('Balai de chantier 50 cm',                            2),
  ('Balai de chantier 20 cm',                            7),
  ('Pinceau rectangulaire',                              1),
  ('Rouleau de peinture court',                         24),
  ('Rouleau de peinture long',                          20),
  ('Pinceau rond',                                       6),
  ('Manche pour rouleau de peinture',                    2),
  ('Diluant époxy 5 L',                                  2),
  ('Grattoir 220 mm',                                   16),
  ('Grattoir 450 mm',                                    2),
  ('Taloche de peinture Rubi',                           7),
  ('Taloche de peinture Kapriol',                        1),
  ('Taloche à enduit métallique',                        4),
  ('Grille de peinture',                                55),
  ('Truelle Khayat L',                                   7);

WITH cat AS (
  SELECT c.id FROM public.stock_categories c
  WHERE lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
     OR lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
     OR lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
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
  FROM tmp_seed_peinture_consommables s
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
    t.nom, 'PEINTURE', (SELECT id FROM cat), 'Consommable',
    'U', 0::numeric, 0::numeric, 'Neuf', 'DEPOT LAKHYAYTA', 'Active'
  FROM to_insert t CROSS JOIN max_ref m
  RETURNING id, nom, reference
)
SELECT * FROM ins;

UPDATE public.stock_articles a
SET
  category_id  = COALESCE(a.category_id, c.id),
  categorie    = COALESCE(NULLIF(trim(a.categorie), ''), 'PEINTURE'),
  emplacement  = COALESCE(NULLIF(trim(a.emplacement), ''), 'DEPOT LAKHYAYTA'),
  article_type = COALESCE(NULLIF(trim(a.article_type), ''), 'Consommable'),
  unite        = COALESCE(NULLIF(trim(a.unite), ''), 'U'),
  etat         = COALESCE(NULLIF(trim(a.etat), ''), 'Neuf'),
  statut       = COALESCE(NULLIF(trim(a.statut), ''), 'Active'),
  updated_at   = NOW()
FROM public.stock_categories c, tmp_seed_peinture_consommables s
WHERE lower(trim(a.nom)) = lower(trim(s.nom))
  AND (
    lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
    OR lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
    OR lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'peinture'
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
      AND a.categorie = 'PEINTURE'
      AND a.article_type = 'Consommable'
      AND EXISTS (
        SELECT 1 FROM tmp_seed_peinture_consommables s
        WHERE lower(trim(a.nom)) = lower(trim(s.nom))
      );
  END IF;
END $bc$;

INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT a.id, 'DEPOT LAKHYAYTA', s.qty, w.id, NULL
FROM tmp_seed_peinture_consommables s
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
  'BM-SEED-PEIN-' || upper(substr(replace(a.id::text, '-', ''), 1, 10)),
  'Entree', a.id, w.id, s.qty, CURRENT_DATE,
  'Création de l''article',
  jsonb_build_object(
    'statut', 'Validé', 'applied', true,
    'origine', 'Stock initial',
    'source', 'seed_peinture_consommables',
    'action_label', 'Entrée de stock — Stock initial',
    'emplacement_destination', 'DEPOT LAKHYAYTA',
    'article_code', a.reference,
    'article_designation', a.nom,
    'ligne_index', 0
  )
FROM tmp_seed_peinture_consommables s
JOIN public.stock_articles a ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.article_id = a.id
    AND (
      coalesce(m.payload->>'source', '') = 'seed_peinture_consommables'
      OR (
        lower(coalesce(m.type_mouvement, '')) IN ('entree', 'entrée')
        AND coalesce(m.motif, '') = 'Création de l''article'
      )
    )
);

SELECT a.reference, a.nom, COALESCE(l.quantite, 0) AS qty_depot
FROM public.stock_articles a
JOIN tmp_seed_peinture_consommables s ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_levels l
  ON l.article_id = a.id
 AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
ORDER BY a.nom;

SELECT COUNT(*)::int AS articles_seed_peinture_consommables
FROM public.stock_articles a
JOIN tmp_seed_peinture_consommables s ON lower(trim(a.nom)) = lower(trim(s.nom));

NOTIFY pgrst, 'reload schema';
