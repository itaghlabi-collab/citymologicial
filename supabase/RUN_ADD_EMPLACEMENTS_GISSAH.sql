-- CITYMO — Ajouter emplacements GISSAH (Mouvement rapide / Dépôts)
-- Supabase → SQL Editor → Run (idempotent)

INSERT INTO public.stock_warehouses (nom, type_depot, statut)
SELECT v.nom, v.type_depot, 'Actif'
FROM (
  VALUES
    ('GISSAH KIOSQUES', 'Autre'),
    ('GISSAH STORE MOROCCO MALL', 'Autre')
) AS v(nom, type_depot)
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_warehouses w
  WHERE lower(trim(w.nom)) = lower(trim(v.nom))
);

SELECT nom, type_depot, statut
FROM public.stock_warehouses
WHERE nom ILIKE 'GISSAH%'
ORDER BY nom;
