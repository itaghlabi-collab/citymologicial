-- Rattrapage project_expenses depuis le 1er juillet 2026
-- Idempotent : upsert via (source_type, source_id) — pas de doublons
-- À exécuter une fois sur Supabase si l'API Vercel n'est pas disponible

-- Dépenses générales liées (Payé, Validé, Comptabilisée) depuis 2026-07-01
INSERT INTO public.project_expenses (
  project_id, project_match_status, date_depense, categorie, element_depense,
  description, fournisseur, montant, observation, origine, source_type, source_id,
  statut, mode_paiement, montant_paye, date_paiement
)
SELECT
  COALESCE(c.project_id, p.id),
  'matched',
  c.date_charge,
  c.categorie,
  COALESCE(NULLIF(TRIM(c.libelle), ''), c.categorie, 'Charge'),
  c.commentaire,
  c.fournisseur,
  COALESCE(c.montant, 0),
  CASE WHEN c.ref_charge IS NOT NULL THEN 'Réf. ' || c.ref_charge END,
  'charge_manuelle',
  'finance_charge',
  c.id,
  'payee',
  c.mode_paiement,
  COALESCE(c.montant, 0),
  c.date_charge
FROM public.finance_charges c
LEFT JOIN public.projects p ON p.ref = NULLIF(TRIM(split_part(c.projet_lie, ' — ', 1)), '')
WHERE (c.project_id IS NOT NULL OR NULLIF(TRIM(c.projet_lie), '') IS NOT NULL)
  AND c.statut IN ('Payé', 'Validé', 'Validée', 'Comptabilisée', 'Comptabilisé')
  AND c.statut NOT IN ('Annulé', 'Refusé', 'Refusée', 'Brouillon')
  AND (c.date_charge >= '2026-07-01' OR c.created_at::date >= '2026-07-01')
  AND NOT EXISTS (
    SELECT 1 FROM public.project_expenses pe
    WHERE pe.source_type = 'finance_charge' AND pe.source_id = c.id
  );

-- Ordres de paiement Payés liés à un projet depuis 2026-07-01
INSERT INTO public.project_expenses (
  project_id, project_match_status, date_depense, categorie, element_depense,
  description, fournisseur, montant, origine, source_type, source_id,
  statut, payment_order_id, purchase_request_id, mode_paiement, montant_paye, date_paiement
)
SELECT
  o.project_id,
  'matched',
  COALESCE(o.date_paiement, o.date_ordre),
  CASE WHEN o.purchase_request_id IS NOT NULL THEN 'Demande d''achat' ELSE 'Ordre de paiement' END,
  COALESCE(NULLIF(TRIM(o.motif), ''), o.ref_ordre, 'Ordre de paiement'),
  COALESCE(o.commentaire, o.observation),
  COALESCE(o.fournisseur_lie, o.beneficiaire),
  COALESCE(o.montant_ttc, o.montant, 0),
  CASE WHEN o.purchase_request_id IS NOT NULL THEN 'achat' ELSE 'ordre_paiement' END,
  CASE WHEN o.purchase_request_id IS NOT NULL THEN 'purchase_request' ELSE 'payment_order' END,
  COALESCE(o.purchase_request_id, o.id),
  'payee',
  o.id,
  o.purchase_request_id,
  o.mode_paiement,
  COALESCE(o.montant_ttc, o.montant, 0),
  COALESCE(o.date_paiement, o.date_ordre)
FROM public.payment_orders o
WHERE o.project_id IS NOT NULL
  AND o.statut = 'Payé'
  AND (COALESCE(o.date_paiement, o.date_ordre) >= '2026-07-01' OR o.created_at::date >= '2026-07-01')
  AND NOT EXISTS (
    SELECT 1 FROM public.project_expenses pe
    WHERE pe.source_type = CASE WHEN o.purchase_request_id IS NOT NULL THEN 'purchase_request' ELSE 'payment_order' END
      AND pe.source_id = COALESCE(o.purchase_request_id, o.id)
  );

SELECT 'BACKFILL_PROJECT_EXPENSES OK' AS status;
