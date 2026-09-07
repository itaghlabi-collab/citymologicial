-- CITYMO — Export Ouvriers externes (à coller dans Supabase → SQL Editor)
-- Puis : Results → Download CSV  (ouvrir ensuite dans Excel)

SELECT
  row_number() OVER (ORDER BY w.nom NULLS LAST, w.prenom NULLS LAST) AS n,
  w.prenom,
  w.nom,
  w.numero_cin AS cin,
  w.telephone,
  w.fonction,
  w.tarif,
  w.tarif_unite,
  CASE
    WHEN COALESCE(w.tarif_unite, 'heure') = 'heure' THEN ROUND((COALESCE(w.tarif, 0) * 8)::numeric, 2)
    WHEN w.tarif_unite = 'jour' THEN ROUND(COALESCE(w.tarif, 0)::numeric, 2)
    WHEN w.tarif_unite = 'semaine' THEN ROUND((COALESCE(w.tarif, 0) / 5)::numeric, 2)
    WHEN w.tarif_unite = 'mois' THEN ROUND((COALESCE(w.tarif, 0) / 26)::numeric, 2)
    ELSE ROUND(COALESCE(w.tarif, 0)::numeric, 2)
  END AS tarif_jour_mad,
  w.statut,
  w.disponibilite,
  COALESCE(p.nom, w.chantier) AS chantier,
  w.date_naissance,
  w.lieu_naissance,
  w.adresse,
  w.nationalite,
  w.etat_civil,
  w.sexe,
  w.groupe_sanguin,
  w.date_recrutement,
  w.date_expiration,
  w.experience,
  w.badge,
  w.contact_urgence,
  w.tel_urgence,
  w.relation_urgence,
  w.pointure,
  w.taille_vetement,
  w.taille_gants,
  w.casque,
  w.created_at,
  w.updated_at
FROM public.workers w
LEFT JOIN public.projects p ON p.id = w.project_id
ORDER BY w.nom NULLS LAST, w.prenom NULLS LAST;
