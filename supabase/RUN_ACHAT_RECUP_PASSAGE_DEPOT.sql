-- CITYMO — Demande de récupération : passage par le dépôt (Oui / Non)
-- Additif uniquement : une colonne, aucune donnée existante modifiée. Ré-exécutable.

ALTER TABLE public.achat_demandes_recuperation
  ADD COLUMN IF NOT EXISTS passage_depot BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

SELECT 'achat_recup_passage_depot OK' AS status;
