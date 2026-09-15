-- =============================================================================
-- CITYMO — Seed OUTILLAGE BA13 (Consommable)
-- Supabase → SQL Editor → coller tout → Run
-- Idempotent. Catégorie : OUTILLAGE BA13 | Type : Consommable
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
  'OUTILLAGE_BA13',
  'OUTILLAGE BA13',
  'OUTILLAGE BA13',
  'Consommables plâtrerie / faux plafonds BA13',
  'LOGISTIQUE',
  'CONSOMMABLE',
  TRUE,
  'Active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_categories c
  WHERE lower(trim(coalesce(c.code, ''))) IN ('outillage_ba13', 'outillage ba13')
     OR lower(trim(coalesce(c.name, ''))) = 'outillage ba13'
     OR lower(trim(coalesce(c.nom, '')))  = 'outillage ba13'
);

WITH seed(nom, qty, unite) AS (
  VALUES
    ('CHEVILLE BA13',                          1::numeric,   'Paquet'),
    ('CHEVILLE MÉTALLIQUE POUR VIS 8',       184::numeric,   'U'),
    ('PIVOT TC60',                              3::numeric,   'Paquet'),
    ('PIVOT TC47',                              3::numeric,   'Paquet'),
    ('CHEVILLE EN LAITON',                     2::numeric,   'Paquet'),
    ('COULISSEAU POUR PORTEUR EN T',           2::numeric,   'Paquet'),
    ('CHEVILLE À BASCULE AVEC ROSACE',         4::numeric,   'Paquet'),
    ('MANCHON POUR TIGE FILETÉE',              2::numeric,   'Paquet'),
    ('CHEVILLE À FRAPPER',                     2::numeric,   'Paquet'),
    ('VIS PHOSPHATÉE BA13 25 MM',               1::numeric,   'Paquet'),
    ('VIS PHOSPHATÉE BA13 35 MM',               2::numeric,   'Paquet'),
    ('VIS PHOSPHATÉE BA13 55 MM',               1::numeric,   'Paquet'),
    ('VIS AUTOPERCEUSE BA13 15 MM',          0.5::numeric,   'Paquet'),
    ('PORTEUR T15 360 CM',                     6::numeric,   'U'),
    ('ENTRETOISE T15 60 CM',                   18::numeric,   'U'),
    ('ENTRETOISE T15 120 CM',                  31::numeric,   'U'),
    ('ENTRETOISE T24 60 CM',                  132::numeric,   'U'),
    ('ENTRETOISE T24 120 CM',                 120::numeric,   'U'),
    ('TRAPPE DE VISITE 30 X 30 CM',            1::numeric,   'U'),
    ('SUPPORT POUR PLAFOND TECHNIQUE',         6::numeric,   'U'),
    ('TIGE FILETÉE M6 1 M',                   21::numeric,   'U'),
    ('TIGE FILETÉE M6 3 M',                   19::numeric,   'U'),
    ('TIGE FILETÉE M8 1 M',                    7::numeric,   'U'),
    ('CLIP POUR TIGE FILETÉE M6',              1::numeric,   'Paquet'),
    ('CLIP OMÉGA',                            31::numeric,   'U'),
    ('BANDE À JOINT 150 M',                    5::numeric,   'Rouleau'),
    ('BANDE GRILLAGÉE 30 M',                   8::numeric,   'Rouleau'),
    ('SCIE POUR PLÂTRE 150 MM',                6::numeric,   'U'),
    ('SCIE POUR PLÂTRE 300 MM',                2::numeric,   'U')
),
cat AS (
  SELECT c.id FROM public.stock_categories c
  WHERE lower(trim(coalesce(c.code, ''))) IN ('outillage_ba13', 'outillage ba13')
     OR lower(trim(coalesce(c.name, ''))) = 'outillage ba13'
     OR lower(trim(coalesce(c.nom, '')))  = 'outillage ba13'
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
  SELECT s.nom, s.qty, s.unite, row_number() OVER (ORDER BY s.nom) AS rn
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
    'OUTILLAGE BA13',
    (SELECT id FROM cat),
    'Consommable',
    t.unite,
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

UPDATE public.stock_articles a
SET
  category_id  = COALESCE(a.category_id, c.id),
  categorie    = COALESCE(NULLIF(trim(a.categorie), ''), 'OUTILLAGE BA13'),
  emplacement  = COALESCE(NULLIF(trim(a.emplacement), ''), 'DEPOT LAKHYAYTA'),
  article_type = COALESCE(NULLIF(trim(a.article_type), ''), 'Consommable'),
  etat         = COALESCE(NULLIF(trim(a.etat), ''), 'Neuf'),
  statut       = COALESCE(NULLIF(trim(a.statut), ''), 'Active'),
  updated_at   = NOW()
FROM public.stock_categories c, (
  VALUES
    ('CHEVILLE BA13'),
    ('CHEVILLE MÉTALLIQUE POUR VIS 8'),
    ('PIVOT TC60'),
    ('PIVOT TC47'),
    ('CHEVILLE EN LAITON'),
    ('COULISSEAU POUR PORTEUR EN T'),
    ('CHEVILLE À BASCULE AVEC ROSACE'),
    ('MANCHON POUR TIGE FILETÉE'),
    ('CHEVILLE À FRAPPER'),
    ('VIS PHOSPHATÉE BA13 25 MM'),
    ('VIS PHOSPHATÉE BA13 35 MM'),
    ('VIS PHOSPHATÉE BA13 55 MM'),
    ('VIS AUTOPERCEUSE BA13 15 MM'),
    ('PORTEUR T15 360 CM'),
    ('ENTRETOISE T15 60 CM'),
    ('ENTRETOISE T15 120 CM'),
    ('ENTRETOISE T24 60 CM'),
    ('ENTRETOISE T24 120 CM'),
    ('TRAPPE DE VISITE 30 X 30 CM'),
    ('SUPPORT POUR PLAFOND TECHNIQUE'),
    ('TIGE FILETÉE M6 1 M'),
    ('TIGE FILETÉE M6 3 M'),
    ('TIGE FILETÉE M8 1 M'),
    ('CLIP POUR TIGE FILETÉE M6'),
    ('CLIP OMÉGA'),
    ('BANDE À JOINT 150 M'),
    ('BANDE GRILLAGÉE 30 M'),
    ('SCIE POUR PLÂTRE 150 MM'),
    ('SCIE POUR PLÂTRE 300 MM')
) AS s(nom)
WHERE lower(trim(a.nom)) = lower(trim(s.nom))
  AND (
    lower(trim(coalesce(c.code, ''))) IN ('outillage_ba13', 'outillage ba13')
    OR lower(trim(coalesce(c.name, ''))) = 'outillage ba13'
    OR lower(trim(coalesce(c.nom, ''))) = 'outillage ba13'
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
      AND (
        lower(trim(coalesce(a.categorie, ''))) = 'outillage ba13'
        OR a.nom ILIKE '%BA13%'
        OR a.nom ILIKE 'PORTEUR T%'
        OR a.nom ILIKE 'ENTRETOISE T%'
        OR a.nom ILIKE 'TIGE FILETÉE%'
        OR a.nom ILIKE 'CLIP %'
        OR a.nom ILIKE 'BANDE %'
        OR a.nom ILIKE 'SCIE POUR PLÂTRE%'
        OR a.nom ILIKE 'CHEVILLE%'
        OR a.nom ILIKE 'PIVOT TC%'
      );
  END IF;
END $bc$;

INSERT INTO public.stock_levels (article_id, emplacement, quantite, warehouse_id, project_id)
SELECT a.id, 'DEPOT LAKHYAYTA', s.qty, w.id, NULL
FROM (
  VALUES
    ('CHEVILLE BA13',                          1::numeric),
    ('CHEVILLE MÉTALLIQUE POUR VIS 8',       184::numeric),
    ('PIVOT TC60',                              3::numeric),
    ('PIVOT TC47',                              3::numeric),
    ('CHEVILLE EN LAITON',                     2::numeric),
    ('COULISSEAU POUR PORTEUR EN T',           2::numeric),
    ('CHEVILLE À BASCULE AVEC ROSACE',         4::numeric),
    ('MANCHON POUR TIGE FILETÉE',              2::numeric),
    ('CHEVILLE À FRAPPER',                     2::numeric),
    ('VIS PHOSPHATÉE BA13 25 MM',               1::numeric),
    ('VIS PHOSPHATÉE BA13 35 MM',               2::numeric),
    ('VIS PHOSPHATÉE BA13 55 MM',               1::numeric),
    ('VIS AUTOPERCEUSE BA13 15 MM',          0.5::numeric),
    ('PORTEUR T15 360 CM',                     6::numeric),
    ('ENTRETOISE T15 60 CM',                   18::numeric),
    ('ENTRETOISE T15 120 CM',                  31::numeric),
    ('ENTRETOISE T24 60 CM',                  132::numeric),
    ('ENTRETOISE T24 120 CM',                 120::numeric),
    ('TRAPPE DE VISITE 30 X 30 CM',            1::numeric),
    ('SUPPORT POUR PLAFOND TECHNIQUE',         6::numeric),
    ('TIGE FILETÉE M6 1 M',                   21::numeric),
    ('TIGE FILETÉE M6 3 M',                   19::numeric),
    ('TIGE FILETÉE M8 1 M',                    7::numeric),
    ('CLIP POUR TIGE FILETÉE M6',              1::numeric),
    ('CLIP OMÉGA',                            31::numeric),
    ('BANDE À JOINT 150 M',                    5::numeric),
    ('BANDE GRILLAGÉE 30 M',                   8::numeric),
    ('SCIE POUR PLÂTRE 150 MM',                6::numeric),
    ('SCIE POUR PLÂTRE 300 MM',                2::numeric)
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
  'BM-SEED-BA13-' || upper(substr(replace(a.id::text, '-', ''), 1, 10)),
  'Entree', a.id, w.id, s.qty, CURRENT_DATE,
  'Création de l''article',
  jsonb_build_object(
    'statut', 'Validé', 'applied', true,
    'origine', 'Stock initial',
    'source', 'seed_outillage_ba13',
    'action_label', 'Entrée de stock — Stock initial',
    'emplacement_destination', 'DEPOT LAKHYAYTA',
    'article_code', a.reference,
    'article_designation', a.nom,
    'ligne_index', 0
  )
FROM (
  VALUES
    ('CHEVILLE BA13',                          1::numeric),
    ('CHEVILLE MÉTALLIQUE POUR VIS 8',       184::numeric),
    ('PIVOT TC60',                              3::numeric),
    ('PIVOT TC47',                              3::numeric),
    ('CHEVILLE EN LAITON',                     2::numeric),
    ('COULISSEAU POUR PORTEUR EN T',           2::numeric),
    ('CHEVILLE À BASCULE AVEC ROSACE',         4::numeric),
    ('MANCHON POUR TIGE FILETÉE',              2::numeric),
    ('CHEVILLE À FRAPPER',                     2::numeric),
    ('VIS PHOSPHATÉE BA13 25 MM',               1::numeric),
    ('VIS PHOSPHATÉE BA13 35 MM',               2::numeric),
    ('VIS PHOSPHATÉE BA13 55 MM',               1::numeric),
    ('VIS AUTOPERCEUSE BA13 15 MM',          0.5::numeric),
    ('PORTEUR T15 360 CM',                     6::numeric),
    ('ENTRETOISE T15 60 CM',                   18::numeric),
    ('ENTRETOISE T15 120 CM',                  31::numeric),
    ('ENTRETOISE T24 60 CM',                  132::numeric),
    ('ENTRETOISE T24 120 CM',                 120::numeric),
    ('TRAPPE DE VISITE 30 X 30 CM',            1::numeric),
    ('SUPPORT POUR PLAFOND TECHNIQUE',         6::numeric),
    ('TIGE FILETÉE M6 1 M',                   21::numeric),
    ('TIGE FILETÉE M6 3 M',                   19::numeric),
    ('TIGE FILETÉE M8 1 M',                    7::numeric),
    ('CLIP POUR TIGE FILETÉE M6',              1::numeric),
    ('CLIP OMÉGA',                            31::numeric),
    ('BANDE À JOINT 150 M',                    5::numeric),
    ('BANDE GRILLAGÉE 30 M',                   8::numeric),
    ('SCIE POUR PLÂTRE 150 MM',                6::numeric),
    ('SCIE POUR PLÂTRE 300 MM',                2::numeric)
) AS s(nom, qty)
JOIN public.stock_articles a ON lower(trim(a.nom)) = lower(trim(s.nom))
LEFT JOIN public.stock_warehouses w ON lower(trim(w.nom)) = 'depot lakhyayta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.article_id = a.id
    AND (
      coalesce(m.payload->>'source', '') = 'seed_outillage_ba13'
      OR (
        lower(coalesce(m.type_mouvement, '')) IN ('entree', 'entrée')
        AND coalesce(m.motif, '') = 'Création de l''article'
      )
    )
);

SELECT a.reference, a.nom, a.unite, COALESCE(l.quantite, 0) AS qty_depot
FROM public.stock_articles a
LEFT JOIN public.stock_levels l
  ON l.article_id = a.id
 AND lower(trim(coalesce(l.emplacement, ''))) = 'depot lakhyayta'
WHERE lower(trim(coalesce(a.categorie, ''))) = 'outillage ba13'
   OR a.nom IN (
    'CHEVILLE BA13', 'CHEVILLE MÉTALLIQUE POUR VIS 8', 'PIVOT TC60', 'PIVOT TC47',
    'CHEVILLE EN LAITON', 'COULISSEAU POUR PORTEUR EN T', 'CHEVILLE À BASCULE AVEC ROSACE',
    'MANCHON POUR TIGE FILETÉE', 'CHEVILLE À FRAPPER',
    'VIS PHOSPHATÉE BA13 25 MM', 'VIS PHOSPHATÉE BA13 35 MM', 'VIS PHOSPHATÉE BA13 55 MM',
    'VIS AUTOPERCEUSE BA13 15 MM',
    'PORTEUR T15 360 CM', 'ENTRETOISE T15 60 CM', 'ENTRETOISE T15 120 CM',
    'ENTRETOISE T24 60 CM', 'ENTRETOISE T24 120 CM',
    'TRAPPE DE VISITE 30 X 30 CM', 'SUPPORT POUR PLAFOND TECHNIQUE',
    'TIGE FILETÉE M6 1 M', 'TIGE FILETÉE M6 3 M', 'TIGE FILETÉE M8 1 M',
    'CLIP POUR TIGE FILETÉE M6', 'CLIP OMÉGA',
    'BANDE À JOINT 150 M', 'BANDE GRILLAGÉE 30 M',
    'SCIE POUR PLÂTRE 150 MM', 'SCIE POUR PLÂTRE 300 MM'
  )
ORDER BY a.nom;

NOTIFY pgrst, 'reload schema';
