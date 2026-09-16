-- =============================================================================
-- CITYMO — Seed PLOMBERIE (outils + consommables, liste inventaire 1–55)
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent : pas de doublon (même nom), n’écrase pas une qté déjà présente.
-- Catégorie : PLOMBERIE — Emplacement : DEPOT LAKHYAYTA
-- Mitigeur chromé monolith : qté 1 (quantité non indiquée sur la liste source)
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

DROP TABLE IF EXISTS tmp_seed_plomberie_liste;
CREATE TEMP TABLE tmp_seed_plomberie_liste (
  nom text PRIMARY KEY,
  qty numeric NOT NULL,
  article_type text NOT NULL
);

INSERT INTO tmp_seed_plomberie_liste (nom, qty, article_type) VALUES
  ('Bouchon galvanisé 1/2"',                         34, 'Consommable'),
  ('Chalumeau piézo à gaz Pigeon PN 1385',            1, 'Outil'),
  ('Chalumeau Haifan 392',                            2, 'Outil'),
  ('Collier avec joint 100',                         19, 'Consommable'),
  ('Collier avec joint 75',                          12, 'Consommable'),
  ('Collier avec joint 50',                          17, 'Consommable'),
  ('Collier avec joint 32',                          27, 'Consommable'),
  ('Collier avec joint 40',                          18, 'Consommable'),
  ('Collier avec joint 3/4"',                        18, 'Consommable'),
  ('Collier avec joint 110',                          1, 'Consommable'),
  ('Culotte simple 50',                              15, 'Consommable'),
  ('Coude d''arrosage 40',                            2, 'Consommable'),
  ('Clapet anti-retour PVC 50',                       1, 'Consommable'),
  ('Vanne PVC 50',                                    1, 'Consommable'),
  ('Coude femelle polyéthylène 40',                   1, 'Consommable'),
  ('Raccord union polyéthylène 63',                   1, 'Consommable'),
  ('Flexible WC',                                     3, 'Consommable'),
  ('Flexible femelle/femelle 3/8"',                   1, 'Consommable'),
  ('Flexible mâle/femelle 3/8"',                      3, 'Consommable'),
  ('Flexible mâle/femelle 1/2"',                      4, 'Consommable'),
  ('Flexible femelle/femelle 1/2"',                  11, 'Consommable'),
  ('Douchette',                                       1, 'Consommable'),
  ('Mitigeur',                                        2, 'Consommable'),
  ('Kit de douche',                                   1, 'Consommable'),
  ('Mitigeur de cuisine',                             1, 'Consommable'),
  ('Flexible de mitigeur 3/8"',                       4, 'Consommable'),
  ('Flexible de mitigeur 1/2"',                       5, 'Consommable'),
  ('Siphon en inox 32',                               1, 'Consommable'),
  ('Extracteur VF-54',                                1, 'Consommable'),
  ('Raccord union pour pompe',                        1, 'Consommable'),
  ('Bonde de fond de piscine',                        1, 'Consommable'),
  ('Manomètre 16 bars',                               2, 'Outil'),
  ('Bonde de lavabo chromée',                         1, 'Consommable'),
  ('Rosace de lavabo en laiton',                      8, 'Consommable'),
  ('Collier 3/4"',                                    1, 'Consommable'),
  ('Collier de prise 110 x 50',                       1, 'Consommable'),
  ('Gouttière galvanisée',                            5, 'Consommable'),
  ('Rallonge de cuvette',                            12, 'Consommable'),
  ('Coude de cuvette',                                5, 'Consommable'),
  ('Rallonge WC',                                     3, 'Consommable'),
  ('Coude WC',                                        1, 'Consommable'),
  ('Bonde siphonnée',                                 2, 'Consommable'),
  ('Siphon 32',                                       1, 'Consommable'),
  ('Siphon double',                                   3, 'Consommable'),
  ('Siphon 40',                                       1, 'Consommable'),
  ('Bonde d''évier',                                  3, 'Consommable'),
  ('Siphon de cour 20 × 20',                          1, 'Consommable'),
  ('Robinet d''équerre 1/2" × 3/8"',                  1, 'Consommable'),
  ('Évier à 1 bac',                                   5, 'Consommable'),
  ('Évier à 2 bacs',                                  1, 'Consommable'),
  ('Mitigeur chromé monolith',                        1, 'Consommable'),
  ('Mitigeur d''évier noir',                          2, 'Consommable'),
  ('Tige de jardin',                                  1, 'Consommable'),
  ('Sèche-serviettes chromé',                         1, 'Consommable'),
  ('Cabine de douche noire',                          1, 'Consommable');

WITH cat AS (
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
  SELECT s.nom, s.qty, s.article_type, row_number() OVER (ORDER BY s.nom) AS rn
  FROM tmp_seed_plomberie_liste s
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
    t.nom, 'PLOMBERIE', (SELECT id FROM cat), t.article_type,
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
  article_type = COALESCE(NULLIF(trim(a.article_type), ''), s.article_type),
  unite        = COALESCE(NULLIF(trim(a.unite), ''), 'U'),
  etat         = COALESCE(NULLIF(trim(a.etat), ''), 'Neuf'),
  statut       = COALESCE(NULLIF(trim(a.statut), ''), 'Active'),
  updated_at   = NOW()
FROM public.stock_categories c, tmp_seed_plomberie_liste s
WHERE lower(trim(a.nom)) = lower(trim(s.nom))
  AND (
    lower(trim(coalesce(c.code, ''))) = 'plomberie'
    OR lower(trim(coalesce(c.name, ''))) = 'plomberie'
    OR lower(trim(coalesce(c.nom, '')))  = 'plomberie'
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
        SELECT 1 FROM tmp_seed_plomberie_liste s
        WHERE lower(trim(a.nom)) = lower(trim(s.nom))
      );
  END IF;
END $bc$;

INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT a.id, 'DEPOT LAKHYAYTA', s.qty, w.id, NULL
FROM tmp_seed_plomberie_liste s
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
  'BM-SEED-PLOB-' || upper(substr(replace(a.id::text, '-', ''), 1, 10)),
  'Entree', a.id, w.id, s.qty, CURRENT_DATE,
  'Création de l''article',
  jsonb_build_object(
    'statut', 'Validé', 'applied', true,
    'origine', 'Stock initial',
    'source', 'seed_plomberie_liste',
    'action_label', 'Entrée de stock — Stock initial',
    'emplacement_destination', 'DEPOT LAKHYAYTA',
    'article_code', a.reference,
    'article_designation', a.nom,
    'ligne_index', 0
  )
FROM tmp_seed_plomberie_liste s
JOIN public.stock_articles a ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.article_id = a.id
    AND (
      coalesce(m.payload->>'source', '') = 'seed_plomberie_liste'
      OR (
        lower(coalesce(m.type_mouvement, '')) IN ('entree', 'entrée')
        AND coalesce(m.motif, '') = 'Création de l''article'
      )
    )
);

SELECT a.reference, a.nom, a.article_type, COALESCE(l.quantite, 0) AS qty_depot
FROM public.stock_articles a
JOIN tmp_seed_plomberie_liste s ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_levels l
  ON l.article_id = a.id
 AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
ORDER BY a.nom;

SELECT COUNT(*)::int AS articles_seed_plomberie_liste
FROM public.stock_articles a
JOIN tmp_seed_plomberie_liste s ON lower(trim(a.nom)) = lower(trim(s.nom));

NOTIFY pgrst, 'reload schema';
