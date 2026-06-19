-- SEED — 43 articles de stock CITYMO (outillage / matériel)
-- Exécuter dans Supabase SQL Editor après RUN_STOCK_CATEGORIES.sql et RUN_STOCK_ARTICLES_LEVELS.sql
-- Ne supprime ni ne tronque aucune donnée. Ignore les codes déjà présents.

INSERT INTO public.stock_articles (
  reference, nom, categorie, category_id, article_type,
  unite, prix_unitaire, seuil_alerte, etat, emplacement, statut
)
SELECT
  v.reference,
  v.nom,
  v.categorie,
  c.id,
  v.article_type,
  v.unite,
  v.prix_unitaire,
  v.seuil_alerte,
  COALESCE(NULLIF(trim(v.etat), ''), 'Neuf'),
  NULLIF(trim(v.emplacement), ''),
  'Active'
FROM (VALUES
  ('TYJ2X8GA', 'BURINEUR HILTI TE 70-AVR',                                         'BURINEUR',             'Matériel',     'U',   10000.00::numeric, 0::numeric, 'Neuf',    ''),
  ('76OPKI5L', 'CISAILLE BOSCH ELECTRIQUE-GSA120',                                  'CISAILLE ELECTRIQUE',  'Matériel',     'U',   2.03::numeric,     0::numeric, 'Utilisé', ''),
  ('B8TJTWS',  'CISAILLE CARRELAGE GRIS',                                          'CISAILLE MANUELLE',    'Outil',        'U',   NULL::numeric,     0::numeric, 'Neuf',    ''),
  ('8DZQH438', 'CISAILLE CARRELAGE ROUGE',                                         'CISAILLE MANUELLE',    'Outil',        'U',   NULL::numeric,     0::numeric, 'Utilisé', ''),
  ('OF2ACGUF', 'CROWN-CT31016',                                                    'CISAILLE ELECTRIQUE',  'Matériel',     'U',   NULL::numeric,     0::numeric, 'Neuf',    ''),
  ('HAWCORBT', 'DECOUPEUR A CARRELAGE BOSCH-GDC140PRO',                            'CISAILLE ELECTRIQUE',  'Outil',        'U',   899.00::numeric,   0::numeric, 'Neuf',    ''),
  ('CYGTQVP3', 'DEGAGEUR HILTI-TE 1000 AVR',                                       'DEGAGEUR',             'Matériel',     'U',   17.78::numeric,    0::numeric, 'Neuf',    ''),
  ('AB2I3NDP', 'DEGAGEUR HILTI-TE7',                                               'DEGAGEUR',             'Matériel',     'U',   13372.20::numeric, 0::numeric, 'Neuf',    ''),
  ('7OLC12Y4', 'DEGAGEUR HILTI-TE70-AVR',                                          'DEGAGEUR',             'Matériel',     'U',   14.99::numeric,    0::numeric, 'Neuf',    ''),
  ('BK7YH6TB', 'DEGAGEUR WISEUP-1250-W',                                           'DEGAGEUR',             'Matériel',     'U',   1900.00::numeric,  0::numeric, 'Neuf',    ''),
  ('ON1C47OX', 'DEGAGEUR-WISEUP- ART170906',                                       'DEGAGEUR',             'Matériel',     'U',   NULL::numeric,     0::numeric, 'Neuf',    ''),
  ('KOQ6G8FP', 'EINHELL POLISSEUSE-CC-PO 90',                                      'POLISSEUSE',           'Matériel',     'U',   900.00::numeric,   0::numeric, 'Neuf',    ''),
  ('AZLCRNO4', 'FLEXIBLE DE VIBREUR A BETON-VBS38/6M',                             'VIBREUR',              'Outil',        'U',   NULL::numeric,     0::numeric, 'Neuf',    ''),
  ('8FLS8W6M', 'FRAISEUSE CA5000XJ MAKITA',                                        'MENUISERIE ALUMINIUM', 'Matériel',     'U',   6750.00::numeric,  0::numeric, 'Neuf',    ''),
  ('LA0GDHIL', 'LIGATUREUSE TJEP 40',                                              'LIGATUREUSE',          'Outil',        'U',   605.50::numeric,   0::numeric, 'Neuf',    ''),
  ('G586A2UJ', 'MEASURING WHEEL BOSCH GWM-32',                                     'OUTILS DE MESURE',     'Outil',        'U',   999.00::numeric,   0::numeric, 'Neuf',    ''),
  ('IWDVYKJQ', 'MELANGEUR CROWN-CT10049',                                          'MELANGEUR',            'Matériel',     'U',   1225.00::numeric,  0::numeric, 'Utilisé', ''),
  ('XOLUVMN3', 'MELANGEUR MALAXEUR VITO VIMCC-1400A',                              'MELANGEUR',            'Matériel',     'U',   1459.00::numeric,  0::numeric, 'Neuf',    ''),
  ('CJG81X3L', 'MEULEUSE BOSCH GWS 220',                                           'MEULEUSE GM',          'Matériel',     'U',   1199.00::numeric,  0::numeric, 'Neuf',    ''),
  ('OOJB6JPW', 'MEULEUSE BOSCH SANS FIL GWS-180-LI',                                'MEULEUSE PM',          'Matériel',     'U',   6199.00::numeric,  0::numeric, 'Neuf',    ''),
  ('ITKIHMPO', 'MEULEUSE BOSCH-GWS9-125',                                          'MEULEUSE PM',          'Matériel',     'U',   1079.00::numeric,  0::numeric, 'Neuf',    ''),
  ('KRD7OOZO', 'MEULEUSE DROITE BOSCH-GGS500L',                                    'MEULEUSE PM',          'Matériel',     'U',   999.00::numeric,   0::numeric, 'Neuf',    ''),
  ('VLI2Q4WU', 'MEULEUSE HILTI AG 115-80D',                                        'MEULEUSE PM',          'Matériel',     'U',   690.00::numeric,   0::numeric, 'Neuf',    ''),
  ('LYNFZ4Y9', 'NIVEAU LASER-GLL3-80',                                             'OUTILS DE MESURE',     'Outil',        'U',   3.29::numeric,     0::numeric, 'Neuf',    ''),
  ('ZFJEUQRK', 'ODASSIA ODAPATE ENDUIT 25KG',                                      'PEINTURE',             'Consommable',  'sac', 123.60::numeric,   20::numeric,'Neuf',    ''),
  ('4CEQWO1M', 'ODASSIA ODAQUA VINYL 30KG',                                        'PEINTURE',             'Consommable',  'U',   345.50::numeric,   20::numeric,'Neuf',    ''),
  ('8T4U7RM5', 'PERCEUSE BOSCH GBM 1600 RE',                                       'PERCEUSE',             'Matériel',     'U',   1449.00::numeric,  0::numeric, 'Utilisé', ''),
  ('ZG1SM4T6', 'PERCEUSE BOSH GSB 16RE',                                           'PERCEUSE',             'Matériel',     'U',   759.00::numeric,   0::numeric, 'Neuf',    ''),
  ('5AFHCIY7', 'PERFORATEUR SANS FIL BOSCH GBH-180-LI',                            'PERFORATEUR',          'Matériel',     'U',   4800.00::numeric,  0::numeric, 'Utilisé', ''),
  ('KMSPWTK3', 'PERFORATEUR VITO 1500W',                                           'PERFORATEUR',          'Matériel',     'U',   6500.00::numeric,  0::numeric, 'Neuf',    ''),
  ('EANY3E8O', 'POLISSEUSE BOSCH GPO-14-CE',                                       'POLISSEUSE',           'Matériel',     'U',   2.06::numeric,     0::numeric, 'Neuf',    ''),
  ('PVGLODV5', 'PONCEUSE A PLATRE TELESCOPIQUE 710 VITO-VILGZT10-4569CL0082',      'PONCEUSE',             'Outil',        'U',   2750.00::numeric,  0::numeric, 'Neuf',    ''),
  ('OFYJFVSM', 'PONCEUSE VILG800-VITO',                                            'PONCEUSE',             'Outil',        'U',   1550.00::numeric,  0::numeric, 'Neuf',    ''),
  ('ROF52VTP', 'RAINUREUSE CROWN CT13551-110RSV',                                  'RAINUREUSE',           'Matériel',     'U',   NULL::numeric,     0::numeric, 'Neuf',    ''),
  ('1JZKT2SX', 'RAINUREUSE CROWN-CT13525-125',                                     'RAINUREUSE',           'Matériel',     'U',   1950.00::numeric,  0::numeric, 'Neuf',    ''),
  ('JVICG4HK', 'RAINUREUSE SPARKY-FK6526',                                         'RAINUREUSE',           'Outil',        'U',   1600.00::numeric,  0::numeric, 'Neuf',    ''),
  ('F59DEPMJ', 'SCIE SAUTEUSE -CT15189',                                           'SCIE SAUTEUSE',        'Matériel',     'U',   1.00::numeric,     0::numeric, 'Neuf',    ''),
  ('BQOJ8MDS', 'SCIE SUR TABLE-CT15209CROWN',                                      'MENUISERIE BOIS',      'Matériel',     'U',   3.18::numeric,     0::numeric, 'Neuf',    ''),
  ('RV4RL3FB', 'SOUFFLEUR BOSCH GBL 620',                                          'SOUFFLEUR',            'Matériel',     'U',   449.00::numeric,   0::numeric, 'Neuf',    ''),
  ('BQEDH9IR', 'TRONCONNEUSE-CT15111CROWN',                                        'MENUISERIE BOIS',      'Matériel',     'U',   2.35::numeric,     0::numeric, 'Neuf',    ''),
  ('RC7O5WH1', 'VIBREUR A BÉTON-ZN50FD',                                           'VIBREUR',              'Outil',        'U',   NULL::numeric,     0::numeric, 'Neuf',    'G3'),
  ('BOZ7LQ1W', 'VISSEUSE BOSCH PROFESSIONIAL GSB 185-LI',                          'VISSEUSE',             'Matériel',     'U',   1850.00::numeric,  0::numeric, 'Utilisé', 'F2'),
  ('7FVLT9HY', 'VISSEUSE HILTI SF 4-22 COF',                                       'VISSEUSE',             'Matériel',     'U',   5166.00::numeric,  0::numeric, 'Neuf',    'F2')
) AS v(reference, nom, categorie, article_type, unite, prix_unitaire, seuil_alerte, etat, emplacement)
LEFT JOIN public.stock_categories c
  ON lower(trim(c.name)) = lower(trim(v.categorie))
  OR lower(trim(c.nom))  = lower(trim(v.categorie))
  OR lower(trim(c.code)) = lower(replace(trim(v.categorie), ' ', '_'))
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_articles a
  WHERE lower(trim(a.reference)) = lower(trim(v.reference))
);

-- Vérification
SELECT
  COUNT(*)::int AS total_articles,
  COUNT(*) FILTER (WHERE category_id IS NOT NULL)::int AS avec_categorie,
  COUNT(*) FILTER (WHERE category_id IS NULL)::int AS sans_categorie
FROM public.stock_articles;

SELECT reference, nom, article_type, categorie, prix_unitaire, etat, emplacement
FROM public.stock_articles
ORDER BY nom
LIMIT 50;
