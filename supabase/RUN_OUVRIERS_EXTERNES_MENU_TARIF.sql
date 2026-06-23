-- =============================================================================
-- CITYMO ERP — Ouvriers externes : migration tarif horaire (ADD ONLY)
-- Exécuter dans Supabase SQL Editor — idempotent
--
-- Convertit les anciens tarifs journaliers (tarif_unite = 'jour') en tarif horaire :
--   nouveau tarif horaire = ancien tarif journalier / 8
-- Exemple : 160 MAD/jour → 20 MAD/heure
-- =============================================================================

BEGIN;

-- 1) Ouvriers : journalier → horaire
UPDATE public.workers
SET
  tarif = ROUND(tarif / 8.0, 2),
  tarif_unite = 'heure',
  updated_at = NOW()
WHERE COALESCE(tarif_unite, 'heure') = 'jour'
  AND tarif > 0;

-- 2) Normaliser l'unité horaire pour tous
UPDATE public.workers
SET tarif_unite = 'heure'
WHERE tarif_unite IS DISTINCT FROM 'heure';

-- 3) Paie hebdo : compléter tarif_horaire depuis tarif_journalier si absent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll' AND column_name = 'tarif_horaire'
  ) THEN
    UPDATE public.payroll
    SET tarif_horaire = ROUND(tarif_journalier / 8.0, 2)
    WHERE (tarif_horaire IS NULL OR tarif_horaire = 0)
      AND tarif_journalier > 0;

    UPDATE public.payroll
    SET tarif_journalier = ROUND(tarif_horaire * 8.0, 2)
    WHERE (tarif_journalier IS NULL OR tarif_journalier = 0)
      AND tarif_horaire > 0;
  END IF;
END $$;

COMMENT ON COLUMN public.workers.tarif IS 'Tarif horaire MAD/h (journée = 8 h, 09h–18h)';
COMMENT ON COLUMN public.workers.tarif_unite IS 'Unité de référence : heure (standard CITYMO)';

COMMIT;

-- Vérification
SELECT
  COUNT(*) FILTER (WHERE tarif_unite = 'heure') AS ouvriers_tarif_heure,
  COUNT(*) FILTER (WHERE tarif_unite = 'jour') AS ouvriers_tarif_jour_restants,
  ROUND(AVG(tarif)::numeric, 2) AS tarif_horaire_moyen
FROM public.workers
WHERE statut IS DISTINCT FROM 'archive';
