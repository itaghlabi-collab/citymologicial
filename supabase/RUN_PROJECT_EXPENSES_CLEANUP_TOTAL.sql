-- Nettoyage lignes TOTAL importées par erreur depuis Excel
-- Cas 1 : TOTAL explicite en désignation
-- Cas 2 : TOTAL en colonne DATE → importé comme "Dépense" avec montant = somme du projet

-- Cas 1
DELETE FROM public.project_expenses
WHERE origine = 'import_excel'
  AND (
    upper(trim(coalesce(element_depense, ''))) IN ('TOTAL', 'TOTAL GENERAL', 'TOTAL GENERALE')
    OR upper(trim(coalesce(categorie, ''))) IN ('TOTAL', 'TOTAL GENERAL', 'TOTAL GENERALE')
    OR upper(trim(coalesce(description, ''))) IN ('TOTAL', 'TOTAL GENERAL', 'TOTAL GENERALE')
  );

-- Cas 2 : faux "Dépense" = total du tableau (montant égal à la somme des autres lignes du projet)
DELETE FROM public.project_expenses pe
WHERE pe.origine = 'import_excel'
  AND pe.element_depense = 'Dépense'
  AND coalesce(pe.description, '') = ''
  AND coalesce(pe.fournisseur, '') = ''
  AND pe.project_id IS NOT NULL
  AND abs(
    pe.montant - (
      SELECT coalesce(sum(x.montant), 0)
      FROM public.project_expenses x
      WHERE x.project_id = pe.project_id
        AND x.id <> pe.id
        AND x.origine = 'import_excel'
        AND x.statut <> 'annule'
    )
  ) < 0.05;

-- Vérification
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
