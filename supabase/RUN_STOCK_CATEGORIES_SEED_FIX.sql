-- =============================================================================
-- CITYMO — FIX seed Catégories stock (si RUN_STOCK_CATEGORIES a échoué sur INSERT)
-- Cause : colonne legacy "nom" NOT NULL sans valeur dans l'INSERT initial
-- Coller dans Supabase SQL Editor → Run (idempotent)
-- =============================================================================

ALTER TABLE public.stock_categories ALTER COLUMN nom DROP NOT NULL;

INSERT INTO public.stock_categories (legacy_id, code, name, nom, description, department, stock_type, is_active, statut)
VALUES
  (1,  'OUTILLAGE',            'OUTILLAGE',            'OUTILLAGE',            NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (2,  'PEINTURE',             'PEINTURE',             'PEINTURE',             NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (3,  'SOUDURE',              'SOUDURE',              'SOUDURE',              NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (4,  'CLIMATISATION',        'CLIMATISATION',        'CLIMATISATION',        NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (5,  'VISSEUSE',             'VISSEUSE',             'VISSEUSE',             NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (6,  'MEULEUSE_GM',          'MEULEUSE GM',          'MEULEUSE GM',          NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (7,  'MEULEUSE_PM',          'MEULEUSE PM',          'MEULEUSE PM',          NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (8,  'PERFORATEUR',          'PERFORATEUR',          'PERFORATEUR',          NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (9,  'BURINEUR',             'BURINEUR',             'BURINEUR',             NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (10, 'PERCEUSE',             'PERCEUSE',             'PERCEUSE',             NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (11, 'PONCEUSE',             'PONCEUSE',             'PONCEUSE',             NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (12, 'MELANGEUR',            'MELANGEUR',            'MELANGEUR',            'melangeur-malaxeur', 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (13, 'RAINUREUSE',           'RAINUREUSE',           'RAINUREUSE',           NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (14, 'DEGAGEUR',             'DEGAGEUR',             'DEGAGEUR',             NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (15, 'OUTILS_DE_MESURE',     'OUTILS DE MESURE',     'OUTILS DE MESURE',     NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (16, 'MENUISERIE_ALUMINIUM', 'MENUISERIE ALUMINIUM', 'MENUISERIE ALUMINIUM', NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (17, 'VIBREUR',              'VIBREUR',              'VIBREUR',              NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (18, 'MENUISERIE_BOIS',      'MENUISERIE BOIS',      'MENUISERIE BOIS',      NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (19, 'SCIE_SAUTEUSE',        'SCIE SAUTEUSE',        'SCIE SAUTEUSE',        NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (20, 'POLISSEUSE',           'POLISSEUSE',           'POLISSEUSE',           NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (21, 'CISAILLE_ELECTRIQUE',  'CISAILLE ELECTRIQUE',  'CISAILLE ELECTRIQUE',  NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (22, 'SOUFFLEUR',            'SOUFFLEUR',            'SOUFFLEUR',            NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (23, 'LIGATUREUSE',          'LIGATUREUSE',          'LIGATUREUSE',          NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active'),
  (24, 'CISAILLE_MANUELLE',    'CISAILLE MANUELLE',    'CISAILLE MANUELLE',    NULL, 'LOGISTIQUE', 'OUTILLAGE', TRUE, 'Active')
ON CONFLICT (code) DO UPDATE SET
  legacy_id   = COALESCE(EXCLUDED.legacy_id, stock_categories.legacy_id),
  name        = EXCLUDED.name,
  nom         = EXCLUDED.nom,
  description = COALESCE(EXCLUDED.description, stock_categories.description),
  department  = EXCLUDED.department,
  stock_type  = EXCLUDED.stock_type,
  is_active   = EXCLUDED.is_active,
  statut      = EXCLUDED.statut,
  updated_at  = NOW();

NOTIFY pgrst, 'reload schema';

SELECT
  COUNT(*)::int AS total_categories,
  COUNT(*) FILTER (WHERE is_active)::int AS actives,
  COUNT(*) FILTER (WHERE NOT is_active)::int AS inactives
FROM public.stock_categories;
