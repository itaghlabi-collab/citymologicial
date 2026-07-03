-- Supprimer les lignes TOTAL importées par erreur depuis Excel
-- (ligne de synthèse du tableau, pas une dépense réelle)

DELETE FROM public.project_expenses
WHERE origine = 'import_excel'
  AND (
    upper(trim(coalesce(element_depense, ''))) IN ('TOTAL', 'TOTAL GENERAL', 'TOTAL GENERALE')
    OR upper(trim(coalesce(categorie, ''))) IN ('TOTAL', 'TOTAL GENERAL', 'TOTAL GENERALE')
    OR upper(trim(coalesce(description, ''))) IN ('TOTAL', 'TOTAL GENERAL', 'TOTAL GENERALE')
  );

-- Vérification : totaux par projet après nettoyage
SELECT
  p.nom AS projet,
  count(pe.id) AS nb_depenses,
  round(coalesce(sum(pe.montant), 0)::numeric, 2) AS total_depenses
FROM public.projects p
LEFT JOIN public.project_expenses pe
  ON pe.project_id = p.id
  AND pe.statut <> 'annule'
  AND pe.origine = 'import_excel'
GROUP BY p.id, p.nom
HAVING count(pe.id) > 0
ORDER BY total_depenses DESC;
