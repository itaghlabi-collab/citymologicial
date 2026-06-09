-- Ré-insérer les 12 dossiers départements si absents
-- Supabase → SQL Editor → Run

INSERT INTO public.document_folders (name, department, is_system, parent_id)
SELECT v.name, v.department, TRUE, NULL
FROM (VALUES
  ('COMMERCIAL',              'COMMERCIAL'),
  ('RESSOURCES HUMAINES',     'RESSOURCES HUMAINES'),
  ('ACHATS',                  'ACHATS'),
  ('MARKETING',               'MARKETING'),
  ('EXPLOITATION',            'EXPLOITATION'),
  ('COMPTABILITÉ',            'COMPTABILITÉ'),
  ('ADMINISTRATION',          'ADMINISTRATION'),
  ('SAV',                     'SAV'),
  ('LOGISTIQUE',              'LOGISTIQUE'),
  ('PROJETS',                 'PROJETS'),
  ('FINANCE & TRÉSORERIE',    'FINANCE & TRÉSORERIE'),
  ('DOCUMENTS GÉNÉRAUX',      'DOCUMENTS GÉNÉRAUX')
) AS v(name, department)
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_folders f
  WHERE f.parent_id IS NULL AND f.is_system = TRUE
    AND lower(trim(f.name)) = lower(trim(v.name))
    AND f.is_deleted = FALSE
);

-- Vérification
SELECT name, department, is_system FROM public.document_folders
WHERE is_system = TRUE AND is_deleted = FALSE
ORDER BY name;
