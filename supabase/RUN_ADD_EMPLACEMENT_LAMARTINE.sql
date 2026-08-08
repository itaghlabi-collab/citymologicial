-- CITYMO — Ajouter l''emplacement chantier LAMARTINE
-- Idempotent. N''altère pas les autres emplacements.

INSERT INTO public.stock_warehouses (nom, type_depot, projet_lie, statut)
SELECT 'CHANTIER LAMARTINE', 'Chantier', 'LAMARTINE', 'Actif'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_warehouses
  WHERE upper(trim(nom)) = upper(trim('CHANTIER LAMARTINE'))
);

NOTIFY pgrst, 'reload schema';

SELECT id, nom, type_depot, projet_lie, statut
FROM public.stock_warehouses
WHERE nom ILIKE '%LAMARTINE%'
ORDER BY nom;
