-- Emplacement stock pour le projet WYCON MARINA SHOPPING (mouvement rapide, stocks, etc.)
INSERT INTO public.stock_warehouses (nom, type_depot, projet_lie, statut)
SELECT 'WYCON MARINA SHOPPING', 'Chantier', 'WYCON MARINA SHOPPING', 'Actif'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_warehouses
  WHERE lower(trim(nom)) = lower(trim('WYCON MARINA SHOPPING'))
);
