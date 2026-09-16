-- =============================================================================
-- CITYMO — Seed ELECTRICITE Consommable — TOUT EN UN (16/09/2026)
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent : pas de doublon (même nom), n’écrase pas une qté déjà présente.
-- Type : Consommable — Catégorie : ELECTRICITE — Emplacement : DEPOT LAKHYAYTA
--
-- Contenu (16 articles, sans doublon) :
--   • Disjoncteurs Ingelec / Legrand / Schneider Domae
--   • Bandes, fusibles, répartiteurs, Vigi, Acti9
--   • KNX / tableau (actionneur, interrupteur, voyant, alimentation)
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
  'ELECTRICITE', 'ELECTRICITE', 'ELECTRICITE',
  'Matériel électrique consommable',
  'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_categories c
  WHERE lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
     OR lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
     OR lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
);

DROP TABLE IF EXISTS tmp_seed_electricite_consommables;
CREATE TEMP TABLE tmp_seed_electricite_consommables (
  nom text PRIMARY KEY,
  qty numeric NOT NULL
);

INSERT INTO tmp_seed_electricite_consommables (nom, qty) VALUES
  -- Disjoncteurs (liste 1)
  ('DISJONCTEUR INGELEC C16',                                    1),
  ('DISJONCTEUR INGELEC C10',                                   11),
  ('DISJONCTEUR LEGRAND RX3 C10',                                9),
  ('DISJONCTEUR SCHNEIDER ELECTRIC DOMAE C10',                   4),
  ('DISJONCTEUR LEGRAND DX3 C10',                                2),
  -- Tableau / protection (liste 2)
  ('BANDE DE CONNEXION 2 x 50 MM',                               4),
  ('FUSIBLE À COUTEAUX 160 A',                                   3),
  ('FUSIBLE À COUTEAUX 80 A',                                    3),
  ('RÉPARTITEUR SUR RAIL DIN 4 x 100 A INGELEC',                 3),
  ('RÉPARTITEUR SUR RAIL DIN 4 x 100 A TOUSSA',                  2),
  ('BLOC VIGI SCHNEIDER DP 40 A 300 MA',                         2),
  ('DISJONCTEUR SCHNEIDER ACTI9 DP COURBE C 25 A',               2),
  -- KNX / accessoires tableau (liste 3)
  ('ACTIONNEUR KNX POUR RIDEAU MOTORISÉ MONTAGE SUR RAIL DIN',   1),
  ('INTERRUPTEUR D''OPPOSITION POUR TABLEAU ÉLECTRIQUE',         1),
  ('VOYANT POUR TABLEAU ÉLECTRIQUE MONTAGE SUR RAIL DIN',        2),
  ('ALIMENTATION KNX MONTAGE SUR RAIL DIN',                      1);

WITH cat AS (
  SELECT c.id FROM public.stock_categories c
  WHERE lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
     OR lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
     OR lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
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
  FROM tmp_seed_electricite_consommables s
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
    t.nom, 'ELECTRICITE', (SELECT id FROM cat), 'Consommable',
    'U', 0::numeric, 0::numeric, 'Neuf', 'DEPOT LAKHYAYTA', 'Active'
  FROM to_insert t CROSS JOIN max_ref m
  RETURNING id, nom, reference
)
SELECT * FROM ins;

UPDATE public.stock_articles a
SET
  category_id  = COALESCE(a.category_id, c.id),
  categorie    = COALESCE(NULLIF(trim(a.categorie), ''), 'ELECTRICITE'),
  emplacement  = COALESCE(NULLIF(trim(a.emplacement), ''), 'DEPOT LAKHYAYTA'),
  article_type = COALESCE(NULLIF(trim(a.article_type), ''), 'Consommable'),
  unite        = COALESCE(NULLIF(trim(a.unite), ''), 'U'),
  etat         = COALESCE(NULLIF(trim(a.etat), ''), 'Neuf'),
  statut       = COALESCE(NULLIF(trim(a.statut), ''), 'Active'),
  updated_at   = NOW()
FROM public.stock_categories c, tmp_seed_electricite_consommables s
WHERE lower(trim(a.nom)) = lower(trim(s.nom))
  AND (
    lower(translate(trim(coalesce(c.code, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
    OR lower(translate(trim(coalesce(c.name, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
    OR lower(translate(trim(coalesce(c.nom, '')), 'éèêëÉÈÊË', 'eeeeEEEE')) = 'electricite'
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
      AND a.categorie = 'ELECTRICITE'
      AND a.article_type = 'Consommable'
      AND EXISTS (
        SELECT 1 FROM tmp_seed_electricite_consommables s
        WHERE lower(trim(a.nom)) = lower(trim(s.nom))
      );
  END IF;
END $bc$;

INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT a.id, 'DEPOT LAKHYAYTA', s.qty, w.id, NULL
FROM tmp_seed_electricite_consommables s
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
  'BM-SEED-ELEC-' || upper(substr(replace(a.id::text, '-', ''), 1, 10)),
  'Entree', a.id, w.id, s.qty, CURRENT_DATE,
  'Création de l''article',
  jsonb_build_object(
    'statut', 'Validé', 'applied', true,
    'origine', 'Stock initial',
    'source', 'seed_electricite_consommables',
    'action_label', 'Entrée de stock — Stock initial',
    'emplacement_destination', 'DEPOT LAKHYAYTA',
    'article_code', a.reference,
    'article_designation', a.nom,
    'ligne_index', 0
  )
FROM tmp_seed_electricite_consommables s
JOIN public.stock_articles a ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.article_id = a.id
    AND (
      coalesce(m.payload->>'source', '') IN ('seed_electricite_consommables', 'seed_electricite_disjoncteurs')
      OR (
        lower(coalesce(m.type_mouvement, '')) IN ('entree', 'entrée')
        AND coalesce(m.motif, '') = 'Création de l''article'
      )
    )
);

SELECT a.reference, a.nom, COALESCE(l.quantite, 0) AS qty_depot
FROM public.stock_articles a
JOIN tmp_seed_electricite_consommables s ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_levels l
  ON l.article_id = a.id
 AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
ORDER BY a.nom;

SELECT COUNT(*)::int AS articles_seed_electricite
FROM public.stock_articles a
JOIN tmp_seed_electricite_consommables s ON lower(trim(a.nom)) = lower(trim(s.nom));

NOTIFY pgrst, 'reload schema';
