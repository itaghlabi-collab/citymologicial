-- CITYMO — Ajouter l''emplacement chantier AERONAUTICA RACINE
-- Idempotent. N''altère pas les autres emplacements.

INSERT INTO public.stock_warehouses (nom, type_depot, projet_lie, statut)
SELECT 'CHANTIER AERONAUTICA RACINE', 'Chantier', 'AERONAUTICA RACINE', 'Actif'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_warehouses
  WHERE upper(trim(nom)) = upper(trim('CHANTIER AERONAUTICA RACINE'))
);

NOTIFY pgrst, 'reload schema';

SELECT id, nom, type_depot, projet_lie, statut
FROM public.stock_warehouses
WHERE nom ILIKE '%AERONAUTICA%'
ORDER BY nom;
