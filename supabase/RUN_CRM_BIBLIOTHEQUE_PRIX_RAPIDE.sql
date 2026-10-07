-- CITYMO — CRM › Bibliothèque de prix : chargement rapide
-- Fonction en LECTURE SEULE : vérifie les droits une seule fois puis renvoie toutes les lignes
-- article des devis + factures (hors factures d'acompte). Aucune table modifiée. Ré-exécutable.

DROP FUNCTION IF EXISTS public.crm_price_library_lines();

CREATE OR REPLACE FUNCTION public.crm_price_library_lines()
RETURNS TABLE (
  line_id      uuid,
  source       text,
  reference    text,
  doc_date     date,
  statut       text,
  client       text,
  designation  text,
  description  text,
  categorie    text,
  unite        text,
  quantite     numeric,
  prix_ht      numeric,
  remise       numeric,
  tva          numeric,
  total_ht     numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.erp_can('voir', 'bibliotheque-prix') OR public.erp_can('voir', 'devis')) THEN
    RAISE EXCEPTION 'Accès refusé à la bibliothèque de prix' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT x.* FROM (
    SELECT l.id, 'Devis'::text, d.reference, d.date_creation, d.statut,
           NULLIF(TRIM(CONCAT_WS(' ', c.prenom, c.nom)), ''),
           l.designation, l.description, cat.nom, l.unite,
           l.quantite::numeric, l.prix_ht::numeric, l.remise::numeric, l.tva::numeric, l.total_ht::numeric
    FROM public.crm_devis_lignes l
    JOIN public.crm_devis d ON d.id = l.devis_id
    LEFT JOIN public.clients c ON c.id = d.client_id
    LEFT JOIN public.categories cat ON cat.id = l.categorie_id
    WHERE COALESCE(l.type, 'article') = 'article'
      AND NULLIF(TRIM(l.designation), '') IS NOT NULL
    UNION ALL
    SELECT l.id, 'Facture'::text, f.numero, f.date_emission, f.statut,
           NULLIF(TRIM(CONCAT_WS(' ', c.prenom, c.nom)), ''),
           l.designation, l.description, cat.nom, l.unite,
           l.quantite::numeric, l.prix_ht::numeric, l.remise::numeric, l.tva::numeric, l.total_ht::numeric
    FROM public.crm_facture_lignes l
    JOIN public.crm_factures f ON f.id = l.facture_id
    LEFT JOIN public.clients c ON c.id = f.client_id
    LEFT JOIN public.categories cat ON cat.id = l.categorie_id
    WHERE COALESCE(l.type, 'article') = 'article'
      AND NULLIF(TRIM(l.designation), '') IS NOT NULL
      AND COALESCE(f.type, '') <> 'acompte'
      AND COALESCE(f.numero, '') NOT ILIKE 'AC-%'
  ) AS x
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_price_library_lines() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'crm_price_library_lines OK' AS status;
